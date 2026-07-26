import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const apiBase = process.env.PPTIST_MEDIA_API_BASE || 'https://media.kjxs.site/api'
const publicBase = process.env.PPTIST_MEDIA_PUBLIC_BASE || 'https://media.kjxs.site'

const MEDIA_KINDS = {
  image: {
    directory: 'images',
    maxBytes: Number(process.env.PPTIST_MEDIA_MAX_IMAGE_BYTES || 25 * 1024 * 1024),
    extensions: new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif']),
  },
  svg: {
    directory: 'svg',
    maxBytes: Number(process.env.PPTIST_MEDIA_MAX_SVG_BYTES || 5 * 1024 * 1024),
    extensions: new Set(['svg']),
  },
  audio: {
    directory: 'audio',
    maxBytes: Number(process.env.PPTIST_MEDIA_MAX_AUDIO_BYTES || 200 * 1024 * 1024),
    extensions: new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma']),
  },
  video: {
    directory: 'video',
    maxBytes: Number(process.env.PPTIST_MEDIA_MAX_VIDEO_BYTES || 2 * 1024 * 1024 * 1024),
    extensions: new Set(['mp4', 'webm', 'mov', 'm4v', 'avi', 'wmv']),
  },
  poster: {
    directory: 'posters',
    maxBytes: Number(process.env.PPTIST_MEDIA_MAX_IMAGE_BYTES || 25 * 1024 * 1024),
    extensions: new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif']),
  },
}

const MIME_EXTENSIONS = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
  ['image/bmp', 'bmp'],
  ['image/avif', 'avif'],
  ['image/svg+xml', 'svg'],
  ['audio/mpeg', 'mp3'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/ogg', 'ogg'],
  ['audio/mp4', 'm4a'],
  ['audio/aac', 'aac'],
  ['audio/flac', 'flac'],
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['video/quicktime', 'mov'],
  ['video/x-msvideo', 'avi'],
  ['video/x-ms-wmv', 'wmv'],
])

const normalizeBase = value => String(value || '').replace(/\/+$/, '')
const encodeMediaPath = path => path.split('/').map(segment => encodeURIComponent(segment)).join('/')
const mediaApiUrl = path => `${normalizeBase(apiBase)}/${String(path || '').replace(/^\/+/, '')}`
const publicMediaUrl = path => `${normalizeBase(publicBase)}/${encodeMediaPath(path)}`

let cachedSecret
const credentialSecret = () => {
  if (cachedSecret) return cachedSecret
  let secret = process.env.PPTIST_MEDIA_CREDENTIAL_SECRET || ''
  if (!secret) {
    const file = process.env.PPTIST_MEDIA_CREDENTIAL_SECRET_FILE || '/etc/pptist-cloud/media-credential-secret'
    try {
      secret = readFileSync(file, 'utf8').trim()
    }
    catch {
      const error = new Error('media_credential_secret_missing')
      error.status = 503
      throw error
    }
  }
  if (secret.length < 32) {
    const error = new Error('media_credential_secret_invalid')
    error.status = 503
    throw error
  }
  cachedSecret = createHash('sha256').update(secret).digest()
  return cachedSecret
}

const encryptApiKey = apiKey => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', credentialSecret(), iv)
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

