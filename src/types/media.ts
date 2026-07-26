export type MediaKind = 'image' | 'svg' | 'audio' | 'video' | 'poster'

export interface MediaAsset {
  path: string
  publicUrl: string
  size: number
  mimeType: string
  extension: string
  originalName: string
}

export interface MediaUploadProgress {
  loaded: number
  total: number
  percentage: number
}
