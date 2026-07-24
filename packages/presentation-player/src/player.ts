import {
  PresentationPlayerController,
  compileTimeline,
  createPresentationMorphCandidates,
  createAnimationPlan,
  matchMorphElements,
  presentationMorphNeedsCrossfade,
  resolveDomAnimationTargets,
  runDomAnimation,
  setDomAnimationFinalState,
  timelineTargetKey,
  type DomAnimationHandle,
  type DomAnimationTargets,
  type TimelineAnimation,
} from '@pptist/presentation-core'
import {
  applySlideBackground,
  elementRange,
  renderElement,
} from './renderer'
import { asCoreTimeline, timelineForSlide } from './timeline'
import { assertPlayerDocument } from './schema'
import type {
  PlayerDocument,
  PlayerElement,
  PlayerOptions,
  PlayerSlide,
  PlayerState,
  PresentationPlayer,
} from './types'

const PLAYER_STYLE_ID = 'pptist-presentation-player-styles'
const PLAYER_CSS = `
.pptist-player-host{position:relative;overflow:hidden;isolation:isolate;background:#111;outline:none}
.pptist-player-viewport{position:absolute;inset:0;overflow:hidden;display:flex;align-items:center;justify-content:center}
.pptist-player-canvas{position:relative;flex:none;overflow:hidden;transform-origin:center center;isolation:isolate;background:#fff}
.pptist-player-slide{position:absolute;inset:0;overflow:hidden;isolation:isolate;transform-origin:center center}
.pptist-player-background{position:absolute;inset:0;z-index:-1;background-position:center}
.pptist-player-element{position:absolute;box-sizing:border-box;transform-origin:center center}
.pptist-player-element>*{box-sizing:border-box}
.pptist-player-group{position:absolute;transform-origin:center center;pointer-events:none}
.pptist-player-group-content{position:absolute;pointer-events:none}
.pptist-player-group .pptist-player-element{pointer-events:auto}
.pptist-player-text,.pptist-player-shape-text{word-break:normal;overflow-wrap:break-word}
.pptist-player-text,.pptist-player-shape-text{outline:0;font-size:16px;white-space:normal}
.pptist-player-text p,.pptist-player-shape-text p{margin:var(--pptist-paragraph-space,5px) 0 0}
.pptist-player-text p:first-child,.pptist-player-shape-text p:first-child{margin-top:0}
.pptist-player-text ul,.pptist-player-text ol,.pptist-player-text li,.pptist-player-shape-text ul,.pptist-player-shape-text ol,.pptist-player-shape-text li{margin:var(--pptist-paragraph-space,5px) 0 0}
.pptist-player-text ul,.pptist-player-shape-text ul{list-style-type:disc;padding-inline-start:1.25em}
.pptist-player-text ol,.pptist-player-shape-text ol{list-style-type:decimal;padding-inline-start:1.25em}
.pptist-player-text code,.pptist-player-shape-text code{background:#f1f1f1;padding:2px 6px;margin:0 1px;border-radius:4px;font-family:SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace}
.pptist-player-text sup,.pptist-player-shape-text sup{vertical-align:super;font-size:smaller}
.pptist-player-text sub,.pptist-player-shape-text sub{vertical-align:sub;font-size:smaller}
.pptist-player-text blockquote,.pptist-player-shape-text blockquote{overflow:hidden;padding:0 1.2em;margin:.6em 0;font-style:italic;border-left:4px solid #e0e0e0}
.pptist-player-text [data-indent='1'],.pptist-player-shape-text [data-indent='1']{padding-left:1em}
.pptist-player-text [data-indent='2'],.pptist-player-shape-text [data-indent='2']{padding-left:2em}
.pptist-player-text [data-indent='3'],.pptist-player-shape-text [data-indent='3']{padding-left:3em}
.pptist-player-text [data-indent='4'],.pptist-player-shape-text [data-indent='4']{padding-left:4em}
.pptist-player-text [data-indent='5'],.pptist-player-shape-text [data-indent='5']{padding-left:5em}
.pptist-player-text [data-indent='6'],.pptist-player-shape-text [data-indent='6']{padding-left:6em}
.pptist-player-text [data-indent='7'],.pptist-player-shape-text [data-indent='7']{padding-left:7em}
.pptist-player-text [data-indent='8'],.pptist-player-shape-text [data-indent='8']{padding-left:8em}
.pptist-player-link{cursor:pointer}
.pptist-player-unsupported{width:100%;height:100%;min-width:90px;min-height:36px;display:flex;align-items:center;justify-content:center;border:1px dashed #d66;background:#fff4f4;color:#a33;font:12px sans-serif}
.pptist-player-table{table-layout:fixed;border-spacing:0;word-wrap:break-word}
.pptist-player-table td{box-sizing:border-box;padding:0;white-space:normal;line-height:1.5;vertical-align:middle;background-clip:padding-box}
.pptist-player-table .pptist-player-cell-text{box-sizing:border-box;display:flex;flex-direction:column;align-items:stretch;padding:5px;line-height:1.5;white-space:pre-wrap}
.pptist-player-audio{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.pptist-player-audio button{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:0;border:0;background:transparent;cursor:pointer}
.pptist-player-audio svg{width:100%;height:100%}
.pptist-player-audio audio{display:none;position:absolute;left:0;top:100%;width:280px;max-width:none}
.pptist-player-audio:hover audio,.pptist-player-audio:focus-within audio{display:block}
`

