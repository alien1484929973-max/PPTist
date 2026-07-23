import type {
  AnimationDirection,
  AnimationPhase,
  CanonicalAnimationEffect,
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

const fullClip = 'inset(0 0 0 0)'
const wipeClip: Record<AnimationDirection, string> = {
  left: 'inset(0 100% 0 0)',
  right: 'inset(0 0 0 100%)',
  up: 'inset(0 0 100% 0)',
  down: 'inset(100% 0 0 0)',
}

const flyTransform: Record<AnimationDirection, string> = {
  left: 'translate3d(-100%, 0, 0)',
  right: 'translate3d(100%, 0, 0)',
  up: 'translate3d(0, -100%, 0)',
  down: 'translate3d(0, 100%, 0)',
}

const reverseForExit = (
  phase: AnimationPhase,
  keyframes: AnimationPlanKeyframe[],
) => phase === 'exit' ? [...keyframes].reverse() : keyframes

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

  if (effect.kind === 'appear') keyframes = [{ opacity: 0 }, { opacity: 1 }]
  else if (effect.kind === 'fade') keyframes = [{ opacity: 0 }, { opacity: 1 }]
  else if (effect.kind === 'wipe') {
    keyframes = [
      { clipPath: wipeClip[effect.direction] },
      { clipPath: fullClip },
    ]
  }
  else if (effect.kind === 'fly') {
    keyframes = [
      { opacity: 0, transform: flyTransform[effect.direction] },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
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
  else {
    keyframes = [
      { transform: 'scale3d(1, 1, 1)' },
      { transform: `scale3d(${effect.x}, ${effect.y}, 1)` },
      { transform: 'scale3d(1, 1, 1)' },
    ]
  }

  const visibilityPhase = phase === 'entrance' || phase === 'exit'
  return {
    keyframes: visibilityPhase ? reverseForExit(phase, keyframes) : keyframes,
    options: normalizeOptions(timing),
    initialVisibility: phase === 'entrance' ? 'hidden' : 'visible',
    finalVisibility: phase === 'exit' ? 'hidden' : 'visible',
  }
}

const directionFromName = (value: string): AnimationDirection => {
  const normalized = value.toLowerCase()
  if (normalized.includes('right')) return 'right'
  if (normalized.includes('up') || normalized.includes('top')) return 'up'
  if (normalized.includes('down') || normalized.includes('bottom')) return 'down'
  return 'left'
}

export const canonicalEffectFromLegacy = (
  effect: string,
  type: 'in' | 'out' | 'attention',
): CanonicalAnimationEffect | undefined => {
  const phase = type === 'in' ? 'entrance' : type === 'out' ? 'exit' : 'emphasis'
  if (effect === 'appear' || effect === 'disappear') {
    return { kind: 'appear', phase: phase === 'emphasis' ? 'entrance' : phase }
  }
  if (effect === 'fadeIn' || effect === 'fadeOut') {
    return { kind: 'fade', phase: phase === 'emphasis' ? 'entrance' : phase }
  }
  if (/^wipe(In|Out)(Left|Right|Up|Down)$/.test(effect)) {
    return { kind: 'wipe', phase: phase === 'emphasis' ? 'entrance' : phase, direction: directionFromName(effect) }
  }
  if (/^fly(In|Out)(Left|Right|Up|Down)$/.test(effect)) {
    return { kind: 'fly', phase: phase === 'emphasis' ? 'entrance' : phase, direction: directionFromName(effect) }
  }
  if (effect === 'zoomIn' || effect === 'zoomOut') {
    return { kind: 'zoom', phase: phase === 'emphasis' ? 'entrance' : phase }
  }
  if (effect === 'spin') return { kind: 'spin', phase: 'emphasis' }
  if (effect === 'grow') return { kind: 'scale', phase: 'emphasis', x: 1.25, y: 1.25 }
  if (effect === 'shrink') return { kind: 'scale', phase: 'emphasis', x: 0.75, y: 0.75 }
  return undefined
}

export const canonicalEffectFromTimeline = (animation: TimelineAnimation) => {
  if (animation.effect.canonical) return animation.effect.canonical
  const phase = animation.effect.class === 'exit' ? 'exit' : 'entrance'
  const descriptor = `${animation.effect.filter || ''} ${animation.effect.direction || ''}`.toLowerCase()
  if (animation.effect.presetId === 22 || descriptor.includes('wipe')) {
    return {
      kind: 'wipe',
      phase,
      direction: directionFromName(descriptor),
    } as CanonicalAnimationEffect
  }
  return undefined
}
