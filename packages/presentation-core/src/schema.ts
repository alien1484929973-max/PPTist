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

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord => !!value && typeof value === 'object'

const migrateWidgetScrollProtocol = <TSlide>(slides: TSlide[]): TSlide[] => slides.map(slide => {
  if (!isRecord(slide) || !Array.isArray(slide.elements)) return slide
  let changed = false
  const elements = slide.elements.map(element => {
    if (!isRecord(element) || element.type !== 'widget') return element
    const scroll = isRecord(element.widgetScroll) ? element.widgetScroll : undefined
    if (scroll?.scrollbar === 'hidden' || scroll?.scrollbar === 'auto') return element
    changed = true
    return {
      ...element,
      widgetScroll: scroll
        ? { ...scroll, scrollbar: 'hidden' }
        : { mode: 'fit', overscroll: 'contain', scrollbar: 'hidden' },
    }
  })
  return changed ? { ...slide, elements } as TSlide : slide
})

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
  const sourceSlides = Array.isArray(source.slides) && source.slides.length ? source.slides : defaults.slides
  const slides = migrateWidgetScrollProtocol(sourceSlides)

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
