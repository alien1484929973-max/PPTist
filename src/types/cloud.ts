import type { Slide, SlideTheme } from './slides'
import type { PresentationDocument } from '@pptist/presentation-core'

export interface CloudUser {
  id: number
  username: string
}

export type PresentationContent = PresentationDocument<Slide, SlideTheme>

export interface CloudDocumentSummary {
  id: string
  title: string
  slideCount: number
  revision: number
  createdAt: string
  updatedAt: string
}

export interface CloudDocument extends CloudDocumentSummary {
  content: PresentationContent
}

export type CloudAuthStatus = 'checking' | 'authenticated' | 'unauthenticated'
export type CloudSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'

export interface MediaSettings {
  configured: boolean
  maskedKey: string
  publicBaseUrl: string
  updatedAt?: string
  error?: string
}
