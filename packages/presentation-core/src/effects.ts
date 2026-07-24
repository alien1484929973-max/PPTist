import type {
  AnimationDirection,
  AnimationPhase,
  CanonicalAnimationEffect,
  CardinalDirection,
  TimelineAnimation,
  TimelineTiming,
} from './types'

export type AnimationPlanKeyframe = Record<string, string | number>

export interface AnimationPlanOptions {
  duration: number
  delay: number
  iterations: number
  direction: 'normal' | 'alternate'
  easing: string
  fill: 'both'
}

export interface AnimationPlan {
  keyframes: AnimationPlanKeyframe[]
  options: AnimationPlanOptions
  initialVisibility: 'visible' | 'hidden'
  finalVisibility: 'visible' | 'hidden'
}

const CARDINAL_DIRECTIONS: readonly CardinalDirection[] = ['left', 'right', 'up', 'down']
const FLY_DIRECTIONS: readonly AnimationDirection[] = [
  'left',
  'right',
  'up',
  'down',
  'topLeft',
  'topRight',
  'bottomLeft',
  'bottomRight',
]

const fullClip = 'inset(0 0 0 0)'
const wipeClip: Record<CardinalDirection, string> = {
  left: 'inset(0 100% 0 0)',
  right: 'inset(0 0 0 100%)',
  up: 'inset(0 0 100% 0)',
  down: 'inset(100% 0 0 0)',
}

const directionVector: Record<AnimationDirection, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
  topLeft: [-1, -1],
  topRight: [1, -1],
  bottomLeft: [-1, 1],
  bottomRight: [1, 1],
}

const translateForDirection = (direction: AnimationDirection, distance = 100) => {
  const [x, y] = directionVector[direction]
  return `translate3d(${x * distance}%, ${y * distance}%, 0)`
}

const reverseForExit = (
  phase: AnimationPhase,
  keyframes: AnimationPlanKeyframe[],
) => {
  if (phase !== 'exit') return keyframes
  return [...keyframes].reverse().map(keyframe => {
    if (typeof keyframe.offset !== 'number') return keyframe
    return { ...keyframe, offset: 1 - keyframe.offset }
  })
}

const normalizeOptions = (timing: Partial<TimelineTiming>): AnimationPlanOptions => {
  const repeat = timing.repeatCount === -1 ? 20 : Math.max(1, timing.repeatCount || 1)
  const iterations = Math.min(repeat * (timing.autoReverse ? 2 : 1), 20)
  return {
    duration: Math.max(0, timing.duration ?? 1000),
    delay: Math.max(0, timing.delay ?? 0),
    iterations,
    direction: timing.autoReverse ? 'alternate' : 'normal',
    easing: timing.easing || 'ease',
    fill: 'both',
  }
}

