export const CURRENT_PRESENTATION_SCHEMA_VERSION = 2 as const

export type PptxMorphMode = 'byObject' | 'byWord' | 'byChar'

export interface PptxElementSource {
  provider: 'pptx'
  slideIndex: number
  shapeId: string
  name?: string
  creationId?: string
}

export interface MorphTransition {
  mode: PptxMorphMode
}

export interface SlideTransition {
  type: string
  duration: number
  direction?: string | null
  autoAdvanceAfter?: number
  morph?: MorphTransition
  source?: 'pptx' | 'editor'
}

export type TimelineTrigger = 'click' | 'withPrevious' | 'afterPrevious' | 'auto'
export type TimelineAnimationClass = 'entrance' | 'exit' | 'emphasis' | 'motionPath' | 'media' | 'unknown'

export interface TimelineTarget {
  elementId?: string
  sourceShapeId?: string
  paragraphIndex?: number
  paragraphRange?: { start: number; end: number }
  characterRange?: { start: number; end: number }
}

export interface TimelineTiming {
  duration: number
  delay: number
  trigger: TimelineTrigger
  repeatCount?: number
  autoReverse?: boolean
  acceleration?: number
  deceleration?: number
  easing?: string
}

export type CardinalDirection = 'left' | 'right' | 'up' | 'down'
export type AnimationDirection = CardinalDirection
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight'
export type AnimationPhase = 'entrance' | 'exit' | 'emphasis' | 'motionPath'

export type CanonicalAnimationEffect =
  | { kind: 'appear'; phase: 'entrance' | 'exit' }
  | { kind: 'fade'; phase: 'entrance' | 'exit' }
  | { kind: 'zoom'; phase: 'entrance' | 'exit' }
  | { kind: 'wipe'; phase: 'entrance' | 'exit'; direction: CardinalDirection }
  | { kind: 'fly'; phase: 'entrance' | 'exit'; direction: AnimationDirection }
  | { kind: 'float'; phase: 'entrance' | 'exit'; direction: 'up' | 'down' }
  | { kind: 'bounce'; phase: 'entrance' | 'exit'; direction?: AnimationDirection }
  | { kind: 'spin'; phase: 'emphasis'; degrees?: number }
  | { kind: 'scale'; phase: 'emphasis'; x: number; y: number }
  | { kind: 'pulse'; phase: 'emphasis'; scale?: number }
  | { kind: 'transparency'; phase: 'emphasis'; opacity?: number }
  | { kind: 'blink'; phase: 'emphasis' }
  | { kind: 'teeter'; phase: 'emphasis'; degrees?: number }
  | { kind: 'motionPath'; phase: 'motionPath'; path: string }

export interface TimelineEffect {
  class: TimelineAnimationClass
  compatibility?: 'mapped' | 'approximate' | 'unsupported'
  presetId?: number
  presetSubtype?: number
  filter?: string
  direction?: string
  motionPath?: string
  rotateBy?: number
  scaleBy?: { x: number; y: number }
  transition?: 'in' | 'out'
  canonical?: CanonicalAnimationEffect
}

export interface TimelineAnimation {
  id: string
  target: TimelineTarget
  timing: TimelineTiming
  effect: TimelineEffect
  source?: {
    provider: 'pptx'
    timeNodeId?: string
    rawXml?: string
  }
}

export interface AnimationTimeline {
  version: 1
  animations: TimelineAnimation[]
}

export interface MorphableElement {
  id: string
  type: string
  left: number
  top: number
  width: number
  height: number
  rotate: number
  name?: string
  source?: PptxElementSource
  contentFingerprint?: string
}

export interface MorphElementMatch<T extends MorphableElement = MorphableElement> {
  from: T
  to: T
  confidence: 'forced' | 'strong' | 'inferred'
}

export interface MorphMatchResult<T extends MorphableElement = MorphableElement> {
  matches: MorphElementMatch<T>[]
  leaving: T[]
  entering: T[]
}
