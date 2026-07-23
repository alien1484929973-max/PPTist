import JSZip from 'jszip'
import type {
  AnimationTimeline,
  PptxElementSource,
  SlideTransition,
  TimelineAnimation,
  TimelineAnimationClass,
  TimelineTrigger,
} from './types'

export interface PptxSourceElementMetadata extends PptxElementSource {
  order: number
  kind: string
  children?: PptxSourceElementMetadata[]
}

export interface PptxSlideMetadata {
  sourceElements: PptxSourceElementMetadata[]
  transition?: SlideTransition
  animationTimeline?: AnimationTimeline
}

export interface PptxImportMetadata {
  slides: PptxSlideMetadata[]
}

export interface PptxXmlRuntime {
  parse(source: string): XMLDocument
  serialize(node: Node): string
}

export interface LegacyPptAnimation {
  id: string
  elId: string
  effect: string
  type: 'in' | 'out' | 'attention'
  duration: number
  trigger: 'click' | 'meantime' | 'auto'
  delay?: number
  repeatCount?: number
  autoReverse?: boolean
  easing?: string
  source: {
    provider: 'pptx'
    presetClass?: string
    presetId?: number
    presetSubtype?: number
    rawXml?: string
  }
}

const elementChildren = (root: Node) => Array.from(root.childNodes)
  .filter((node): node is Element => node.nodeType === 1)

const elementsByLocalName = (root: Node, name: string) => {
  const matches: Element[] = []
  const visit = (node: Node) => {
    for (const child of elementChildren(node)) {
      if (child.localName === name) matches.push(child)
      visit(child)
    }
  }
  visit(root)
  return matches
}

const firstByLocalName = (root: Node, name: string) => elementsByLocalName(root, name)[0]

const getAttribute = (element: Element | undefined, name: string) => {
  if (!element) return undefined
  const direct = element.getAttribute(name)
  if (direct !== null) return direct
  return Array.from(element.attributes).find(attribute => attribute.localName === name)?.value
}

