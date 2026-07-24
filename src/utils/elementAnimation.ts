import {
  canonicalEffectFromLegacy,
  createAnimationPlan,
  resolveDomAnimationTargets,
  runDomAnimation,
  setDomAnimationFinalState,
  type AnimationPlanContext,
  type DomAnimationTargets,
} from '@pptist/presentation-core'
import { ANIMATION_CLASS_PREFIX } from '@/configs/animation'
import type { PPTAnimation } from '@/types/slides'

export interface ElementAnimationHandle {
  finished: Promise<void>
  cancel: () => void
  restore: () => void
}

export interface ElementAnimationContext extends AnimationPlanContext {
  targets?: DomAnimationTargets
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

const combineHandles = (
  handles: ElementAnimationHandle[],
  cleanup: () => void,
): ElementAnimationHandle => {
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    for (const handle of handles) handle.restore()
    cleanup()
  }
  return {
    finished: Promise.all(handles.map(handle => handle.finished)).then(() => undefined),
    cancel: restore,
    restore,
  }
}

const nativeAnimations = (
  elements: HTMLElement[],
  animation: PPTAnimation,
  context: AnimationPlanContext,
): ElementAnimationHandle[] | undefined => {
  const effect = canonicalEffectFromLegacy(
    animation.effect,
    animation.type,
    animation.direction,
    animation.motionPath,
  )
  if (!effect) return undefined
  const plan = createAnimationPlan(effect, {
    duration: animation.duration,
    delay: animation.delay || 0,
    trigger: 'click',
    repeatCount: animation.repeatCount,
    autoReverse: animation.autoReverse,
    easing: animation.easing,
  }, context)
  const handles = elements.map(element => runDomAnimation(element, plan))
  if (handles.some(handle => !handle)) return undefined
  return handles as ElementAnimationHandle[]
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
  context: ElementAnimationContext = {},
): ElementAnimationHandle => {
  const targets = context.targets || resolveDomAnimationTargets(element, animation.target)
  const nativeHandles = nativeAnimations(targets.elements, animation, context)
  const handles = nativeHandles || targets.elements.map(target => legacyAnimation(target, animation))
  return combineHandles(handles, targets.cleanup)
}

export const prepareElementAnimationTargets = (
  element: HTMLElement,
  animation: PPTAnimation,
) => resolveDomAnimationTargets(element, animation.target)

export const setElementAnimationInitialState = (
  element: HTMLElement,
  animation: PPTAnimation,
): DomAnimationTargets => {
  const targets = prepareElementAnimationTargets(element, animation)
  if (animation.type === 'in') {
    for (const target of targets.elements) target.style.visibility = 'hidden'
  }
  return targets
}

export const setElementAnimationFinalState = (
  element: HTMLElement,
  animation: PPTAnimation,
): ElementAnimationHandle => {
  const targets = prepareElementAnimationTargets(element, animation)
  const snapshots = targets.elements.map(snapshotStyles)
  const effect = canonicalEffectFromLegacy(
    animation.effect,
    animation.type,
    animation.direction,
    animation.motionPath,
  )
  if (effect) {
    const plan = createAnimationPlan(effect, {
      duration: 0,
      delay: 0,
      trigger: 'click',
      autoReverse: animation.autoReverse,
    })
    for (const target of targets.elements) setDomAnimationFinalState(target, plan)
  }
  else if (animation.type === 'out') {
    for (const target of targets.elements) {
      target.classList.add(`${ANIMATION_CLASS_PREFIX}${animation.effect}`, `${ANIMATION_CLASS_PREFIX}animated`)
      target.style.setProperty('--animate-duration', '0ms')
    }
  }
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    targets.elements.forEach((target, index) => {
      if (!effect) {
        target.classList.remove(
          `${ANIMATION_CLASS_PREFIX}${animation.effect}`,
          `${ANIMATION_CLASS_PREFIX}animated`,
        )
        target.style.removeProperty('--animate-duration')
      }
      restoreStyles(target, snapshots[index])
    })
    targets.cleanup()
  }
  return { finished: Promise.resolve(), cancel: restore, restore }
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
