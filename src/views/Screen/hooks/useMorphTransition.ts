import { nextTick, onUnmounted, watch, type Ref } from 'vue'
import {
  createPresentationMorphCandidates,
  matchMorphElements,
  presentationMorphNeedsAnimation,
  presentationMorphNeedsCrossfade,
} from '@pptist/presentation-core'
import type { Slide } from '@/types/slides'

export default (
  rootRef: Ref<HTMLElement | null>,
  slides: Ref<Slide[]>,
  slideIndex: Ref<number>,
) => {
  let runningAnimations: Animation[] = []
  let temporaryNodes: HTMLElement[] = []
  let runId = 0

  const cancelRunningAnimations = () => {
    for (const animation of runningAnimations) animation.cancel()
    for (const node of temporaryNodes) node.remove()
    runningAnimations = []
    temporaryNodes = []
  }

  const queryElement = (slideId: string, elementId: string) => {
    const slide = rootRef.value?.querySelector<HTMLElement>(`[data-slide-id="${CSS.escape(slideId)}"]`)
    return slide?.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(elementId)}"] [class^="base-element-"]`) || null
  }

  const runMorph = async (toIndex: number, fromIndex: number) => {
    const currentRunId = ++runId
    cancelRunningAnimations()

    const fromSlide = slides.value[fromIndex]
    const toSlide = slides.value[toIndex]
    if (!fromSlide || !toSlide) return

    const transition = toSlide.transition?.type === 'morph' ? toSlide.transition : undefined
    if (!transition) return

    const result = matchMorphElements(
      createPresentationMorphCandidates(fromSlide.elements),
      createPresentationMorphCandidates(toSlide.elements),
      transition.morph,
    )
    // The watcher runs before Vue patches the slide list, so this is the last
    // reliable moment to snapshot elements that only exist on the leaving page.
    const leavingClones = result.leaving.flatMap(leaving => {
      const source = queryElement(fromSlide.id, leaving.id)
      if (!source) return []
      return [{ leaving, node: source.cloneNode(true) as HTMLElement }]
    })
    const matchedClones = new Map(result.matches.flatMap(match => {
      if (!presentationMorphNeedsCrossfade(match.from, match.to)) return []
      const source = queryElement(fromSlide.id, match.from.id)
      if (!source) return []
      return [[match.from.id, source.cloneNode(true) as HTMLElement] as const]
    }))
    const sourceSlideElement = rootRef.value?.querySelector<HTMLElement>(`[data-slide-id="${CSS.escape(fromSlide.id)}"]`)
    const sourceBackgroundClone = sourceSlideElement
      ?.querySelector<HTMLElement>('.background')
      ?.cloneNode(true) as HTMLElement | undefined

    await nextTick()
    if (currentRunId !== runId || !rootRef.value) return

    const duration = Math.max(100, transition.duration || 700)
    const timing: KeyframeAnimationOptions = {
      duration,
      easing: 'cubic-bezier(0.33, 0, 0.15, 1)',
      fill: 'both',
    }

    const currentSlideElement = rootRef.value.querySelector<HTMLElement>(`[data-slide-id="${CSS.escape(toSlide.id)}"]`)
    const background = currentSlideElement?.querySelector<HTMLElement>('.background')
    if (background) runningAnimations.push(background.animate([{ opacity: 0 }, { opacity: 1 }], timing))
    const targetStage = currentSlideElement?.querySelector<HTMLElement>('.screen-slide')

    if (targetStage) {
      if (sourceBackgroundClone) {
        sourceBackgroundClone.setAttribute('aria-hidden', 'true')
        sourceBackgroundClone.style.zIndex = '-2'
        sourceBackgroundClone.style.pointerEvents = 'none'
        targetStage.appendChild(sourceBackgroundClone)
        temporaryNodes.push(sourceBackgroundClone)
      }
      for (const { leaving, node } of leavingClones) {
        node.removeAttribute('id')
        node.setAttribute('aria-hidden', 'true')
        node.style.pointerEvents = 'none'
        node.style.zIndex = `${1000 + leaving.order}`
        targetStage.appendChild(node)
        temporaryNodes.push(node)
        runningAnimations.push(node.animate([
          // Element-level opacity is already rendered inside the clone. The
          // animated opacity here is only a transition multiplier.
          { opacity: 1 },
          { opacity: 0 },
        ], timing))
      }
    }

    for (const match of result.matches) {
      const target = queryElement(toSlide.id, match.to.id)
      if (!target) continue

      // A mathematically no-op transform still makes Chromium re-rasterize
      // text and images, which can cause a one-frame vertical jump.
      if (!presentationMorphNeedsAnimation(match.from, match.to)) continue

      const scaleX = match.from.width / match.to.width
      const scaleY = match.from.height / match.to.height
      const fromCenterX = match.from.left + match.from.width / 2
      const fromCenterY = match.from.top + match.from.height / 2
      const toCenterX = match.to.left + match.to.width / 2
      const toCenterY = match.to.top + match.to.height / 2
      const translateX = fromCenterX - toCenterX
      const translateY = fromCenterY - toCenterY
      const rotate = match.from.rotate - match.to.rotate
      const sourceClone = matchedClones.get(match.from.id)

      if (targetStage && sourceClone) {
        sourceClone.removeAttribute('id')
        sourceClone.setAttribute('aria-hidden', 'true')
        sourceClone.style.pointerEvents = 'none'
        sourceClone.style.zIndex = `${1000 + match.from.order}`
        targetStage.appendChild(sourceClone)
        temporaryNodes.push(sourceClone)
        runningAnimations.push(sourceClone.animate([
          {
            transform: 'translate(0, 0) rotate(0deg) scale(1, 1)',
            opacity: 1,
          },
          {
            transform: `translate(${-translateX}px, ${-translateY}px) rotate(${-rotate}deg) scale(${1 / scaleX}, ${1 / scaleY})`,
            opacity: .85,
            offset: .35,
          },
          {
            transform: `translate(${-translateX}px, ${-translateY}px) rotate(${-rotate}deg) scale(${1 / scaleX}, ${1 / scaleY})`,
            opacity: 0,
            offset: 1,
          },
        ], timing))
      }

      runningAnimations.push(target.animate([
        {
          transform: `translate(${translateX}px, ${translateY}px) rotate(${rotate}deg) scale(${scaleX}, ${scaleY})`,
          opacity: sourceClone ? 0 : 1,
          offset: 0,
        },
        {
          transform: `translate(${translateX * .65}px, ${translateY * .65}px) rotate(${rotate * .65}deg) scale(${1 + (scaleX - 1) * .65}, ${1 + (scaleY - 1) * .65})`,
          opacity: sourceClone ? .15 : 1,
          offset: .35,
        },
        {
          transform: 'translate(0, 0) rotate(0deg) scale(1, 1)',
          opacity: 1,
          offset: 1,
        },
      ], timing))
    }

    for (const entering of result.entering) {
      const target = queryElement(toSlide.id, entering.id)
      if (target) runningAnimations.push(target.animate([{ opacity: 0 }, { opacity: 1 }], timing))
    }

    await Promise.allSettled(runningAnimations.map(animation => animation.finished))
    if (currentRunId !== runId) return
    cancelRunningAnimations()
  }

  watch(slideIndex, (current, previous) => void runMorph(current, previous))
  onUnmounted(() => {
    runId++
    cancelRunningAnimations()
  })
}
