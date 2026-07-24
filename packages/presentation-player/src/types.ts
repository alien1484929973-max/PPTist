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
  [key: string]: unknown
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
  [key: string]: unknown
}

export interface PlayerTheme {
  fontName?: string
  fontColor?: string
  backgroundColor?: string
  [key: string]: unknown
}

export interface PlayerDocument {
  title?: string
  width: number
  height: number
  theme?: PlayerTheme
  slides: PlayerSlide[]
  lastSlideIndex?: number
}

export interface ElementRendererContext {
  element: PlayerElement
  slide: PlayerSlide
  presentation: PlayerDocument
  container: HTMLElement
  sanitizeHtml: (html: string) => string
}

export type PlayerElementRenderer = (context: ElementRendererContext) => HTMLElement | SVGElement | void

export interface PlayerState {
  slideIndex: number
  stepIndex: number
  slideCount: number
  ended: boolean
}

export interface PlayerOptions {
  /** Scale the fixed PPT canvas inside the host. Defaults to contain. */
  fit?: 'contain' | 'width' | 'none'
  keyboard?: boolean
  clickToAdvance?: boolean
  startIndex?: number
  className?: string
  showUnsupported?: boolean
  renderers?: Record<string, PlayerElementRenderer>
  /** PPTist text is HTML. Supply a sanitizer when documents are not trusted. */
  sanitizeHtml?: (html: string) => string
  onStateChange?: (state: PlayerState) => void
  onUnsupportedElement?: (element: PlayerElement) => void
}

export interface PresentationPlayer {
  readonly state: PlayerState
  load: (presentation: PlayerDocument, startIndex?: number) => void
  play: () => Promise<PlayerState>
  next: () => Promise<PlayerState>
  previous: () => Promise<PlayerState>
  goTo: (slideIndex: number) => PlayerState
  resize: () => void
  destroy: () => void
}
