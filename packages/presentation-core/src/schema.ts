import { CURRENT_PRESENTATION_SCHEMA_VERSION } from './types'

export interface PresentationDocument<TSlide = unknown, TTheme = unknown> {
  schemaVersion: typeof CURRENT_PRESENTATION_SCHEMA_VERSION
  title: string
  width: number
  height: number
  theme: TTheme
  slides: TSlide[]
  lastSlideIndex: number
}

export interface PresentationDefaults<TSlide, TTheme> {
  title: string
  width: number
  height: number
  theme: TTheme
  slides: TSlide[]
}

/** Upgrade legacy cloud/editor documents without coupling the schema to Vue. */
export const migratePresentationDocument = <TSlide, TTheme>(
  input: unknown,
  defaults: PresentationDefaults<TSlide, TTheme>,
): PresentationDocument<TSlide, TTheme> => {
  const source = input && typeof input === 'object'
    ? input as Partial<PresentationDocument<TSlide, TTheme>>
    : {}
  const width = Number(source.width) || defaults.width
  const height = Number(source.height) || defaults.height
  const slides = Array.isArray(source.slides) && source.slides.length ? source.slides : defaults.slides

  return {
    schemaVersion: CURRENT_PRESENTATION_SCHEMA_VERSION,
    title: source.title || defaults.title,
    width,
    height,
    theme: source.theme || defaults.theme,
    slides,
    lastSlideIndex: Math.min(
      Math.max(Number(source.lastSlideIndex) || 0, 0),
      Math.max(slides.length - 1, 0),
    ),
  }
}
