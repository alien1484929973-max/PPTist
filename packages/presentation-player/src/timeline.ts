import {
  createAnimationTimelineFromLegacy,
  type AnimationTimeline,
} from '@pptist/presentation-core'
import type {
  PlayerAnimationTimeline,
  PlayerLegacyAnimation,
  PlayerSlide,
} from './types'

export const timelineFromLegacyAnimations = (
  animations: readonly PlayerLegacyAnimation[] = [],
): PlayerAnimationTimeline => createAnimationTimelineFromLegacy(animations) as PlayerAnimationTimeline

export const timelineForSlide = (slide: PlayerSlide): PlayerAnimationTimeline => {
  if (slide.animationTimeline?.version === 1) return slide.animationTimeline
  return timelineFromLegacyAnimations(slide.animations)
}

/** Internal structural adapter for the framework-independent core controller. */
export const asCoreTimeline = (timeline: PlayerAnimationTimeline): AnimationTimeline => timeline as AnimationTimeline
