import type {
  ElementRendererContext,
  PlayerDocument,
  PlayerElement,
  PlayerOptions,
  PlayerWidgetIssue,
  PlayerWidgetOccurrence,
  PlayerWidgetRequirement,
  PlayerWidgetRequirementReport,
  PlayerWidgetRendererContext,
  PlayerWidgetScrollMode,
  PresentationWidgetDefinition,
  PresentationWidgetRegistry,
} from './types'
import { timelineForSlide } from './timeline'

const majorVersion = (version: string | undefined) => {
  const match = version?.match(/\d+/)
  return match ? Number(match[0]) : undefined
}

export const isPresentationWidgetVersionCompatible = (
  requested: string | undefined,
  provided: string | undefined,
) => {
  if (!requested || requested === '*') return true
  if (!provided) return false
  if (requested === provided) return true
  if (/^(\^|~)?\d+(?:\.x)?$/i.test(requested)) {
    return majorVersion(requested) === majorVersion(provided)
  }
  return false
}

export const definePresentationWidget = <T extends PresentationWidgetDefinition>(definition: T): T => definition

const widgetIssue = (
  element: PlayerElement,
  slideId: string,
  registry: PresentationWidgetRegistry,
): PlayerWidgetIssue | undefined => {
  const widgetId = element.widgetId?.trim()
  if (!widgetId) {
    return {
      code: 'missing-widget-id',
      severity: 'blocking',
      slideId,
      elementId: element.id,
      message: `Widget element "${element.id}" does not declare widgetId.`,
    }
  }
  const definition = registry[widgetId]
  if (!definition) {
    return {
      code: 'missing-widget',
      severity: 'blocking',
      widgetId,
      requestedVersion: element.widgetVersion,
      slideId,
      elementId: element.id,
      message: `Widget "${widgetId}" is not registered.`,
    }
  }
  if (!isPresentationWidgetVersionCompatible(element.widgetVersion, definition.version)) {
    return {
      code: 'version-mismatch',
      severity: 'blocking',
      widgetId,
      requestedVersion: element.widgetVersion,
      providedVersion: definition.version,
      slideId,
      elementId: element.id,
      message: `Widget "${widgetId}" requires ${element.widgetVersion}, but ${definition.version || 'an unversioned implementation'} is registered.`,
    }
  }
  return undefined
}

export const inspectPresentationRequirements = (
  presentation: PlayerDocument,
  registry: PresentationWidgetRegistry = {},
): PlayerWidgetRequirementReport => {
  const requirements = new Map<string, PlayerWidgetRequirement>()
  const issues: PlayerWidgetIssue[] = []

  presentation.slides.forEach((slide, slideIndex) => {
    const timeline = timelineForSlide(slide)
    for (const element of slide.elements) {
      if (element.type !== 'widget') continue
      const widgetId = element.widgetId?.trim() || ''
      const entrance = timeline.animations.find(animation =>
        animation.target.elementId === element.id && animation.effect.class === 'entrance')
      const occurrence: PlayerWidgetOccurrence = {
        slideIndex,
        slideId: slide.id,
        elementId: element.id,
        bounds: {
          left: element.left,
          top: element.top,
          width: element.width,
          height: element.height || 0,
        },
        stateKey: element.widgetStateKey || element.id,
        scrollMode: element.widgetScroll?.mode || 'internal',
        mountPolicy: element.widgetMountPolicy || 'eager',
        interactive: element.widgetInteractive !== false,
        reveal: entrance ? 'animation' : 'slide',
        animationId: entrance?.id,
      }
      const requirement = requirements.get(widgetId) || {
        widgetId,
        requestedVersions: [],
        occurrences: [],
      }
      if (element.widgetVersion && !requirement.requestedVersions.includes(element.widgetVersion)) {
        requirement.requestedVersions.push(element.widgetVersion)
      }
      requirement.occurrences.push(occurrence)
      requirements.set(widgetId, requirement)

      const issue = widgetIssue(element, slide.id, registry)
      if (issue) issues.push(issue)
    }
  })

  return {
    compatible: !issues.some(issue => issue.severity === 'blocking'),
    requirements: Array.from(requirements.values()),
    issues,
  }
}

