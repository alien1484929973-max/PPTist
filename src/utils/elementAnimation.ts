import { canonicalEffectFromLegacy, createAnimationPlan } from '@pptist/presentation-core'
import { ANIMATION_CLASS_PREFIX } from '@/configs/animation'
import type { PPTAnimation } from '@/types/slides'

export interface ElementAnimationHandle {
  finished: Promise<void>
  cancel: () => void
  restore: () => void
}

interface InlineStyleSnapshot {
  visibility: string
  clipPath: string
  opacity: string
  transform: string
}

const snapshotStyles = (element: HTMLElement): InlineStyleSnapshot => ({
  visibility: element.style.visibility,
  clipPath: element.style.clipPath,
  opacity: element.style.opacity,
  transform: element.style.transform,
})

const restoreStyles = (element: HTMLElement, snapshot: InlineStyleSnapshot) => {
  element.style.visibility = snapshot.visibility
  element.style.clipPath = snapshot.clipPath
  element.style.opacity = snapshot.opacity
  element.style.transform = snapshot.transform
}

const nativeAnimation = (
  element: HTMLElement,
  animation: PPTAnimation,
): ElementAnimationHandle | undefined => {
  const effect = canonicalEffectFromLegacy(animation.effect, animation.type)
  if (!effect || typeof element.animate !== 'function') return undefined

  const snapshot = snapshotStyles(element)
  const plan = createAnimationPlan(effect, {
    duration: animation.duration,
    delay: animation.delay || 0,
    trigger: 'click',
    repeatCount: animation.repeatCount,
    autoReverse: animation.autoReverse,
    easing: animation.easing,
  })
  element.style.visibility = 'visible'
  const running = element.animate(plan.keyframes as Keyframe[], plan.options as KeyframeAnimationOptions)
  let cancelled = false

  const finished = running.finished.then(() => {
    if (cancelled) return
    running.cancel()
    restoreStyles(element, snapshot)
    element.style.visibility = plan.finalVisibility
  }).catch(() => undefined)

  const restore = () => {
    cancelled = true
    running.cancel()
    restoreStyles(element, snapshot)
  }

  return { finished, cancel: restore, restore }
}

const legacyAnimation = (element: HTMLElement, animation: PPTAnimation): ElementAnimationHandle => {
  const snapshot = snapshotStyles(element)
  const animationName = `${ANIMATION_CLASS_PREFIX}${animation.effect}`
  const animatedClass = `${ANIMATION_CLASS_PREFIX}animated`
  let settled = false
  let resolveFinished: () => void = () => undefined
  const finished = new Promise<void>(resolve => resolveFinished = resolve)
  const iterations = animation.repeatCount && animation.repeatCount > 1
    ? Math.min(animation.repeatCount * (animation.autoReverse ? 2 : 1), 20)
    : 1

  element.style.visibility = 'visible'
  element.style.setProperty('--animate-duration', `${animation.duration}ms`)
  if (animation.delay) element.style.animationDelay = `${animation.delay}ms`
  if (iterations > 1) element.style.animationIterationCount = `${iterations}`
  if (animation.autoReverse) element.style.animationDirection = 'alternate'
  if (animation.easing) element.style.animationTimingFunction = animation.easing
  element.classList.add(animationName, animatedClass)

  const cleanup = (keepExit: boolean) => {
    element.removeEventListener('animationend', handleEnd)
    window.clearTimeout(timeout)
    if (!keepExit) element.classList.remove(animationName, animatedClass)
    element.style.removeProperty('--animate-duration')
    element.style.removeProperty('animation-delay')
    element.style.removeProperty('animation-iteration-count')
    element.style.removeProperty('animation-direction')
    element.style.removeProperty('animation-timing-function')
  }

  const finish = () => {
    if (settled) return
    settled = true
    cleanup(animation.type === 'out')
    resolveFinished()
  }
  const handleEnd = () => finish()
  const timeout = window.setTimeout(
    finish,
    Math.max(100, (animation.delay || 0) + animation.duration * iterations + 250),
  )
  element.addEventListener('animationend', handleEnd, { once: true })

  const restore = () => {
    if (!settled) {
      settled = true
      resolveFinished()
    }
    cleanup(false)
    restoreStyles(element, snapshot)
  }

  return { finished, cancel: restore, restore }
}

export const runElementAnimation = (
  element: HTMLElement,
  animation: PPTAnimation,
): ElementAnimationHandle => nativeAnimation(element, animation) || legacyAnimation(element, animation)

export const setElementAnimationFinalState = (element: HTMLElement, animation: PPTAnimation) => {
  const effect = canonicalEffectFromLegacy(animation.effect, animation.type)
  if (effect) {
    const plan = createAnimationPlan(effect, { duration: 0, delay: 0, trigger: 'click' })
    element.style.visibility = plan.finalVisibility
    return
  }
  if (animation.type === 'out') {
    element.classList.add(`${ANIMATION_CLASS_PREFIX}${animation.effect}`, `${ANIMATION_CLASS_PREFIX}animated`)
    element.style.setProperty('--animate-duration', '0ms')
  }
}

export const resetElementAnimation = (element: HTMLElement) => {
  for (const classname of [...element.classList]) {
    if (classname.startsWith(ANIMATION_CLASS_PREFIX)) element.classList.remove(classname)
  }
  element.style.removeProperty('--animate-duration')
  element.style.removeProperty('animation-delay')
  element.style.removeProperty('animation-iteration-count')
  element.style.removeProperty('animation-direction')
  element.style.removeProperty('animation-timing-function')
  element.style.removeProperty('visibility')
  element.style.removeProperty('clip-path')
  element.style.removeProperty('opacity')
  element.style.removeProperty('transform')
}
