import { useDocumentsStore } from '@/store'
import { uploadMedia } from '@/services/media'
import type { MediaKind, MediaUploadProgress } from '@/types/media'

const imageKind = (file: Blob, filename = ''): MediaKind => {
  const name = filename || (file instanceof File ? file.name : '')
  return file.type === 'image/svg+xml' || /\.svg$/i.test(name) ? 'svg' : 'image'
}

export default () => {
  const documentsStore = useDocumentsStore()

  const upload = (
    file: Blob,
    kind: MediaKind,
    options: {
      filename?: string
      signal?: AbortSignal
      onProgress?: (progress: MediaUploadProgress) => void
    } = {},
  ) => {
    if (!documentsStore.activeDocumentId) throw new Error('active_document_missing')
    return uploadMedia(documentsStore.activeDocumentId, file, {
      kind,
      ...options,
    })
  }

  const uploadImage = (file: Blob, options: Parameters<typeof upload>[2] = {}) => {
    return upload(file, imageKind(file, options.filename), options)
  }

  return {
    upload,
    uploadImage,
  }
}
