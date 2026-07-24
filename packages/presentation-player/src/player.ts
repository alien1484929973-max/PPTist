import {
  PresentationPlayerController,
  compileTimeline,
  createAnimationPlan,
  resolveDomAnimationTargets,
  runDomAnimation,
  setDomAnimationFinalState,
  timelineTargetKey,
  type DomAnimationHandle,
  type TimelineAnimation,
} from '@pptist/presentation-core'
import {
  applySlideBackground,
  elementRange,
  renderElement,
} from './renderer'
import { asCoreTimeline, timelineForSlide } from './timeline'
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
.pptist-player-element{position:absolute;box-sizing:border-box;transform-origin:center center}
.pptist-player-element>*{box-sizing:border-box}
.pptist-player-group{position:absolute;transform-origin:center center;pointer-events:none}
.pptist-player-group-content{position:absolute;pointer-events:none}
.pptist-player-group .pptist-player-element{pointer-events:auto}
.pptist-player-text,.pptist-player-shape-text{word-break:break-word;overflow-wrap:anywhere}
.pptist-player-text p,.pptist-player-shape-text p{margin:0 0 var(--pptist-paragraph-space,5px)}
.pptist-player-link{cursor:pointer}
.pptist-player-unsupported{width:100%;height:100%;min-width:90px;min-height:36px;display:flex;align-items:center;justify-content:center;border:1px dashed #d66;background:#fff4f4;color:#a33;font:12px sans-serif}
.pptist-player-table td{box-sizing:border-box;padding:4px;white-space:pre-wrap}
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
    if (!presentation || !Array.isArray(presentation.slides)) throw new TypeError('A presentation with a slides array is required.')
    if (!(presentation.width > 0) || !(presentation.height > 0)) throw new TypeError('Presentation width and height must be positive numbers.')

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
    return this.enqueue(() => {
      const action = this.controller.previous()
      this.ended = false
      if (action.type === 'animations') this.renderCurrentSlide(action.stepIndex)
      else if (action.type === 'slide') this.renderCurrentSlide(this.controller.stepIndex)
      this.emitState()
      return Promise.resolve(this.state)
    })
  }

  goTo(slideIndex: number) {
    this.controller.goTo(slideIndex)
    this.ended = false
    this.renderCurrentSlide(0)
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
    const action = this.controller.next()
    if (action.type === 'animations') {
      await Promise.all(action.step.animations.map(animation => this.runAnimation(animation)))
      this.emitState()
      if (action.step.autoAdvance) return this.advance()
    }
    else if (action.type === 'slide') {
      this.ended = false
      this.renderCurrentSlide(0)
      this.emitState()
    }
    else if (action.type === 'end') {
      this.ended = true
      this.emitState()
    }
    return this.state
  }

  private renderCurrentSlide(appliedStepCount: number) {
    this.clearPlaybackState()
    this.canvas.replaceChildren()
    this.elementNodes.clear()
    this.groupNodes.clear()
    const slide = this.controller.currentSlide
    if (!slide) return
    applySlideBackground(this.canvas, slide.background, this.presentation.theme?.backgroundColor)

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
        )
        this.elementNodes.set(element.id, result.root)
        this.canvas.appendChild(result.root)
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
        )
        this.elementNodes.set(member.id, result.root)
        content.appendChild(result.root)
      }
      group.appendChild(content)
      this.groupNodes.set(element.groupId, group)
      this.canvas.appendChild(group)
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
    const targets = resolveDomAnimationTargets(root, animation.target)
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
    const targets = resolveDomAnimationTargets(root, animation.target)
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