const decryptApiKey = value => {
  const [version, iv, tag, encrypted] = String(value || '').split('.')
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('media_credential_invalid')
  const decipher = createDecipheriv('aes-256-gcm', credentialSecret(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

const credentialRow = async (pool, userId) => {
  const result = await pool.query(
    'SELECT encrypted_api_key, updated_at FROM user_media_credentials WHERE user_id = $1',
    [userId],
  )
  return result.rows[0] || null
}

export const getMediaSettings = async (pool, userId) => {
  const row = await credentialRow(pool, userId)
  if (!row) return { configured: false, maskedKey: '', publicBaseUrl: normalizeBase(publicBase) }
  let apiKey
  try {
    apiKey = decryptApiKey(row.encrypted_api_key)
  }
  catch {
    return { configured: false, maskedKey: '', publicBaseUrl: normalizeBase(publicBase), error: 'credential_unreadable' }
  }
  return {
    configured: true,
    maskedKey: `${'•'.repeat(Math.min(12, Math.max(4, apiKey.length - 4)))}${apiKey.slice(-4)}`,
    publicBaseUrl: normalizeBase(publicBase),
    updatedAt: row.updated_at,
  }
}

const validateApiKey = async apiKey => {
  let response
  try {
    response = await fetch(mediaApiUrl('fs/?json'), {
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(10_000),
    })
  }
  catch {
    const error = new Error('media_service_unavailable')
    error.status = 502
    throw error
  }
  await response.body?.cancel().catch(() => undefined)
  if (response.status === 401 || response.status === 403) {
    const error = new Error('media_api_key_invalid')
    error.status = 400
    throw error
  }
  if (!response.ok) {
    const error = new Error('media_service_unavailable')
    error.status = 502
    throw error
  }
}

export const saveMediaCredential = async (pool, userId, value) => {
  const apiKey = String(value || '').trim()
  if (apiKey.length < 16 || apiKey.length > 512) {
    const error = new Error('invalid_media_api_key')
    error.status = 400
    throw error
  }
  await validateApiKey(apiKey)
  const encrypted = encryptApiKey(apiKey)
  await pool.query(`
    INSERT INTO user_media_credentials (user_id, encrypted_api_key, created_at, updated_at)
    VALUES ($1, $2, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET encrypted_api_key = EXCLUDED.encrypted_api_key, updated_at = NOW()
  `, [userId, encrypted])
  return getMediaSettings(pool, userId)
}

export const deleteMediaCredential = async (pool, userId) => {
  await pool.query('DELETE FROM user_media_credentials WHERE user_id = $1', [userId])
}

const slug = (value, fallback, maxLength = 48) => {
  const normalized = String(value || '').normalize('NFC')
    .replace(/[\\/<>:"|?*]/g, '-')
    .split('')
    .map(character => character.charCodeAt(0) < 32 ? '-' : character)
    .join('')
    .replace(/\s+/g, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, maxLength)
  return normalized || fallback
}

const ensureMediaPrefix = async (pool, user, documentId) => {
  const current = await pool.query(`
    SELECT media_prefix FROM presentations
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
  `, [documentId, user.id])
  const document = current.rows[0]
  if (!document) {
    const error = new Error('not_found')
    error.status = 404
    throw error
  }
  if (document.media_prefix) return document.media_prefix

  const prefix = `pptist/${slug(user.username, `user-${user.id}`)}/ppt-${documentId.slice(0, 8)}`
  const updated = await pool.query(`
    UPDATE presentations SET media_prefix = $1
    WHERE id = $2 AND user_id = $3 AND media_prefix IS NULL AND deleted_at IS NULL
    RETURNING media_prefix
  `, [prefix, documentId, user.id])
  if (updated.rowCount) return updated.rows[0].media_prefix
  const raced = await pool.query(
    'SELECT media_prefix FROM presentations WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [documentId, user.id],
  )
  return raced.rows[0]?.media_prefix || prefix
}

const extensionFromName = name => {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/)
  return match?.[1] || ''
}

const uploadDescriptor = (url, headers) => {
  const kind = String(url.searchParams.get('kind') || '')
  const config = MEDIA_KINDS[kind]
  if (!config) {
    const error = new Error('invalid_media_kind')
    error.status = 400
    throw error
  }
  const originalName = String(url.searchParams.get('filename') || 'media')
  const contentType = String(headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase()
  const mimeExtension = MIME_EXTENSIONS.get(contentType) || ''
  const nameExtension = extensionFromName(originalName)
  const extension = config.extensions.has(mimeExtension)
    ? mimeExtension
    : config.extensions.has(nameExtension) ? nameExtension : ''
  if (!extension || (kind === 'svg' && contentType && contentType !== 'image/svg+xml' && contentType !== 'application/octet-stream')) {
    const error = new Error('unsupported_media_type')
    error.status = 415
    throw error
  }
  const rawLength = headers['content-length']
  const contentLength = Number(rawLength)
  if (!rawLength || !Number.isSafeInteger(contentLength) || contentLength <= 0) {
    const error = new Error('content_length_required')
    error.status = 411
    throw error
  }
  if (contentLength > config.maxBytes) {
    const error = new Error('media_too_large')
    error.status = 413
    throw error
  }
  const originalStem = String(originalName).replace(/\.[^.]+$/, '')
  const storedName = `${randomUUID().slice(0, 8)}--${slug(originalStem, kind, 60)}.${extension}`
  return { kind, config, contentType: contentType || 'application/octet-stream', contentLength, storedName, extension }
}

export const uploadDocumentMedia = async ({ req, pool, user, documentId, requestUrl }) => {
  const row = await credentialRow(pool, user.id)
  if (!row) {
    const error = new Error('media_not_configured')
    error.status = 409
    throw error
  }
  let apiKey
  try {
    apiKey = decryptApiKey(row.encrypted_api_key)
  }
  catch {
    const error = new Error('media_credential_unreadable')
    error.status = 409
    throw error
  }

  const descriptor = uploadDescriptor(requestUrl, req.headers)
  const mediaPrefix = await ensureMediaPrefix(pool, user, documentId)
  const path = `${mediaPrefix}/${descriptor.config.directory}/${descriptor.storedName}`
  const controller = new AbortController()
  req.once('aborted', () => controller.abort())

  let response
  try {
    response = await fetch(mediaApiUrl(`upload/${encodeMediaPath(path)}`), {
      method: 'PUT',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': descriptor.contentType,
        'Content-Length': String(descriptor.contentLength),
      },
      body: req,
      duplex: 'half',
      signal: controller.signal,
    })
  }
  catch (cause) {
    if (controller.signal.aborted) {
      const error = new Error('upload_aborted')
      error.status = 499
      throw error
    }
    const error = new Error('media_upload_failed')
    error.status = 502
    error.cause = cause
    throw error
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok || response.status !== 201 || data.success !== true) {
    const error = new Error(response.status === 401 || response.status === 403
      ? 'media_credential_rejected'
      : 'media_upload_failed')
    error.status = response.status === 401 || response.status === 403 ? 409 : 502
    throw error
  }

  return {
    success: true,
    asset: {
      path,
      publicUrl: publicMediaUrl(path),
      size: Number(data.size || descriptor.contentLength),
      mimeType: descriptor.contentType,
      extension: descriptor.extension,
      originalName: String(requestUrl.searchParams.get('filename') || descriptor.storedName),
    },
  }
}