const ensureStyles = (ownerDocument: Document) => {
  if (ownerDocument.getElementById(PLAYER_STYLE_ID)) return
  const style = ownerDocument.createElement('style')
  style.id = PLAYER_STYLE_ID
  style.textContent = PLAYER_CSS
  ownerDocument.head.appendChild(style)
}

type PlayablePlayerSlide = PlayerSlide & {
  animationTimeline: ReturnType<typeof asCoreTimeline>
}

const hasScopedTarget = (animation: TimelineAnimation) => !!(
  animation.target.paragraphRange ||
  animation.target.characterRange ||
  animation.target.paragraphIndex !== undefined
)

export class DomPresentationPlayer implements PresentationPlayer {
  private readonly ownerDocument: Document
  private readonly viewport: HTMLElement
  private readonly canvas: HTMLElement
  private readonly controller = new PresentationPlayerController<PlayablePlayerSlide>()
  private readonly elementNodes = new Map<string, HTMLElement>()
  private readonly groupNodes = new Map<string, HTMLElement>()
  private readonly cleanupHandlers: Array<() => void> = []
  private readonly preparedTargets = new Map<string, DomAnimationTargets>()
  private slideTransitionAnimations: Animation[] = []
  private slideTransitionGeneration = 0
  private activeLayer?: HTMLElement
  private readonly addedHostClass: boolean
  private readonly originalTabIndex: string | null
  private readonly resizeObserver?: ResizeObserver
  private presentation: PlayerDocument = { width: 1, height: 1, slides: [] }
  private options: PlayerOptions
  private ended = false
  private destroyed = false
  private queue: Promise<PlayerState> = Promise.resolve({ slideIndex: 0, stepIndex: 0, slideCount: 0, ended: false })

  constructor(private readonly host: HTMLElement, options: PlayerOptions = {}) {
    this.options = options
    this.ownerDocument = host.ownerDocument
    ensureStyles(this.ownerDocument)
    this.addedHostClass = !host.classList.contains('pptist-player-host')
    host.classList.add('pptist-player-host')
    if (options.className) host.classList.add(options.className)
    this.originalTabIndex = host.getAttribute('tabindex')
    if (this.originalTabIndex === null) host.tabIndex = 0

    this.viewport = this.ownerDocument.createElement('div')
    this.viewport.className = 'pptist-player-viewport'
    this.canvas = this.ownerDocument.createElement('div')
    this.canvas.className = 'pptist-player-canvas'
    this.viewport.appendChild(this.canvas)
    host.appendChild(this.viewport)

    this.viewport.addEventListener('pointerdown', this.handlePointerDown)
    this.ownerDocument.addEventListener('keydown', this.handleKeyDown)
    const ResizeObserverClass = this.ownerDocument.defaultView?.ResizeObserver
    if (ResizeObserverClass) {
      this.resizeObserver = new ResizeObserverClass(() => this.resize())
      this.resizeObserver.observe(host)
    }
  }

