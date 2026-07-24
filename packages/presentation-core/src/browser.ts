import type { AnimationPlan } from './effects'
import type { TimelineTarget } from './types'

export interface DomAnimationHandle {
  finished: Promise<void>
  cancel: () => void
  restore: () => void
}

export interface DomAnimationTargets {
  elements: HTMLElement[]
  cleanup: () => void
}

const normalizedRange = (range: { start: number; end: number }) => ({
  start: Math.max(0, Math.min(range.start, range.end)),
  end: Math.max(0, range.start, range.end),
})

const paragraphElements = (container: HTMLElement) => {
  const direct = Array.from(container.children).flatMap(child => {
    if (child.matches('p, li')) return [child]
    if (child.matches('ul, ol')) return Array.from(child.children).filter(item => item.matches('li'))
    return []
  })
  const candidates = direct.length ? direct : Array.from(container.querySelectorAll('p, li'))
  return candidates.filter((element): element is HTMLElement => element.nodeType === 1)
}

const selectedParagraphs = (container: HTMLElement, target: TimelineTarget) => {
  const paragraphs = paragraphElements(container)
  const range = target.paragraphRange || (target.paragraphIndex === undefined
    ? undefined
    : { start: target.paragraphIndex, end: target.paragraphIndex })
  if (!range) return paragraphs
  const normalized = normalizedRange(range)
  return paragraphs.slice(normalized.start, normalized.end + 1)
}

const wrapCharacterRange = (
  roots: HTMLElement[],
  range: { start: number; end: number },
): DomAnimationTargets => {
  const normalized = normalizedRange(range)
  // OOXML character ranges are inclusive. A zero-width range still targets
  // one character, matching PowerPoint's paragraph/character animation UI.
  const rangeEnd = normalized.end + 1
  const wrappers: HTMLElement[] = []
  let cursor = 0

  for (const root of roots) {
    const ownerDocument = root.ownerDocument
    const showText = ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4
    const walker = ownerDocument.createTreeWalker(root, showText)
    const nodes: Text[] = []
    let current = walker.nextNode()
    while (current) {
      nodes.push(current as Text)
      current = walker.nextNode()
    }

    for (const textNode of nodes) {
      const length = textNode.data.length
      const start = Math.max(0, normalized.start - cursor)
      const end = Math.min(length, rangeEnd - cursor)
      cursor += length
      if (start >= end) continue

      const selected = textNode.splitText(start)
      if (end - start < selected.data.length) selected.splitText(end - start)
      const wrapper = ownerDocument.createElement('span')
      wrapper.dataset.pptistAnimationTarget = 'character'
      wrapper.style.display = 'inline-block'
      selected.parentNode?.insertBefore(wrapper, selected)
      wrapper.appendChild(selected)
      wrappers.push(wrapper)
    }
  }

  const cleanup = () => {
    for (const wrapper of wrappers) {
      if (!wrapper.parentNode) continue
      const parent = wrapper.parentNode
      wrapper.replaceWith(...Array.from(wrapper.childNodes))
      parent.normalize()
    }
  }
  return { elements: wrappers, cleanup }
}

/**
 * Resolves PowerPoint element, paragraph, and character targets against a
 * plain DOM subtree. The temporary character wrappers are renderer-owned and
 * must be released through cleanup when playback is cancelled or reset.
 */
export const resolveDomAnimationTargets = (
  root: HTMLElement,
  target?: TimelineTarget,
): DomAnimationTargets => {
  if (!target?.paragraphRange && target?.paragraphIndex === undefined && !target?.characterRange) {
    return { elements: [root], cleanup: () => undefined }
  }
  const textContainer = root.querySelector<HTMLElement>('.ProseMirror-static')
  if (!textContainer) return { elements: [root], cleanup: () => undefined }
  const paragraphs = selectedParagraphs(textContainer, target)
  if (target.characterRange) {
    const characterTargets = wrapCharacterRange(paragraphs.length ? paragraphs : [textContainer], target.characterRange)
    if (characterTargets.elements.length) return characterTargets
    characterTargets.cleanup()
  }
  return {
    elements: paragraphs.length ? paragraphs : [root],
    cleanup: () => undefined,
  }
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

const applyPlanStyles = (element: HTMLElement, styles: AnimationPlan['finalStyles']) => {
  if (!styles) return
  for (const [property, value] of Object.entries(styles)) {
    if (value === undefined || property === 'offset') continue
    const cssProperty = property.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
    element.style.setProperty(cssProperty, String(value))
  }
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
    applyPlanStyles(element, plan.finalStyles)
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
  applyPlanStyles(element, plan.finalStyles)
  element.style.visibility = plan.finalVisibility
}
