import type { AnimationPlan } from './effects'

export interface DomAnimationHandle {
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

/**
 * Browser renderer for a framework-independent AnimationPlan. It deliberately
 * accepts a plain HTMLElement, so Vue, React, Web Components and vanilla DOM
 * applications can share the exact same playback behavior.
 */
export const runDomAnimation = (
  element: HTMLElement,
  plan: AnimationPlan,
): DomAnimationHandle | undefined => {
  if (typeof element.animate !== 'function') return undefined

  const snapshot = snapshotStyles(element)
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

export const setDomAnimationFinalState = (element: HTMLElement, plan: AnimationPlan) => {
  element.style.visibility = plan.finalVisibility
}