  get state(): PlayerState {
    return {
      slideIndex: this.controller.slideIndex,
      stepIndex: this.controller.stepIndex,
      slideCount: this.presentation.slides.length,
      ended: this.ended,
    }
  }

  load(presentation: PlayerDocument, startIndex = this.options.startIndex || 0) {
    if (this.destroyed) throw new Error('The presentation player has been destroyed.')
    assertPlayerDocument(presentation)

    this.presentation = presentation
    const slides: PlayablePlayerSlide[] = presentation.slides.map(slide => ({
      ...slide,
      animationTimeline: asCoreTimeline(timelineForSlide(slide)),
    }))
    this.controller.load(slides, startIndex)
    this.ended = false
    this.renderCurrentSlide(0)
    this.resize()
    this.emitState()
  }

  play() {
    return this.next()
  }

  next() {
    return this.enqueue(() => this.advance())
  }

  previous() {
    return this.enqueue(async () => {
      const fromIndex = this.controller.slideIndex
      const action = this.controller.previous()
      this.ended = false
      if (action.type === 'animations') this.renderCurrentSlide(action.stepIndex)
      else if (action.type === 'slide') await this.renderCurrentSlide(this.controller.stepIndex, fromIndex, -1)
      this.emitState()
      return this.state
    })
  }

  goTo(slideIndex: number) {
    const fromIndex = this.controller.slideIndex
    this.controller.goTo(slideIndex)
    this.ended = false
    void this.renderCurrentSlide(0, fromIndex, this.controller.slideIndex >= fromIndex ? 1 : -1)
    this.emitState()
    return this.state
  }

  goToStep(slideIndex: number, stepIndex: number) {
    this.controller.seek(slideIndex, stepIndex)
    this.ended = false
    this.renderCurrentSlide(this.controller.stepIndex)
    this.emitState()
    return this.state
  }

  resize() {
    if (this.destroyed) return
    const width = this.presentation.width
    const height = this.presentation.height
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    const fit = this.options.fit || 'contain'
    let scale = 1
    if (fit !== 'none') {
      const widthScale = this.host.clientWidth > 0 ? this.host.clientWidth / width : 1
      const heightScale = this.host.clientHeight > 0 ? this.host.clientHeight / height : widthScale
      scale = fit === 'width' ? widthScale : Math.min(widthScale, heightScale)
    }
    this.canvas.style.transform = `scale(${Math.max(0.0001, scale)})`
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.cancelSlideTransition()
    this.clearPlaybackState()
    this.resizeObserver?.disconnect()
    this.viewport.removeEventListener('pointerdown', this.handlePointerDown)
    this.ownerDocument.removeEventListener('keydown', this.handleKeyDown)
    this.viewport.remove()
    if (this.addedHostClass) this.host.classList.remove('pptist-player-host')
    if (this.options.className) this.host.classList.remove(this.options.className)
    if (this.originalTabIndex === null) this.host.removeAttribute('tabindex')
    else this.host.setAttribute('tabindex', this.originalTabIndex)
  }

  private enqueue(action: () => Promise<PlayerState>) {
    this.queue = this.queue.then(action, action)
    return this.queue
  }

  private async advance(): Promise<PlayerState> {
    if (this.destroyed) return this.state
    const fromIndex = this.controller.slideIndex
    const action = this.controller.next()
    if (action.type === 'animations') {
      await Promise.all(action.step.animations.map(animation => this.runAnimation(animation)))
      this.emitState()
      if (action.step.autoAdvance) return this.advance()
    }
    else if (action.type === 'slide') {
      this.ended = false
      await this.renderCurrentSlide(0, fromIndex, 1)
      this.emitState()
    }
    else if (action.type === 'end') {
      this.ended = true
      this.emitState()
    }
    return this.state
  }