const finiteNumber = (value: string | undefined, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const parseDuration = (value: string | undefined, fallback = 500) => {
  if (!value || value === 'indefinite') return fallback
  return Math.max(0, finiteNumber(value, fallback))
}

const parseRepeatCount = (value: string | undefined) => {
  if (!value) return undefined
  if (value === 'indefinite') return -1
  const count = finiteNumber(value, 1)
  return count >= 1000 ? count / 1000 : count
}

const parseTransition = (document: XMLDocument): SlideTransition | undefined => {
  const node = firstByLocalName(document, 'transition')
  if (!node) return undefined

  // Modern PowerPoint stores Morph inside transition/extLst/ext instead of as
  // a direct transition child. Search it explicitly before normal OOXML
  // transition effects so a real Office-generated file is recognized.
  const morphEffect = firstByLocalName(node, 'morph')
  const effect = morphEffect || elementChildren(node).find(child => !['sndAc', 'extLst'].includes(child.localName))
  if (!effect) {
    return {
      type: 'none',
      duration: 0,
      source: 'pptx',
    }
  }

  const durationAttribute = Array.from(node.attributes).find(attribute => attribute.localName === 'dur')?.value
  const speed = getAttribute(node, 'spd')
  const speedDuration = speed === 'slow' ? 1000 : speed === 'fast' ? 500 : 800
  const duration = parseDuration(durationAttribute || getAttribute(effect, 'dur'), speedDuration)
  const autoAdvance = getAttribute(node, 'advTm')

  if (morphEffect) {
    const option = getAttribute(morphEffect, 'option')
    const mode = option === 'byWord' || option === 'byChar' ? option : 'byObject'
    return {
      type: 'morph',
      duration,
      autoAdvanceAfter: autoAdvance ? finiteNumber(autoAdvance) : undefined,
      morph: { mode },
      source: 'pptx',
    }
  }

  return {
    type: effect.localName,
    duration,
    direction: getAttribute(effect, 'dir') || null,
    autoAdvanceAfter: autoAdvance ? finiteNumber(autoAdvance) : undefined,
    source: 'pptx',
  }
}

const findDirectSourceNodes = (parent: Element) => elementChildren(parent).filter(child => {
  return ['sp', 'pic', 'graphicFrame', 'cxnSp', 'grpSp', 'contentPart'].includes(child.localName)
})

const parseSourceElements = (document: XMLDocument, slideIndex: number) => {
  const shapeTree = firstByLocalName(document, 'spTree')
  if (!shapeTree) return []

  const parseNodes = (nodes: Element[]): PptxSourceElementMetadata[] => nodes.map((node, order) => {
    const nonVisualProperties = firstByLocalName(node, 'cNvPr')
    const creationNode = firstByLocalName(node, 'creationId')
    const source: PptxSourceElementMetadata = {
      provider: 'pptx',
      slideIndex,
      shapeId: getAttribute(nonVisualProperties, 'id') || `${slideIndex}:${order}`,
      name: getAttribute(nonVisualProperties, 'name'),
      creationId: getAttribute(creationNode, 'id') || getAttribute(creationNode, 'val'),
      order,
      kind: node.localName,
    }

    if (node.localName === 'grpSp') {
      const children = findDirectSourceNodes(node)
      if (children.length) source.children = parseNodes(children)
    }
    return source
  })

  return parseNodes(findDirectSourceNodes(shapeTree))
}

const parseTrigger = (timeNode: Element): TimelineTrigger => {
  const nodeType = getAttribute(timeNode, 'nodeType')
  if (nodeType === 'withEffect') return 'withPrevious'
  if (nodeType === 'afterEffect') return 'afterPrevious'
  if (nodeType === 'clickEffect' || nodeType === 'interactiveSeq') return 'click'

  const startCondition = firstByLocalName(timeNode, 'stCondLst')
  const event = getAttribute(firstByLocalName(startCondition || timeNode, 'cond'), 'evt')
  if (event === 'onClick' || event === 'onShapeClick') return 'click'
  return 'auto'
}

const animationClass = (value?: string): TimelineAnimationClass => {
  if (value === 'entr') return 'entrance'
  if (value === 'exit') return 'exit'
  if (value === 'emph') return 'emphasis'
  if (value === 'path') return 'motionPath'
  if (value === 'mediacall') return 'media'
  return 'unknown'
}

const parseTimeline = (document: XMLDocument, xmlRuntime: PptxXmlRuntime): AnimationTimeline | undefined => {
  const timing = firstByLocalName(document, 'timing')
  if (!timing) return undefined

  const animations: TimelineAnimation[] = []
  const timeNodes = elementsByLocalName(timing, 'cTn')

  for (const timeNode of timeNodes) {
    const presetClass = getAttribute(timeNode, 'presetClass')
    if (!presetClass) continue

    const container = timeNode.parentElement || timeNode
    const shapeTarget = firstByLocalName(container, 'spTgt')
    const sourceShapeId = getAttribute(shapeTarget, 'spid')
    if (!sourceShapeId) continue
    const paragraphRange = firstByLocalName(shapeTarget, 'pRg')
    const characterRange = firstByLocalName(shapeTarget, 'charRg')

    const startList = firstByLocalName(timeNode, 'stCondLst')
    const startCondition = firstByLocalName(startList || timeNode, 'cond')
    const delay = parseDuration(getAttribute(startCondition, 'delay'), 0)
    const motion = firstByLocalName(container, 'animMotion')
    const rotation = firstByLocalName(container, 'animRot')
    const scale = firstByLocalName(container, 'animScale')
    const effect = firstByLocalName(container, 'animEffect')
    const scaleBy = firstByLocalName(scale || container, 'by')
    const behaviorDuration = elementsByLocalName(container, 'cTn')
      .filter(candidate => candidate !== timeNode)
      .map(candidate => getAttribute(candidate, 'dur'))
      .find(value => value && value !== 'indefinite')
    const durationValue = getAttribute(timeNode, 'dur')
    const parsedAnimationClass = animationClass(presetClass)
    const presetId = finiteNumber(getAttribute(timeNode, 'presetID')) || undefined
    const repeatCount = parseRepeatCount(getAttribute(timeNode, 'repeatCount'))
    const autoReverse = getAttribute(timeNode, 'autoRev') === '1'
    const acceleration = finiteNumber(getAttribute(timeNode, 'accel')) / 100000
    const deceleration = finiteNumber(getAttribute(timeNode, 'decel')) / 100000
    const effectDescriptor = `${getAttribute(effect, 'filter') || ''} ${getAttribute(effect, 'transition') || ''}`.toLocaleLowerCase()
    const hasFlyDirection = ['left', 'right', 'up', 'top', 'down', 'bottom'].some(direction => effectDescriptor.includes(direction))
    const hasLegacyEquivalent = (parsedAnimationClass === 'entrance' || parsedAnimationClass === 'exit') && (
      [10, 23, 26, 32].includes(presetId || 0) || (presetId === 2 && hasFlyDirection)
    )
    let compatibility: TimelineAnimation['effect']['compatibility'] = parsedAnimationClass === 'motionPath' || parsedAnimationClass === 'media' || parsedAnimationClass === 'unknown'
      ? 'unsupported'
      : paragraphRange || characterRange
        ? 'approximate'
        : hasLegacyEquivalent ? 'mapped' : 'approximate'
    if (compatibility === 'mapped' && (acceleration || deceleration || repeatCount === -1)) compatibility = 'approximate'

    animations.push({
      id: `pptx-${getAttribute(timeNode, 'id') || animations.length + 1}`,
      target: {
        sourceShapeId,
        paragraphIndex: paragraphRange ? finiteNumber(getAttribute(paragraphRange, 'st')) : undefined,
        paragraphRange: paragraphRange ? {
          start: finiteNumber(getAttribute(paragraphRange, 'st')),
          end: finiteNumber(getAttribute(paragraphRange, 'end')),
        } : undefined,
        characterRange: characterRange ? {
          start: finiteNumber(getAttribute(characterRange, 'st')),
          end: finiteNumber(getAttribute(characterRange, 'end')),
        } : undefined,
      },
      timing: {
        duration: parseDuration(durationValue === 'indefinite' ? behaviorDuration : durationValue),
        delay,
        trigger: parseTrigger(timeNode),
        repeatCount,
        autoReverse,
        acceleration,
        deceleration,
      },
      effect: {
        class: parsedAnimationClass,
        compatibility,
        presetId,
        presetSubtype: finiteNumber(getAttribute(timeNode, 'presetSubtype')) || undefined,
        filter: getAttribute(effect, 'filter'),
        direction: getAttribute(effect, 'transition'),
        motionPath: getAttribute(motion, 'path'),
        rotateBy: getAttribute(rotation, 'by') ? finiteNumber(getAttribute(rotation, 'by')) / 60000 : undefined,
        scaleBy: scaleBy ? {
          x: finiteNumber(getAttribute(scaleBy, 'x'), 100000) / 100000,
          y: finiteNumber(getAttribute(scaleBy, 'y'), 100000) / 100000,
        } : undefined,
      },
      source: {
        provider: 'pptx',
        timeNodeId: getAttribute(timeNode, 'id'),
        rawXml: xmlRuntime.serialize(container),
      },
    })
  }

  return animations.length ? { version: 1, animations } : undefined
}

const directionSuffix = (animation: TimelineAnimation) => {
  const descriptor = `${animation.effect.filter || ''} ${animation.effect.direction || ''}`.toLocaleLowerCase()
  if (descriptor.includes('left')) return 'Left'
  if (descriptor.includes('right')) return 'Right'
  if (descriptor.includes('up') || descriptor.includes('top')) return 'Up'
  if (descriptor.includes('down') || descriptor.includes('bottom')) return 'Down'
  return ''
}

const legacyEffect = (animation: TimelineAnimation) => {
  const leaving = animation.effect.class === 'exit'
  const suffix = directionSuffix(animation)
  const presetId = animation.effect.presetId

  if (animation.effect.class === 'emphasis') return 'pulse'
  if (presetId === 2 && suffix) return `fade${leaving ? 'Out' : 'In'}${suffix}`
  if (presetId === 23) return leaving ? 'zoomOut' : 'zoomIn'
  if (presetId === 26) return leaving ? 'bounceOut' : 'bounceIn'
  if (presetId === 32) {
    return leaving
      ? `lightSpeedOut${suffix === 'Left' ? 'Left' : 'Right'}`
      : `lightSpeedIn${suffix === 'Left' ? 'Left' : 'Right'}`
  }
  return leaving ? 'fadeOut' : 'fadeIn'
}

export const createLegacyPptAnimations = (
  timeline: AnimationTimeline | undefined,
  resolveElementId: (sourceShapeId: string) => string | undefined,
): LegacyPptAnimation[] => {
  if (!timeline) return []

  return timeline.animations.flatMap(animation => {
    if (animation.effect.compatibility === 'unsupported') return []
    const sourceShapeId = animation.target.sourceShapeId
    const elId = sourceShapeId ? resolveElementId(sourceShapeId) : undefined
    if (!elId) return []

    return [{
      id: animation.id,
      elId,
      effect: legacyEffect(animation),
      type: animation.effect.class === 'exit'
        ? 'out'
        : animation.effect.class === 'emphasis' ? 'attention' : 'in',
      duration: animation.timing.duration,
      trigger: animation.timing.trigger === 'withPrevious'
        ? 'meantime'
        : animation.timing.trigger === 'afterPrevious' || animation.timing.trigger === 'auto' ? 'auto' : 'click',
      delay: animation.timing.delay || undefined,
      repeatCount: animation.timing.repeatCount,
      autoReverse: animation.timing.autoReverse,
      easing: animation.timing.acceleration && animation.timing.deceleration
        ? 'ease-in-out'
        : animation.timing.acceleration ? 'ease-in' : animation.timing.deceleration ? 'ease-out' : undefined,
      source: {
        provider: 'pptx',
        presetClass: animation.effect.class,
        presetId: animation.effect.presetId,
        presetSubtype: animation.effect.presetSubtype,
      },
    }]
  })
}

const browserXmlRuntime = (): PptxXmlRuntime => {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    throw new Error('PPTX metadata parsing requires an XML runtime')
  }
  return {
    parse: source => new DOMParser().parseFromString(source, 'application/xml'),
    serialize: node => new XMLSerializer().serializeToString(node),
  }
}

const parseXml = (source: string, xmlRuntime: PptxXmlRuntime) => {
  const document = xmlRuntime.parse(source)
  if (firstByLocalName(document, 'parsererror')) throw new Error('Invalid PPTX slide XML')
  return document
}

export const parsePptxImportMetadata = async (
  file: ArrayBuffer,
  xmlRuntime: PptxXmlRuntime = browserXmlRuntime(),
): Promise<PptxImportMetadata> => {
  const zip = await JSZip.loadAsync(file)
  const slideFiles = Object.keys(zip.files)
    .filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((left, right) => finiteNumber(/slide(\d+)\.xml$/.exec(left)?.[1]) - finiteNumber(/slide(\d+)\.xml$/.exec(right)?.[1]))

  const slides = await Promise.all(slideFiles.map(async (path, slideIndex): Promise<PptxSlideMetadata> => {
    const xml = await zip.file(path)!.async('string')
    const document = parseXml(xml, xmlRuntime)
    return {
      sourceElements: parseSourceElements(document, slideIndex),
      transition: parseTransition(document),
      animationTimeline: parseTimeline(document, xmlRuntime),
    }
  }))

  return { slides }
}
