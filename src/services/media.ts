import type { MediaAsset, MediaKind, MediaUploadProgress } from '@/types/media'
import type { PresentationContent } from '@/types/cloud'
import type { PPTElement } from '@/types/slides'

let pendingUploads = 0

export const hasPendingMediaUploads = () => pendingUploads > 0

export class MediaUploadError extends Error {
  status: number
  code: string

  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

interface UploadMediaOptions {
  kind: MediaKind
  filename?: string
  signal?: AbortSignal
  onProgress?: (progress: MediaUploadProgress) => void
}

export const uploadMedia = (
  documentId: string,
  file: Blob,
  options: UploadMediaOptions,
): Promise<MediaAsset> => {
  const filename = options.filename || (file instanceof File ? file.name : 'media')
  const query = new URLSearchParams({ kind: options.kind, filename })

  pendingUploads++
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let settled = false

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      pendingUploads = Math.max(0, pendingUploads - 1)
      options.signal?.removeEventListener('abort', abort)
      callback()
    }
    const abort = () => xhr.abort()

    xhr.open('PUT', `/api/cloud/documents/${encodeURIComponent(documentId)}/media?${query}`)
    xhr.withCredentials = true
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.addEventListener('progress', event => {
      if (!event.lengthComputable) return
      options.onProgress?.({
        loaded: event.loaded,
        total: event.total,
        percentage: Math.round(event.loaded / event.total * 100),
      })
    })
    xhr.addEventListener('load', () => {
      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(xhr.responseText) as Record<string, unknown>
      }
      catch {
        // The typed error below is more useful than leaking a malformed upstream response.
      }
      if (xhr.status === 201 && data.success === true && data.asset) {
        finish(() => resolve(data.asset as MediaAsset))
        return
      }
      finish(() => reject(new MediaUploadError(xhr.status, String(data.error || 'media_upload_failed'))))
    })
    xhr.addEventListener('error', () => finish(() => reject(new MediaUploadError(0, 'network_error'))))
    xhr.addEventListener('abort', () => finish(() => reject(new MediaUploadError(0, 'upload_aborted'))))

    if (options.signal?.aborted) {
      finish(() => reject(new MediaUploadError(0, 'upload_aborted')))
      return
    }
    options.signal?.addEventListener('abort', abort, { once: true })
    xhr.send(file)
  })
}

export const mediaUploadErrorMessage = (error: unknown) => {
  if (!(error instanceof MediaUploadError)) return '媒体上传失败，请稍后重试'
  if (error.code === 'media_not_configured') return '请先在“我的文稿 → 媒体中心”绑定API Key'
  if (error.code === 'media_credential_unreadable' || error.code === 'media_credential_rejected') return '媒体中心凭据失效，请重新绑定API Key'
  if (error.code === 'unsupported_media_type') return '暂不支持该媒体格式'
  if (error.code === 'media_too_large') return '媒体文件超过允许的大小'
  if (error.code === 'upload_aborted') return '媒体上传已取消'
  if (error.code === 'transient_media_unreadable') return '文稿中的临时媒体已经失效，请重新选择文件或重新导入PPTX'
  if (error.code === 'not_found') return '当前云文稿不存在，无法建立媒体目录'
  return '媒体上传失败，请检查网络和媒体中心状态'
}

const isTransientMediaUrl = (value: unknown): value is string => {
  return typeof value === 'string' && /^(?:data:|blob:)/i.test(value)
}

const extensionForMime = (mimeType: string, fallback: string) => {
  const extensions: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  }
  return extensions[mimeType] || fallback
}

export const materializePresentationMedia = async (
  documentId: string,
  content: PresentationContent,
) => {
  const tasks: Array<() => Promise<void>> = []
  const cached = new Map<string, Promise<MediaAsset>>()

  const queue = (
    source: unknown,
    kind: MediaKind,
    fallbackExtension: string,
    apply: (publicUrl: string) => void,
  ) => {
    if (!isTransientMediaUrl(source)) return
    tasks.push(async () => {
      const key = `${kind}:${source}`
      let pending = cached.get(key)
      if (!pending) {
        pending = (async () => {
          let response: Response
          try {
            response = await fetch(source)
          }
          catch {
            throw new MediaUploadError(0, 'transient_media_unreadable')
          }
          if (!response.ok) throw new MediaUploadError(response.status, 'transient_media_unreadable')
          const blob = await response.blob()
          const actualKind: MediaKind = kind === 'image' && blob.type === 'image/svg+xml' ? 'svg' : kind
          const extension = extensionForMime(blob.type, fallbackExtension)
          return uploadMedia(documentId, blob, {
            kind: actualKind,
            filename: `legacy-${actualKind}.${extension}`,
          })
        })()
        cached.set(key, pending)
      }
      apply((await pending).publicUrl)
    })
  }

  for (const slide of content.slides) {
    if (slide.background?.type === 'image' && slide.background.image) {
      queue(slide.background.image.src, 'image', 'png', value => slide.background!.image!.src = value)
    }
    for (const element of slide.elements as PPTElement[]) {
      if (element.type === 'image') queue(element.src, 'image', 'png', value => element.src = value)
      else if (element.type === 'shape' && element.pattern) queue(element.pattern, 'image', 'png', value => element.pattern = value)
      else if (element.type === 'video') {
        queue(element.src, 'video', element.ext || 'mp4', value => element.src = value)
        if (element.poster) queue(element.poster, 'poster', 'jpg', value => element.poster = value)
      }
      else if (element.type === 'audio') queue(element.src, 'audio', element.ext || 'mp3', value => element.src = value)
    }
  }

  let nextTask = 0
  const worker = async () => {
    while (nextTask < tasks.length) {
      const task = tasks[nextTask++]
      await task()
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, tasks.length) }, worker))
  return tasks.length
}
