export class ExportImageDownloadError extends Error {
  source: string
  downloadCause?: unknown

  constructor(source: string, cause?: unknown) {
    super('export_image_download_failed')
    this.source = source
    this.downloadCause = cause
  }
}

const isBase64Image = (source: string) => /^data:image\/[^;,]+(?:;[^,]*)?;base64,/i.test(source)
const isHttpImage = (source: string) => /^https?:\/\//i.test(source)

const blobToDataUrl = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const chunks: string[] = []
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)))
  }
  return `data:${blob.type};base64,${btoa(chunks.join(''))}`
}

const responseToImageDataUrl = async (response: Response) => {
  if (!response.ok) throw new Error(`image_download_http_${response.status}`)
  const blob = await response.blob()
  if (!blob.type.toLowerCase().startsWith('image/')) throw new Error('downloaded_resource_is_not_an_image')
  return blobToDataUrl(blob)
}

interface ExportImageResolverOptions {
  fetcher?: typeof fetch
  proxyPath?: string
}

export const createExportImageResolver = (options: ExportImageResolverOptions = {}) => {
  const fetcher = options.fetcher || fetch
  const proxyPath = options.proxyPath || '/api/cloud/export/image'
  const cache = new Map<string, Promise<string>>()

  const download = async (source: string) => {
    if (isBase64Image(source)) return source

    try {
      const response = await fetcher(source, { credentials: 'same-origin' })
      return await responseToImageDataUrl(response)
    }
    catch (directError) {
      if (!isHttpImage(source)) throw new ExportImageDownloadError(source, directError)
      try {
        const query = new URLSearchParams({ source })
        const response = await fetcher(`${proxyPath}?${query}`, { credentials: 'same-origin' })
        return await responseToImageDataUrl(response)
      }
      catch (proxyError) {
        throw new ExportImageDownloadError(source, proxyError)
      }
    }
  }

  return (source: string) => {
    let pending = cache.get(source)
    if (!pending) {
      pending = download(source)
      cache.set(source, pending)
    }
    return pending
  }
}

export const preloadExportImages = async (sources: Iterable<string>, concurrency = 4) => {
  const uniqueSources = [...new Set([...sources].filter(Boolean))]
  const resolveImage = createExportImageResolver()
  const images = new Map<string, string>()
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < uniqueSources.length) {
      const source = uniqueSources[nextIndex++]
      images.set(source, await resolveImage(source))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, uniqueSources.length) }, worker))
  return images
}