const applyWidgetLayout = (
  element: PlayerElement,
  viewport: HTMLElement,
  content: HTMLElement,
  mode: PlayerWidgetScrollMode,
) => {
  viewport.className = `pptist-player-widget-viewport pptist-player-widget-${mode}`
  content.className = 'pptist-player-widget-content'
  viewport.dataset.pptistScroll = mode === 'fit' ? 'false' : 'true'
  viewport.dataset.pptistOverscroll = element.widgetScroll?.overscroll || 'contain'

  if (mode === 'fit') {
    const width = Math.max(1, element.widgetScroll?.intrinsicWidth || element.width)
    const height = Math.max(1, element.widgetScroll?.intrinsicHeight || element.height || 1)
    const scale = Math.min(element.width / width, (element.height || 1) / height)
    content.style.position = 'absolute'
    content.style.left = '50%'
    content.style.top = '50%'
    content.style.width = `${width}px`
    content.style.height = `${height}px`
    content.style.transform = `translate(-50%, -50%) scale(${Math.max(0.0001, scale)})`
    content.style.transformOrigin = 'center center'
    return
  }

  content.style.width = '100%'
  if (mode === 'internal') content.style.height = '100%'
  else {
    const intrinsicHeight = element.widgetScroll?.intrinsicHeight
    content.style.minHeight = intrinsicHeight && intrinsicHeight > 0
      ? `${Math.max(element.height || 0, intrinsicHeight)}px`
      : '100%'
  }
  viewport.tabIndex = 0
}

export const renderPresentationWidget = (
  context: ElementRendererContext,
  options: Pick<PlayerOptions, 'widgets' | 'onWidgetIssue'>,
) => {
  const { element, container } = context
  const issue = widgetIssue(element, context.slide.id, options.widgets || {})
  if (issue) {
    options.onWidgetIssue?.(issue)
    return undefined
  }

  const widgetId = element.widgetId!.trim()
  const definition = options.widgets![widgetId]
  const root = container.ownerDocument.createElement('div')
  root.className = 'pptist-player-widget'
  root.dataset.pptistWidget = widgetId
  root.dataset.pptistWidgetStateKey = element.widgetStateKey || element.id
  if (element.widgetInteractive !== false) root.dataset.pptistInteractive = 'true'

  const viewport = container.ownerDocument.createElement('div')
  const content = container.ownerDocument.createElement('div')
  const scrollMode = element.widgetScroll?.mode || 'internal'
  applyWidgetLayout(element, viewport, content, scrollMode)
  viewport.appendChild(content)
  root.appendChild(viewport)

  let mounted = false
  let mountCleanup: (() => void) | undefined
  let observer: MutationObserver | undefined
  const mount = () => {
    if (mounted) return
    mounted = true
    observer?.disconnect()
    const cleanups: Array<() => void> = []
    const widgetContext: PlayerWidgetRendererContext = {
      ...context,
      widgetId,
      widgetVersion: definition.version,
      props: Object.freeze({ ...(element.widgetProps || {}) }),
      stateKey: element.widgetStateKey || element.id,
      scrollMode,
      viewport,
      content,
      onCleanup: cleanup => cleanups.push(cleanup),
    }
    const rendered = definition.render(widgetContext)
    if (rendered) content.appendChild(rendered)
    mountCleanup = () => {
      for (const cleanup of cleanups.reverse()) cleanup()
    }
  }

  if ((element.widgetMountPolicy || 'eager') === 'onReveal') {
    const MutationObserverClass = container.ownerDocument.defaultView?.MutationObserver
    if (MutationObserverClass) {
      observer = new MutationObserverClass(() => {
        if (container.style.visibility !== 'hidden') mount()
      })
      observer.observe(container, { attributes: true, attributeFilter: ['style', 'class'] })
    }
    const schedule = container.ownerDocument.defaultView?.queueMicrotask || queueMicrotask
    schedule(() => {
      if (container.isConnected && container.style.visibility !== 'hidden') mount()
    })
  }
  else mount()

  context.onCleanup(() => {
    observer?.disconnect()
    mountCleanup?.()
  })
  return root
}
