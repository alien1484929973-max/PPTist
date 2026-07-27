export type PlayerElementType = 'text' | 'image' | 'shape' | 'line' | 'table' | 'latex' | 'video' | 'audio' | 'chart' | string

export interface PlayerGradient {
  type: 'linear' | 'radial'
  colors: Array<{ pos: number; color: string }>
  rotate?: number
}

export interface PlayerOutline {
  style?: 'solid' | 'dashed' | 'dotted'
  width?: number
  color?: string
}

export interface PlayerShadow {
  h: number
  v: number
  blur: number
  color: string
}

export interface PlayerElementLink {
  type: 'web' | 'slide'
  target: string
}

export interface PlayerImageFilters {
  blur?: string
  brightness?: string
  contrast?: string
  grayscale?: string
  saturate?: string
  'hue-rotate'?: string
  sepia?: string
  invert?: string
  opacity?: string
}

export interface PlayerShapeText {
  content: string
  defaultFontName: string
  defaultColor: string
  align: 'top' | 'middle' | 'bottom'
  lineHeight?: number
  wordSpace?: number
  paragraphSpace?: number
  inset?: [number, number, number, number]
}

export interface PlayerTableCellStyle {
  bold?: boolean
  em?: boolean
  underline?: boolean
  strikethrough?: boolean
  color?: string
  backcolor?: string
  fontsize?: string
  fontname?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  vAlign?: 'top' | 'middle' | 'bottom'
}

export interface PlayerTableCell {
  id?: string
  colspan: number
  rowspan: number
  text: string
  style?: PlayerTableCellStyle
}

export interface PlayerChartElementData {
  labels: string[]
  legends: string[]
  series: number[][]
}

/**
 * Structural representation of a PPTist element. Built-in renderers understand
 * text, image, shape, line, table, LaTeX, video and audio fields. Applications
 * can add other element types through PlayerOptions.renderers.
 */
export interface PlayerElement {
  id: string
  type: PlayerElementType
  left: number
  top: number
  width: number
  height?: number
  rotate?: number
  groupId?: string
  link?: PlayerElementLink
  name?: string
  morphKey?: string
  source?: {
    provider: 'pptx'
    slideIndex: number
    shapeId: string
    name?: string
    creationId?: string
  }
  content?: string
  defaultFontName?: string
  defaultColor?: string
  fill?: string
  opacity?: number
  lineHeight?: number
  wordSpace?: number
  paragraphSpace?: number
  vertical?: boolean
  fixedHeight?: boolean
  vAlign?: 'top' | 'middle' | 'bottom'
  inset?: [number, number, number, number]
  outline?: PlayerOutline
  shadow?: PlayerShadow
  src?: string
  filters?: PlayerImageFilters
  clip?: { range: [[number, number], [number, number]]; shape: string }
  flipH?: boolean
  flipV?: boolean
  radius?: number
  colorMask?: string
  viewBox?: [number, number]
  path?: string
  gradient?: PlayerGradient
  pattern?: string
  text?: PlayerShapeText
  start?: [number, number]
  end?: [number, number]
  style?: 'solid' | 'dashed' | 'dotted'
  color?: string
  points?: ['' | 'arrow' | 'dot', '' | 'arrow' | 'dot']
  broken?: [number, number]
  broken2?: [number, number]
  broken2Direction?: 'horizontal' | 'vertical'
  curve?: [number, number]
  cubic?: [[number, number], [number, number]]
  chartType?: 'bar' | 'column' | 'line' | 'pie' | 'ring' | 'area' | 'radar' | 'scatter'
  data?: PlayerChartElementData | PlayerTableCell[][]
  options?: { lineSmooth?: boolean; stack?: boolean }
  themeColors?: string[]
  textColor?: string
  lineColor?: string
  colWidths?: number[]
  cellMinHeight?: number
  theme?: { color: string; rowHeader: boolean; rowFooter: boolean; colHeader: boolean; colFooter: boolean }
  strokeWidth?: number
  autoplay?: boolean
  poster?: string
  loop?: boolean
  ext?: string
  fixedRatio?: boolean
  /** Application-owned serializable payload consumed by a custom renderer. */
  customData?: Record<string, unknown>
}

