import type { AnimationTimeline, TimelineAnimation, TimelineTarget, TimelineTrigger } from './types'

export interface AnimationStep<T> {
  animations: T[]
  autoAdvance: boolean
}

export type TimelineStep = AnimationStep<TimelineAnimation>

export const timelineTargetKey = (target: TimelineTarget) => {
  const element = target.groupId || target.elementId || target.sourceShapeId
  if (!element) return undefined
  const paragraph = target.paragraphRange
    ? `${target.paragraphRange.start}:${target.paragraphRange.end}`
    : target.paragraphIndex === undefined ? '*' : `${target.paragraphIndex}:${target.paragraphIndex}`
  const character = target.characterRange
    ? `${target.characterRange.start}:${target.characterRange.end}`
    : '*'
  return `${element}|p:${paragraph}|c:${character}`
}

export interface PlayableSlide {
  id: string
  animationTimeline?: AnimationTimeline
}

export type PlayerAction =
  | { type: 'animations'; slideIndex: number; stepIndex: number; direction: 'forward' | 'backward'; step: TimelineStep }
  | { type: 'slide'; slideIndex: number }
  | { type: 'start' }
  | { type: 'end' }

/**
 * Compiles PowerPoint's On Click / With Previous / After Previous rules into
 * renderer-neutral playback steps. targetKey prevents two simultaneous
 * effects from fighting over the same target; the later effect wins.
 */
export const compileAnimationSteps = <T>(
  animations: readonly T[],
  triggerOf: (animation: T) => TimelineTrigger,
  targetKey?: (animation: T) => string | undefined,
): AnimationStep<T>[] => {
  const steps: AnimationStep<T>[] = []
  for (const animation of animations) {
    const trigger = triggerOf(animation)
    if (trigger === 'withPrevious' && steps.length) {
      const step = steps[steps.length - 1]
      const target = targetKey?.(animation)
      if (target) step.animations = step.animations.filter(item => targetKey?.(item) !== target)
      step.animations.push(animation)
      continue
    }

    if ((trigger === 'afterPrevious' || trigger === 'auto') && steps.length) {
      steps[steps.length - 1].autoAdvance = true
    }
    steps.push({ animations: [animation], autoAdvance: false })
  }
  return steps
}

export const compileTimeline = (timeline?: AnimationTimeline): TimelineStep[] => {
  if (!timeline) return []
  return compileAnimationSteps(
    timeline.animations,
    animation => animation.timing.trigger,
    animation => timelineTargetKey(animation.target),
  )
}

/**
 * Framework-independent navigation and animation cursor. Renderers decide how
 * to execute returned actions; Vue, React, or a Web Component can share it.
 */
export class PresentationPlayerController<T extends PlayableSlide = PlayableSlide> {
  private slides: T[] = []
  private _slideIndex = 0
  private _stepIndex = 0

  get slideIndex() {
    return this._slideIndex
  }

  get stepIndex() {
    return this._stepIndex
  }

  get currentSlide() {
    return this.slides[this._slideIndex]
  }

  load(slides: T[], startIndex = 0) {
    this.slides = slides
    this._slideIndex = Math.min(Math.max(startIndex, 0), Math.max(slides.length - 1, 0))
    this._stepIndex = 0
  }

  goTo(slideIndex: number): PlayerAction {
    if (!this.slides.length) return { type: 'end' }
    this._slideIndex = Math.min(Math.max(slideIndex, 0), this.slides.length - 1)
    this._stepIndex = 0
    return { type: 'slide', slideIndex: this._slideIndex }
  }

  next(): PlayerAction {
    if (!this.currentSlide) return { type: 'end' }
    const steps = compileTimeline(this.currentSlide.animationTimeline)
    if (this._stepIndex < steps.length) {
      const stepIndex = this._stepIndex++
      return { type: 'animations', slideIndex: this._slideIndex, stepIndex, direction: 'forward', step: steps[stepIndex] }
    }
    if (this._slideIndex >= this.slides.length - 1) return { type: 'end' }

    this._slideIndex++
    this._stepIndex = 0
    return { type: 'slide', slideIndex: this._slideIndex }
  }

  previous(): PlayerAction {
    if (!this.currentSlide) return { type: 'start' }
    if (this._stepIndex > 0) {
      this._stepIndex--
      return {
        type: 'animations',
        slideIndex: this._slideIndex,
        stepIndex: this._stepIndex,
        direction: 'backward',
        step: compileTimeline(this.currentSlide.animationTimeline)[this._stepIndex],
      }
    }
    if (this._slideIndex <= 0) return { type: 'start' }

    this._slideIndex--
    this._stepIndex = compileTimeline(this.currentSlide.animationTimeline).length
    return { type: 'slide', slideIndex: this._slideIndex }
  }
}
