import {
  canonicalEffectFromLegacy,
  type AnimationTimeline,
} from '@pptist/presentation-core'
import type {
  PlayerAnimationTimeline,
  PlayerLegacyAnimation,
  PlayerSlide,
  PlayerTimelineAnimation,
} from './types'

const triggerFromLegacy = (trigger: PlayerLegacyAnimation['trigger']) => {
  if (trigger === 'meantime') return 'withPrevious' as const
  if (trigger === 'auto') return 'afterPrevious' as const
  return 'click' as const
}

export const timelineFromLegacyAnimations = (
  animations: readonly PlayerLegacyAnimation[] = [],
): PlayerAnimationTimeline => ({
  version: 1,
  animations: animations.map((animation): PlayerTimelineAnimation => {
    const canonical = canonicalEffectFromLegacy(
      animation.effect,
      animation.type,
      animation.direction,
      animation.motionPath,
    )
    return {
      id: animation.id,
      target: {
        ...animation.target,
        elementId: animation.target?.groupId ? undefined : animation.elId,
      },
      timing: {
        duration: animation.duration,
        delay: animation.delay || 0,
        trigger: triggerFromLegacy(animation.trigger),
        repeatCount: animation.repeatCount,
        autoReverse: animation.autoReverse,
        easing: animation.easing,
      },
      effect: {
        class: animation.type === 'motion'
          ? 'motionPath'
          : animation.type === 'in' ? 'entrance' : animation.type === 'out' ? 'exit' : 'emphasis',
        compatibility: canonical ? 'mapped' : 'unsupported',
        canonical,
        direction: animation.direction,
        motionPath: animation.motionPath,
      },
    }
  }),
})

export const timelineForSlide = (slide: PlayerSlide): PlayerAnimationTimeline => {
  if (slide.animationTimeline?.version === 1) return slide.animationTimeline
  return timelineFromLegacyAnimations(slide.animations)
}

/** Internal structural adapter for the framework-independent core controller. */
export const asCoreTimeline = (timeline: PlayerAnimationTimeline): AnimationTimeline => timeline as AnimationTimeline