export const createAnimationPlan = (
  effect: CanonicalAnimationEffect,
  timing: Partial<TimelineTiming> = {},
): AnimationPlan => {
  const phase = effect.phase
  let keyframes: AnimationPlanKeyframe[]

  if (effect.kind === 'appear') {
    // PowerPoint's Appear/Disappear is a visibility change, not a one-second fade.
    keyframes = [
      { opacity: 0, offset: 0 },
      { opacity: 1, offset: 0.001 },
      { opacity: 1, offset: 1 },
    ]
  }
  else if (effect.kind === 'fade') keyframes = [{ opacity: 0 }, { opacity: 1 }]
  else if (effect.kind === 'wipe') {
    keyframes = [
      { clipPath: wipeClip[effect.direction] },
      { clipPath: fullClip },
    ]
  }
  else if (effect.kind === 'fly') {
    keyframes = [
      { opacity: 0, transform: translateForDirection(effect.direction) },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    ]
  }
  else if (effect.kind === 'float') {
    keyframes = [
      { opacity: 0, transform: translateForDirection(effect.direction, 18) },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    ]
  }
  else if (effect.kind === 'bounce') {
    const startTransform = effect.direction
      ? `${translateForDirection(effect.direction)} scale3d(.7, .7, .7)`
      : 'scale3d(.3, .3, .3)'
    keyframes = [
      { opacity: 0, transform: startTransform, offset: 0 },
      { opacity: 1, transform: 'translate3d(0, 0, 0) scale3d(1.08, 1.08, 1.08)', offset: 0.62 },
      { transform: 'translate3d(0, 0, 0) scale3d(.96, .96, .96)', offset: 0.8 },
      { transform: 'translate3d(0, 0, 0) scale3d(1, 1, 1)', offset: 1 },
    ]
  }
  else if (effect.kind === 'zoom') {
    keyframes = [
      { opacity: 0, transform: 'scale3d(0.05, 0.05, 0.05)' },
      { opacity: 1, transform: 'scale3d(1, 1, 1)' },
    ]
  }
  else if (effect.kind === 'spin') {
    keyframes = [
      { transform: 'rotate(0deg)' },
      { transform: `rotate(${effect.degrees ?? 360}deg)` },
    ]
  }
  else if (effect.kind === 'scale') {
    keyframes = [
      { transform: 'scale3d(1, 1, 1)' },
      { transform: `scale3d(${effect.x}, ${effect.y}, 1)` },
      { transform: 'scale3d(1, 1, 1)' },
    ]
  }
  else if (effect.kind === 'pulse') {
    const scale = effect.scale ?? 1.12
    keyframes = [
      { transform: 'scale3d(1, 1, 1)' },
      { transform: `scale3d(${scale}, ${scale}, 1)` },
      { transform: 'scale3d(1, 1, 1)' },
    ]
  }
  else if (effect.kind === 'transparency') {
    keyframes = [
      { opacity: 1 },
      { opacity: effect.opacity ?? 0.35 },
      { opacity: 1 },
    ]
  }
  else if (effect.kind === 'blink') {
    keyframes = [
      { opacity: 1, offset: 0 },
      { opacity: 0, offset: 0.25 },
      { opacity: 1, offset: 0.5 },
      { opacity: 0, offset: 0.75 },
      { opacity: 1, offset: 1 },
    ]
  }
  else {
    const degrees = effect.degrees ?? 4
    keyframes = [
      { transform: 'rotate(0deg)', offset: 0 },
      { transform: `rotate(-${degrees}deg)`, offset: 0.25 },
      { transform: `rotate(${degrees}deg)`, offset: 0.75 },
      { transform: 'rotate(0deg)', offset: 1 },
    ]
  }

  const visibilityPhase = phase === 'entrance' || phase === 'exit'
  const initialVisibility = phase === 'entrance' ? 'hidden' : 'visible'
  const finalVisibility = timing.autoReverse
    ? initialVisibility
    : phase === 'exit' ? 'hidden' : 'visible'
  return {
    keyframes: visibilityPhase ? reverseForExit(phase, keyframes) : keyframes,
    options: normalizeOptions(timing),
    initialVisibility,
    finalVisibility,
  }
}

export const directionFromName = (value: string): AnimationDirection | undefined => {
  const normalized = value.toLowerCase().replace(/[\s_-]/g, '')
  const top = normalized.includes('top') || normalized.includes('up')
  const bottom = normalized.includes('bottom') || normalized.includes('down')
  const left = normalized.includes('left')
  const right = normalized.includes('right')
  if (top && left) return 'topLeft'
  if (top && right) return 'topRight'
  if (bottom && left) return 'bottomLeft'
  if (bottom && right) return 'bottomRight'
  if (left) return 'left'
  if (right) return 'right'
  if (top) return 'up'
  if (bottom) return 'down'
  return undefined
}

export const normalizeAnimationEffectId = (
  effect: string,
  type: 'in' | 'out' | 'attention',
) => {
  const phaseSuffix = type === 'out' ? 'Out' : 'In'
  if (/^wipe(In|Out)/.test(effect)) return `wipe${phaseSuffix}`
  if (/^fly(In|Out)/.test(effect)) return `fly${phaseSuffix}`
  if (/^slide(In|Out)/.test(effect)) return `fly${phaseSuffix}`
  if (/^lightSpeed(In|Out)/.test(effect)) return `fly${phaseSuffix}`
  if (/^fade(In|Out).+/.test(effect)) return `float${phaseSuffix}`
  if (/^float(In|Out)/.test(effect)) return `float${phaseSuffix}`
  if (/^bounce(In|Out)/.test(effect)) return `bounce${phaseSuffix}`
  if (effect === 'fadeIn' || effect === 'fadeOut') return `fade${phaseSuffix}`
  if (effect === 'zoomIn' || effect === 'zoomOut') return `zoom${phaseSuffix}`
  if (effect === 'appear' || effect === 'disappear') return type === 'out' ? 'disappear' : 'appear'
  return effect
}

export const supportedDirectionsForEffect = (
  effect: string,
  type: 'in' | 'out' | 'attention',
): readonly AnimationDirection[] => {
  const normalized = normalizeAnimationEffectId(effect, type)
  if (normalized === 'flyIn' || normalized === 'flyOut') return FLY_DIRECTIONS
  if (normalized === 'wipeIn' || normalized === 'wipeOut') return CARDINAL_DIRECTIONS
  if (normalized === 'floatIn' || normalized === 'floatOut') return ['up', 'down']
  return []
}

export const defaultDirectionForEffect = (
  effect: string,
  type: 'in' | 'out' | 'attention',
): AnimationDirection | undefined => {
  const normalized = normalizeAnimationEffectId(effect, type)
  if (normalized === 'flyIn' || normalized === 'flyOut') return 'down'
  if (normalized === 'wipeIn' || normalized === 'wipeOut') return 'down'
  if (normalized === 'floatIn') return 'down'
  if (normalized === 'floatOut') return 'up'
  return undefined
}