export interface PlayerSlideBackground {
  type: 'solid' | 'image' | 'gradient'
  color?: string
  image?: { src: string; size?: 'cover' | 'contain' | 'repeat' }
  gradient?: PlayerGradient
}

export type PlayerAnimationTrigger = 'click' | 'withPrevious' | 'afterPrevious' | 'auto'

export type PlayerCanonicalEffect =
  | { kind: 'appear'; phase: 'entrance' | 'exit' }
  | { kind: 'fade'; phase: 'entrance' | 'exit' }
  | { kind: 'zoom'; phase: 'entrance' | 'exit' }
  | { kind: 'wipe'; phase: 'entrance' | 'exit'; direction: 'left' | 'right' | 'up' | 'down' }
  | { kind: 'fly'; phase: 'entrance' | 'exit'; direction: 'left' | 'right' | 'up' | 'down' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' }
  | { kind: 'float'; phase: 'entrance' | 'exit'; direction: 'up' | 'down' }
  | { kind: 'bounce'; phase: 'entrance' | 'exit'; direction?: 'left' | 'right' | 'up' | 'down' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' }
  | { kind: 'spin'; phase: 'emphasis'; degrees?: number }
  | { kind: 'scale'; phase: 'emphasis'; x: number; y: number }
  | { kind: 'pulse'; phase: 'emphasis'; scale?: number }
  | { kind: 'transparency'; phase: 'emphasis'; opacity?: number }
  | { kind: 'blink'; phase: 'emphasis' }
  | { kind: 'teeter'; phase: 'emphasis'; degrees?: number }
  | { kind: 'motionPath'; phase: 'motionPath'; path: string }

export interface PlayerTimelineTarget {
  elementId?: string
  groupId?: string
  sourceShapeId?: string
  paragraphIndex?: number
  paragraphRange?: { start: number; end: number }
  characterRange?: { start: number; end: number }
}

export interface PlayerTimelineAnimation {
  id: string
  target: PlayerTimelineTarget
  timing: {
    duration: number
    delay: number
    trigger: PlayerAnimationTrigger
    repeatCount?: number
    autoReverse?: boolean
    easing?: string
  }
  effect: {
    class: 'entrance' | 'exit' | 'emphasis' | 'motionPath' | 'media' | 'unknown'
    compatibility?: 'mapped' | 'approximate' | 'unsupported'
    canonical?: PlayerCanonicalEffect
    direction?: string
    motionPath?: string
  }
}

export interface PlayerAnimationTimeline {
  version: 1
  animations: PlayerTimelineAnimation[]
}

export interface PlayerLegacyAnimation {
  id: string
  elId: string
  type: 'in' | 'out' | 'attention' | 'motion'
  effect: string
  direction?: 'left' | 'right' | 'up' | 'down' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
  motionPath?: string
  target?: PlayerTimelineTarget
  duration: number
  trigger: 'click' | 'meantime' | 'auto'
  delay?: number
  repeatCount?: number
  autoReverse?: boolean
  easing?: string
}

export interface PlayerSlide {
  id: string
  elements: PlayerElement[]
  background?: PlayerSlideBackground
  animations?: PlayerLegacyAnimation[]
  animationTimeline?: PlayerAnimationTimeline
  transition?: {
    type: string
    duration: number
    direction?: string | null
    autoAdvanceAfter?: number
    morph?: {
      mode: 'byObject' | 'byWord' | 'byChar'
      links?: Array<{ fromElementId: string; toElementId: string }>
      excludedToElementIds?: string[]
    }
    source?: 'pptx' | 'editor'
  }
  turningMode?: 'no' | 'fade' | 'morph' | 'slideX' | 'slideY' | 'random' | 'slideX3D' | 'slideY3D' | 'rotate' | 'scaleY' | 'scaleX' | 'scale' | 'scaleReverse'
}

export interface PlayerTheme {
  fontName?: string
  fontColor?: string
  backgroundColor?: string
  themeColors?: string[]
  outline?: PlayerOutline
  shadow?: PlayerShadow
}

export interface PlayerDocument {
  schemaVersion?: number
  title?: string
  width: number
  height: number
  theme?: PlayerTheme
  slides: PlayerSlide[]
  lastSlideIndex?: number
}

/** A synchronously consumable presentation document or its JSON text. */
export type PlayerDocumentSource = PlayerDocument | string

export interface ElementRendererContext {
  element: PlayerElement
  slide: PlayerSlide
  presentation: PlayerDocument
  container: HTMLElement
  sanitizeHtml: (html: string) => string
  resolveResourceUrl: (url: string, kind: PlayerResourceKind) => string | null
  /** Register observers or library instances that must be released on rerender. */
  onCleanup: (cleanup: () => void) => void
}

export type PlayerElementRenderer = (context: ElementRendererContext) => HTMLElement | SVGElement | void
export type PlayerResourceKind = 'image' | 'media' | 'poster' | 'pattern' | 'background' | 'link'

export type PlayerResourceClassification = 'remote' | 'relative' | 'embedded' | 'session' | 'unsupported' | 'missing'

export interface PlayerResourceReference {
  kind: PlayerResourceKind
  url: string
  resolvedUrl?: string
  classification: PlayerResourceClassification
  slideIndex: number
  slideId: string
  elementId?: string
  path: string
}

export interface PlayerResourceIssue {
  code: 'missing' | 'relative' | 'session-url' | 'embedded-data' | 'unsupported-protocol'
  severity: 'warning' | 'blocking'
  message: string
  resource: PlayerResourceReference
}

export interface PlayerResourceReport {
  portable: boolean
  resources: PlayerResourceReference[]
  issues: PlayerResourceIssue[]
}

export interface AnalyzePlayerResourcesOptions {
  /** Base used to resolve relative JSON resource URLs. */
  baseUrl?: string
  /** Relative URLs are portable only when explicitly allowed or a baseUrl is supplied. */
  allowRelativeUrls?: boolean
  /** data: URLs are self-contained and allowed by default. */
  allowDataUrls?: boolean
  /** blob: URLs are page-session scoped and rejected by default. */
  allowBlobUrls?: boolean
}

export interface PlayerState {
  slideIndex: number
  stepIndex: number
  slideCount: number
  ended: boolean
}

export interface PlayerWheelOptions {
  /** Accumulated wheel distance required to advance once. Defaults to 36 pixels. */
  threshold?: number
  /** Idle time that separates two wheel gestures. Defaults to 180ms. */
  idleResetMs?: number
  /** Prevent the host page from scrolling while the player consumes a gesture. Defaults to true. */
  preventDefault?: boolean
}

export interface PlayerOptions {
  /** Scale the fixed PPT canvas inside the host. Defaults to contain. */
  fit?: 'contain' | 'width' | 'none'
  keyboard?: boolean
  /** Host scope avoids global shortcuts; document scope matches a full-screen presentation. */
  keyboardScope?: 'host' | 'document'
  /** Enable one-step-per-gesture wheel navigation. Disabled by default for embedded players. */
  wheel?: boolean | PlayerWheelOptions
  clickToAdvance?: boolean
  startIndex?: number
  className?: string
  showUnsupported?: boolean
  renderers?: Record<string, PlayerElementRenderer>
  /** PPTist text is HTML. Supply a sanitizer when documents are not trusted. */
  sanitizeHtml?: (html: string) => string
  /** Resolve relative media URLs against the JSON document's original location. */
  resourceBaseUrl?: string
  /** Allow, rewrite, or reject (with null) external resource URLs from untrusted documents. */
  resolveResourceUrl?: (url: string, kind: PlayerResourceKind) => string | null
  onStateChange?: (state: PlayerState) => void
  onUnsupportedElement?: (element: PlayerElement) => void
}

export interface PresentationPlayer {
  readonly state: PlayerState
  load: (presentation: PlayerDocumentSource, startIndex?: number) => void
  play: () => Promise<PlayerState>
  next: () => Promise<PlayerState>
  previous: () => Promise<PlayerState>
  goTo: (slideIndex: number) => PlayerState
  /** Restore a slide and the number of already-applied animation steps. */
  goToStep: (slideIndex: number, stepIndex: number) => PlayerState
  resize: () => void
  destroy: () => void
}
