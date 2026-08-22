import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'

const maxBytes = Number(process.env.PPTIST_EXPORT_IMAGE_MAX_BYTES || 25 * 1024 * 1024)
const timeoutMs = Number(process.env.PPTIST_EXPORT_IMAGE_TIMEOUT_MS || 15_000)
const maxRedirects = 4

const exportImageError = (message, status, cause) => {
  const error = new Error(message)
  error.status = status
  error.cause = cause
  return error
}

const parseIPv4 = value => {
  const parts = value.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return parts
}

const parseIPv6 = value => {
  let source = String(value || '').toLowerCase().split('%', 1)[0]
  const ipv4Match = source.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/)
  if (ipv4Match) {
    const ipv4 = parseIPv4(ipv4Match[1])
    if (!ipv4) return null
    source = source.slice(0, -ipv4Match[1].length)
      + `${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`
  }
  const halves = source.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null
  const groups = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right]
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null
  return groups.map(group => Number.parseInt(group, 16))
}

const isPrivateIPv4 = address => {
  const parts = parseIPv4(address)
  if (!parts) return true
  const [a, b, c] = parts
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224
}

const isPrivateIPv6 = address => {
  const groups = parseIPv6(address)
  if (!groups) return true
  const allZero = groups.every(group => group === 0)
  const loopback = groups.slice(0, 7).every(group => group === 0) && groups[7] === 1
  if (allZero || loopback) return true
  if ((groups[0] & 0xfe00) === 0xfc00) return true
  if ((groups[0] & 0xffc0) === 0xfe80) return true
  if ((groups[0] & 0xff00) === 0xff00) return true
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every(group => group === 0)) return true

  const ipv4Mapped = groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff
  const ipv4Compatible = groups.slice(0, 6).every(group => group === 0)
  if (ipv4Mapped || ipv4Compatible) {
    const ipv4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`
    return isPrivateIPv4(ipv4)
  }
  return false
}

export const isPrivateAddress = address => {
  if (isIP(address) === 4) return isPrivateIPv4(address)
  if (isIP(address) === 6) return isPrivateIPv6(address)
  return true
}

export const parseExportImageUrl = value => {
  let url
  try {
    url = new URL(String(value || ''))
  }
  catch {
    throw exportImageError('invalid_export_image_url', 400)
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw exportImageError('invalid_export_image_url', 400)
  }
  if ((url.protocol === 'http:' && url.port && url.port !== '80')
    || (url.protocol === 'https:' && url.port && url.port !== '443')) {
    throw exportImageError('blocked_export_image_port', 400)
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!hostname
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
    || hostname.endsWith('.home.arpa')) {
    throw exportImageError('blocked_export_image_host', 400)
  }
  if (isIP(hostname) && isPrivateAddress(hostname)) {
    throw exportImageError('blocked_export_image_host', 400)
  }
  return url
}

const resolvePublicAddresses = async hostname => {
  let addresses
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  }
  catch {
    throw exportImageError('export_image_host_unreachable', 502)
  }
  if (!addresses.length || addresses.some(result => isPrivateAddress(result.address))) {
    throw exportImageError('blocked_export_image_host', 400)
  }
  return addresses
}

const detectImageType = (header, body) => {
  const contentType = String(header || '').split(';', 1)[0].trim().toLowerCase()
  if (contentType.startsWith('image/')) return contentType
  if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'image/jpeg'
  if (body.subarray(0, 6).toString('ascii') === 'GIF87a' || body.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif'
  if (body.subarray(0, 2).toString('ascii') === 'BM') return 'image/bmp'
  if (body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  if (body.subarray(4, 12).toString('ascii').includes('ftypavif')) return 'image/avif'
  const prefix = body.subarray(0, 512).toString('utf8').trimStart()
  if (prefix.startsWith('<svg') || (prefix.startsWith('<?xml') && prefix.includes('<svg'))) return 'image/svg+xml'
  return ''
}

const readResponse = response => new Promise((resolve, reject) => {
  const declaredLength = Number(response.headers['content-length'])
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    response.resume()
    reject(exportImageError('export_image_too_large', 413))
    return
  }
  const chunks = []
  let size = 0
  response.on('data', chunk => {
    size += chunk.length
    if (size > maxBytes) {
      response.destroy(exportImageError('export_image_too_large', 413))
      return
    }
    chunks.push(chunk)
  })
  response.on('end', () => resolve(Buffer.concat(chunks)))
  response.on('error', reject)
})

const requestImageAtAddress = (url, resolved, redirectCount) => {
  const requester = url.protocol === 'https:' ? httpsRequest : httpRequest
  const hostname = url.hostname.replace(/^\[|\]$/g, '')

  return new Promise((resolve, reject) => {
    const request = requester(url, {
      method: 'GET',
      servername: isIP(hostname) ? undefined : hostname,
      headers: {
        Accept: 'image/*',
        'Accept-Encoding': 'identity',
        'User-Agent': 'PPTist/2.0 image exporter',
      },
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, [resolved])
        else callback(null, resolved.address, resolved.family)
      },
      autoSelectFamily: false,
    }, async response => {
      const status = response.statusCode || 0
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.resume()
        if (redirectCount >= maxRedirects) {
          reject(exportImageError('export_image_too_many_redirects', 502))
          return
        }
        try {
          resolve(await requestImage(new URL(response.headers.location, url).toString(), redirectCount + 1))
        }
        catch (error) {
          reject(error)
        }
        return
      }
      if (status !== 200) {
        response.resume()
        reject(exportImageError('export_image_download_failed', 502))
        return
      }
      try {
        const body = await readResponse(response)
        const contentType = detectImageType(response.headers['content-type'], body)
        if (!contentType) throw exportImageError('unsupported_export_image', 415)
        resolve({ body, contentType })
      }
      catch (error) {
        reject(error)
      }
    })
    request.setTimeout(timeoutMs, () => {
      const error = exportImageError('export_image_timeout', 504)
      error.retryAddress = true
      request.destroy(error)
    })
    request.on('error', error => {
      if (error?.status) {
        reject(error)
        return
      }
      const wrapped = exportImageError('export_image_download_failed', 502, error)
      wrapped.retryAddress = true
      reject(wrapped)
    })
    request.end()
  })
}

const requestImage = async (source, redirectCount = 0) => {
  const url = parseExportImageUrl(source)
  const addresses = await resolvePublicAddresses(url.hostname.replace(/^\[|\]$/g, ''))
  let lastError
  for (const address of addresses) {
    try {
      return await requestImageAtAddress(url, address, redirectCount)
    }
    catch (error) {
      lastError = error
      if (!error?.retryAddress) throw error
    }
  }
  throw lastError || exportImageError('export_image_download_failed', 502)
}

export const downloadExportImage = source => requestImage(source)