export const resolveAnimationDirection = (
  effect: string,
  type: 'in' | 'out' | 'attention',
  explicit?: AnimationDirection,
) => explicit || directionFromName(effect) || defaultDirectionForEffect(effect, type)

export const canonicalEffectFromLegacy = (
  effect: string,
  type: 'in' | 'out' | 'attention',
  explicitDirection?: AnimationDirection,
): CanonicalAnimationEffect | undefined => {
  const phase = type === 'in' ? 'entrance' : type === 'out' ? 'exit' : 'emphasis'
  const normalized = normalizeAnimationEffectId(effect, type)
  const direction = resolveAnimationDirection(effect, type, explicitDirection)

  if (normalized === 'appear' || normalized === 'disappear') {
    return { kind: 'appear', phase: phase === 'emphasis' ? 'entrance' : phase }
  }
  if (normalized === 'fadeIn' || normalized === 'fadeOut') {
    return { kind: 'fade', phase: phase === 'emphasis' ? 'entrance' : phase }
  }
  if ((normalized === 'wipeIn' || normalized === 'wipeOut') && direction && CARDINAL_DIRECTIONS.includes(direction as CardinalDirection)) {
    return { kind: 'wipe', phase: phase === 'emphasis' ? 'entrance' : phase, direction: direction as CardinalDirection }
  }
  if (normalized === 'wipeIn' || normalized === 'wipeOut') {
    return { kind: 'wipe', phase: phase === 'emphasis' ? 'entrance' : phase, direction: 'down' }
  }
  if ((normalized === 'flyIn' || normalized === 'flyOut') && direction) {
    return { kind: 'fly', phase: phase === 'emphasis' ? 'entrance' : phase, direction }
  }
  if ((normalized === 'floatIn' || normalized === 'floatOut') && (direction === 'up' || direction === 'down')) {
    return { kind: 'float', phase: phase === 'emphasis' ? 'entrance' : phase, direction }
  }
  if (normalized === 'floatIn' || normalized === 'floatOut') {
    return {
      kind: 'float',
      phase: phase === 'emphasis' ? 'entrance' : phase,
      direction: normalized === 'floatOut' ? 'up' : 'down',
    }
  }
  if (normalized === 'bounceIn' || normalized === 'bounceOut') {
    return { kind: 'bounce', phase: phase === 'emphasis' ? 'entrance' : phase }
  }
  if (normalized === 'zoomIn' || normalized === 'zoomOut') {
    return { kind: 'zoom', phase: phase === 'emphasis' ? 'entrance' : phase }
  }
  if (effect === 'spin') return { kind: 'spin', phase: 'emphasis' }
  if (effect === 'grow') return { kind: 'scale', phase: 'emphasis', x: 1.25, y: 1.25 }
  if (effect === 'shrink') return { kind: 'scale', phase: 'emphasis', x: 0.75, y: 0.75 }
  if (effect === 'pulse') return { kind: 'pulse', phase: 'emphasis' }
  if (effect === 'transparency') return { kind: 'transparency', phase: 'emphasis' }
  if (effect === 'blink' || effect === 'flash') return { kind: 'blink', phase: 'emphasis' }
  if (effect === 'teeter') return { kind: 'teeter', phase: 'emphasis' }
  return undefined
}

export const canonicalEffectFromTimeline = (animation: TimelineAnimation) => {
  if (animation.effect.canonical) return animation.effect.canonical
  if (animation.effect.class !== 'entrance' && animation.effect.class !== 'exit') return undefined
  const phase = animation.effect.class === 'exit' ? 'exit' : 'entrance'
  const descriptor = `${animation.effect.filter || ''} ${animation.effect.direction || ''}`.toLowerCase()
  const direction = directionFromName(descriptor)
  if ((animation.effect.presetId === 22 || descriptor.includes('wipe')) && direction && CARDINAL_DIRECTIONS.includes(direction as CardinalDirection)) {
    return { kind: 'wipe', phase, direction: direction as CardinalDirection } as CanonicalAnimationEffect
  }
  if (animation.effect.presetId === 1) return { kind: 'appear', phase } as CanonicalAnimationEffect
  if (animation.effect.presetId === 10) return { kind: 'fade', phase } as CanonicalAnimationEffect
  if (animation.effect.presetId === 2 && direction) return { kind: 'fly', phase, direction } as CanonicalAnimationEffect
  if (animation.effect.presetId === 23) return { kind: 'zoom', phase } as CanonicalAnimationEffect
  if (animation.effect.presetId === 26) return { kind: 'bounce', phase } as CanonicalAnimationEffect
  return undefined
}
