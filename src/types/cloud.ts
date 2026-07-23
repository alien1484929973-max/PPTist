import type { Slide, SlideTheme } from './slides'

export interface CloudUser {
  id: number
  username: string
}

export interface PresentationContent {
  schemaVersion: 1
  title: string
  width: number
  height: number
  theme: SlideTheme
  slides: Slide[]
  lastSlideIndex: number
}

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