  private async renderCurrentSlide(appliedStepCount: number, fromIndex?: number, direction: 1 | -1 = 1) {
    this.cancelSlideTransition()
    const toIndex = this.controller.slideIndex
    const shouldTransition = fromIndex !== undefined && fromIndex !== toIndex && !!this.activeLayer
    const previousLayer = shouldTransition
      ? this.activeLayer?.cloneNode(true) as HTMLElement | undefined
      : undefined
    this.clearPlaybackState()
    this.canvas.replaceChildren()
    if (previousLayer) this.canvas.appendChild(previousLayer)
    this.elementNodes.clear()
    this.groupNodes.clear()
    const slide = this.controller.currentSlide
    if (!slide) {
      this.activeLayer = undefined
      return
    }

    const layer = this.ownerDocument.createElement('div')
    layer.className = 'pptist-player-slide'
    layer.dataset.pptistSlideId = slide.id
    const background = this.ownerDocument.createElement('div')
    background.className = 'pptist-player-background'
    applySlideBackground(
      background,
      slide.background,
      this.presentation.theme?.backgroundColor,
      url => this.options.resolveResourceUrl ? this.options.resolveResourceUrl(url, 'background') : url,
    )
    layer.appendChild(background)
    this.canvas.appendChild(layer)
    this.activeLayer = layer

    const groups = new Map<string, PlayerElement[]>()
    for (const element of slide.elements) {
      if (!element.groupId) continue
      const members = groups.get(element.groupId) || []
      members.push(element)
      groups.set(element.groupId, members)
    }
    const renderedGroups = new Set<string>()

    slide.elements.forEach((element, index) => {
      if (!element.groupId) {
        const result = renderElement(
          this.ownerDocument,
          element,
          index,
          slide,
          this.presentation,
          this.options,
          slideId => this.goToSlideId(slideId),
          cleanup => this.cleanupHandlers.push(cleanup),
        )
        this.elementNodes.set(element.id, result.root)
        layer.appendChild(result.root)
        return
      }
      if (renderedGroups.has(element.groupId)) return
      renderedGroups.add(element.groupId)
      const members = groups.get(element.groupId) || []
      const range = elementRange(members)
      const group = this.ownerDocument.createElement('div')
      group.className = 'pptist-player-group'
      group.dataset.pptistGroupId = element.groupId
      group.style.left = `${range.minX}px`
      group.style.top = `${range.minY}px`
      group.style.width = `${Math.max(0.01, range.maxX - range.minX)}px`
      group.style.height = `${Math.max(0.01, range.maxY - range.minY)}px`
      group.style.zIndex = String(Math.min(...members.map(member => slide.elements.indexOf(member))) + 1)
      const content = this.ownerDocument.createElement('div')
      content.className = 'pptist-player-group-content'
      content.style.left = `${-range.minX}px`
      content.style.top = `${-range.minY}px`
      content.style.width = `${this.presentation.width}px`
      content.style.height = `${this.presentation.height}px`
      for (const member of members) {
        const memberIndex = slide.elements.indexOf(member)
        const result = renderElement(
          this.ownerDocument,
          member,
          memberIndex,
          slide,
          this.presentation,
          this.options,
          slideId => this.goToSlideId(slideId),
          cleanup => this.cleanupHandlers.push(cleanup),
        )
        this.elementNodes.set(member.id, result.root)
        content.appendChild(result.root)
      }
      group.appendChild(content)
      this.groupNodes.set(element.groupId, group)
      layer.appendChild(group)
    })

    const timeline = slide.animationTimeline
    const firstTargets = new Set<string>()
    for (const animation of timeline.animations) {
      const key = timelineTargetKey(animation.target)
      if (!key || firstTargets.has(key)) continue
      firstTargets.add(key)
      if (animation.effect.class === 'entrance' && !hasScopedTarget(animation)) {
        const target = this.targetNode(animation)
        if (target) target.style.visibility = 'hidden'
      }
    }
    const steps = compileTimeline(timeline)
    for (const step of steps.slice(0, appliedStepCount)) {
      for (const animation of step.animations) this.applyFinalState(animation)
    }
    for (const step of steps.slice(appliedStepCount)) {
      for (const animation of step.animations) {
        if (animation.effect.class !== 'entrance' || !hasScopedTarget(animation)) continue
        const root = this.targetNode(animation)
        if (!root) continue
        const targets = resolveDomAnimationTargets(root, animation.target)
        for (const target of targets.elements) target.style.visibility = 'hidden'
        this.preparedTargets.set(animation.id, targets)
      }
    }

    if (previousLayer && fromIndex !== undefined) {
      const fromSlide = this.presentation.slides[fromIndex]
      if (fromSlide) await this.runSlideTransition(previousLayer, layer, fromSlide, slide, direction)
      else previousLayer.remove()
    }
  }

  private cancelSlideTransition() {
    this.slideTransitionGeneration += 1
    for (const animation of this.slideTransitionAnimations) animation.cancel()
    this.slideTransitionAnimations = []
    for (const layer of Array.from(this.canvas?.children || [])) {
      if (layer !== this.activeLayer) layer.remove()
    }
  }

  private startSlideAnimation(
    node: HTMLElement,
    keyframes: Keyframe[],
    timing: KeyframeAnimationOptions,
  ) {
    if (typeof node.animate !== 'function') return undefined
    const animation = node.animate(keyframes, timing)
    this.slideTransitionAnimations.push(animation)
    return animation
  }

  private transitionMode(fromSlide: PlayerSlide, toSlide: PlayerSlide) {
    if (fromSlide.transition?.type === 'morph' || toSlide.transition?.type === 'morph') return 'morph'
    if (toSlide.turningMode && toSlide.turningMode !== 'random') return toSlide.turningMode
    if (toSlide.turningMode === 'random') {
      const modes = ['slideX', 'slideY', 'slideX3D', 'slideY3D', 'fade', 'rotate', 'scaleY', 'scaleX', 'scale', 'scaleReverse'] as const
      const hash = Array.from(toSlide.id).reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0)
      return modes[hash % modes.length]
    }
    const transition = toSlide.transition
    if (!transition) return 'slideY'
    if (transition.type === 'none' || transition.type === 'cut') return 'no'
    if (transition.type === 'fade' || transition.type === 'dissolve') return 'fade'
    if (['push', 'wipe', 'cover', 'uncover', 'pull'].includes(transition.type)) {
      return transition.direction === 'l' || transition.direction === 'r' ? 'slideX' : 'slideY'
    }
    return 'fade'
  }

  private transitionDuration(fromSlide: PlayerSlide, toSlide: PlayerSlide, mode: string) {
    const transition = toSlide.transition?.type === 'morph'
      ? toSlide.transition
      : fromSlide.transition?.type === 'morph' ? fromSlide.transition : toSlide.transition
    if (transition?.duration !== undefined) return Math.max(0, transition.duration)
    if (mode === 'no') return 0
    if (mode === 'fade') return 750
    if (mode === 'slideX' || mode === 'slideY') return 350
    return 500
  }

  private async runSlideTransition(
    previousLayer: HTMLElement,
    nextLayer: HTMLElement,
    fromSlide: PlayerSlide,
    toSlide: PlayerSlide,
    direction: 1 | -1,
  ) {
    const generation = this.slideTransitionGeneration
    const mode = this.transitionMode(fromSlide, toSlide)
    const duration = this.transitionDuration(fromSlide, toSlide, mode)
    previousLayer.style.pointerEvents = 'none'
    previousLayer.style.zIndex = '0'
    nextLayer.style.zIndex = '1'
    if (!duration || mode === 'no') {
      previousLayer.remove()
      return
    }

    const timing: KeyframeAnimationOptions = {
      duration,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'both',
    }
    const animations = mode === 'morph'
      ? this.runMorphTransition(previousLayer, nextLayer, fromSlide, toSlide, timing)
      : this.runBasicSlideTransition(previousLayer, nextLayer, mode, direction, timing)
    if (!animations.length) {
      previousLayer.remove()
      return
    }
    await Promise.allSettled(animations.map(animation => animation.finished))
    if (generation !== this.slideTransitionGeneration) return
    previousLayer.remove()
    for (const animation of animations) animation.cancel()
    this.slideTransitionAnimations = this.slideTransitionAnimations.filter(animation => !animations.includes(animation))
  }

  private runBasicSlideTransition(
    previousLayer: HTMLElement,
    nextLayer: HTMLElement,
    mode: string,
    direction: 1 | -1,
    timing: KeyframeAnimationOptions,
  ) {
    let previousEnd: Keyframe = { opacity: 0 }
    let nextStart: Keyframe = { opacity: 0 }
    const amount = direction * 100
    if (mode === 'slideX') {
      previousEnd = { transform: `translateX(${-amount}%)` }
      nextStart = { transform: `translateX(${amount}%)` }
    }
    else if (mode === 'slideY') {
      previousEnd = { transform: `translateY(${-amount}%)` }
      nextStart = { transform: `translateY(${amount}%)` }
    }
    else if (mode === 'slideX3D') {
      previousEnd = { transform: `translateX(${-amount}%) scale(.5)` }
      nextStart = { transform: `translateX(${amount}%) scale(.5)` }
    }
    else if (mode === 'slideY3D') {
      previousEnd = { transform: `translateY(${-amount}%) scale(.5)` }
      nextStart = { transform: `translateY(${amount}%) scale(.5)` }
    }
    else if (mode === 'rotate') {
      previousEnd = { transform: `rotate(${direction * 90}deg)` }
      nextStart = { transform: `rotate(${-direction * 90}deg)` }
      previousLayer.style.transformOrigin = '0 0'
      nextLayer.style.transformOrigin = '0 0'
    }
    else if (mode === 'scaleY') {
      previousEnd = { transform: 'scaleY(.1)', opacity: 0 }
      nextStart = { transform: 'scaleY(.1)', opacity: 0 }
    }
    else if (mode === 'scaleX') {
      previousEnd = { transform: 'scaleX(.1)', opacity: 0 }
      nextStart = { transform: 'scaleX(.1)', opacity: 0 }
    }
    else if (mode === 'scale') {
      previousEnd = { transform: 'scale(.25)', opacity: 0 }
      nextStart = { transform: 'scale(.25)', opacity: 0 }
    }
    else if (mode === 'scaleReverse') {
      previousEnd = { transform: 'scale(2)', opacity: 0 }
      nextStart = { transform: 'scale(2)', opacity: 0 }
    }
    return [
      this.startSlideAnimation(previousLayer, [{ transform: 'none', opacity: 1 }, previousEnd], timing),
      this.startSlideAnimation(nextLayer, [nextStart, { transform: 'none', opacity: 1 }], timing),
    ].filter((animation): animation is Animation => !!animation)
  }

  private elementInLayer(layer: HTMLElement, id: string) {
    return Array.from(layer.querySelectorAll<HTMLElement>('[data-pptist-element-id]'))
      .find(element => element.dataset.pptistElementId === id)
  }

  private runMorphTransition(
    previousLayer: HTMLElement,
    nextLayer: HTMLElement,
    fromSlide: PlayerSlide,
    toSlide: PlayerSlide,
    timing: KeyframeAnimationOptions,
  ) {
    const animations: Animation[] = []
    const start = (node: HTMLElement, keyframes: Keyframe[]) => {
      const animation = this.startSlideAnimation(node, keyframes, timing)
      if (animation) animations.push(animation)
    }
    const result = matchMorphElements(
      createPresentationMorphCandidates(fromSlide.elements),
      createPresentationMorphCandidates(toSlide.elements),
    )
    const nextBackground = nextLayer.querySelector<HTMLElement>('.pptist-player-background')
    if (nextBackground) start(nextBackground, [{ opacity: 0 }, { opacity: 1 }])

    for (const match of result.matches) {
      const previous = this.elementInLayer(previousLayer, match.from.id)
      const next = this.elementInLayer(nextLayer, match.to.id)
      if (!previous || !next) continue
      const fromTransform = `translate(${match.from.left - match.to.left}px, ${match.from.top - match.to.top}px) rotate(${match.from.rotate}deg) scale(${match.from.width / match.to.width}, ${match.from.height / match.to.height})`
      const toTransform = `rotate(${match.to.rotate}deg)`
      next.style.transformOrigin = 'top left'
      if (presentationMorphNeedsCrossfade(match.from, match.to)) {
        const previousTransform = `rotate(${match.from.rotate}deg)`
        const previousEnd = `translate(${match.to.left - match.from.left}px, ${match.to.top - match.from.top}px) rotate(${match.to.rotate}deg) scale(${match.to.width / match.from.width}, ${match.to.height / match.from.height})`
        previous.style.transformOrigin = 'top left'
        start(previous, [{ transform: previousTransform, opacity: 1 }, { transform: previousEnd, opacity: 0 }])
        start(next, [{ transform: fromTransform, opacity: 0 }, { transform: toTransform, opacity: 1 }])
      }
      else {
        previous.style.visibility = 'hidden'
        start(next, [{ transform: fromTransform, opacity: 1 }, { transform: toTransform, opacity: 1 }])
      }
    }
    for (const leaving of result.leaving) {
      const node = this.elementInLayer(previousLayer, leaving.id)
      if (node) start(node, [{ opacity: 1 }, { opacity: 0 }])
    }
    for (const entering of result.entering) {
      const node = this.elementInLayer(nextLayer, entering.id)
      if (node) start(node, [{ opacity: 0 }, { opacity: 1 }])
    }
    return animations
  }

  private targetNode(animation: TimelineAnimation) {
    if (animation.target.groupId) return this.groupNodes.get(animation.target.groupId)
    if (animation.target.elementId) return this.elementNodes.get(animation.target.elementId)
    return undefined
  }

  private applyFinalState(animation: TimelineAnimation) {
    const root = this.targetNode(animation)
    if (!root) return
    const canonical = animation.effect.canonical
    if (!canonical) {
      if (animation.effect.class === 'entrance') root.style.visibility = 'visible'
      if (animation.effect.class === 'exit') root.style.visibility = 'hidden'
      return
    }
    const targets = this.preparedTargets.get(animation.id) || resolveDomAnimationTargets(root, animation.target)
    this.preparedTargets.delete(animation.id)
    const plan = createAnimationPlan(canonical, { ...animation.timing, duration: 0, delay: 0 }, {
      viewportWidth: this.presentation.width,
      viewportHeight: this.presentation.height,
    })
    for (const target of targets.elements) setDomAnimationFinalState(target, plan)
    this.cleanupHandlers.push(targets.cleanup)
  }

  private async runAnimation(animation: TimelineAnimation) {
    const root = this.targetNode(animation)
    if (!root) return
    const canonical = animation.effect.canonical
    if (!canonical) {
      this.applyFinalState(animation)
      return
    }
    const targets = this.preparedTargets.get(animation.id) || resolveDomAnimationTargets(root, animation.target)
    this.preparedTargets.delete(animation.id)
    const plan = createAnimationPlan(canonical, animation.timing, {
      viewportWidth: this.presentation.width,
      viewportHeight: this.presentation.height,
    })
    const handles = targets.elements
      .map(element => runDomAnimation(element, plan))
      .filter((handle): handle is DomAnimationHandle => !!handle)
    if (handles.length !== targets.elements.length) {
      for (const handle of handles) handle.restore()
      for (const target of targets.elements) setDomAnimationFinalState(target, plan)
      this.cleanupHandlers.push(targets.cleanup)
      return
    }
    this.cleanupHandlers.push(() => {
      for (const handle of handles) handle.restore()
      targets.cleanup()
    })
    await Promise.all(handles.map(handle => handle.finished))
  }

  private clearPlaybackState() {
    for (const targets of this.preparedTargets.values()) targets.cleanup()
    this.preparedTargets.clear()
    for (const cleanup of this.cleanupHandlers.reverse()) cleanup()
    this.cleanupHandlers.length = 0
  }

  private goToSlideId(slideId: string) {
    const index = this.presentation.slides.findIndex(slide => slide.id === slideId)
    if (index !== -1) this.goTo(index)
  }

  private emitState() {
    this.options.onStateChange?.(this.state)
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    this.host.focus({ preventScroll: true })
    const target = event.target as Element | null
    const interactive = target?.closest('a,button,input,select,textarea,video,audio,.pptist-player-link,[data-pptist-no-advance]')
    if (this.options.clickToAdvance && event.button === 0 && !interactive) void this.next()
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (this.options.keyboard === false || this.ownerDocument.activeElement !== this.host) return
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault()
      void this.next()
    }
    else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault()
      void this.previous()
    }
    else if (event.key === 'Home') {
      event.preventDefault()
      this.goTo(0)
    }
    else if (event.key === 'End') {
      event.preventDefault()
      this.goTo(this.presentation.slides.length - 1)
    }
  }
}

export const createPresentationPlayer = (
  container: HTMLElement,
  presentation: PlayerDocument,
  options: PlayerOptions = {},
): PresentationPlayer => {
  const player = new DomPresentationPlayer(container, options)
  player.load(presentation, options.startIndex)
  return player
}
