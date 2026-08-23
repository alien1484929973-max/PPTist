import type {
  AnimationTimeline,
  CanonicalAnimationEffect,
  SlideTransition,
  TimelineAnimation,
} from './types'

export type PptxExportCompatibility = 'exact' | 'approximate' | 'flattened' | 'unsupported'

export interface PptxExportIssue {
  status: PptxExportCompatibility
  feature: 'transition' | 'animation' | 'widget'
  slideId: string
  elementId?: string
  animationId?: string
  message: string
}

export interface PptxExportCompatibilityReport {
  status: PptxExportCompatibility
  counts: Record<PptxExportCompatibility, number>
  issues: PptxExportIssue[]
}

export interface PptxExportSlideLike {
  id: string
  turningMode?: string
  transition?: SlideTransition
  animationTimeline?: AnimationTimeline
  elements?: Array<{ id: string; type: string; poster?: string }>
}

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const transitionDirection = (direction: string | null | undefined) => {
  if (direction === 'left' || direction === 'l') return 'l'
  if (direction === 'right' || direction === 'r') return 'r'
  if (direction === 'up' || direction === 'u') return 'u'
  if (direction === 'down' || direction === 'd') return 'd'
  return undefined
}

export const editorTurningModeTransition = (turningMode?: string): SlideTransition | undefined => {
  if (!turningMode || turningMode === 'no') return { type: 'none', duration: 0, source: 'editor' }
  if (turningMode === 'fade') return { type: 'fade', duration: 700, source: 'editor' }
  if (turningMode === 'slideX' || turningMode === 'slideX3D') {
    return { type: 'push', direction: 'l', duration: 700, source: 'editor' }
  }
  if (turningMode === 'slideY' || turningMode === 'slideY3D') {
    return { type: 'push', direction: 'u', duration: 700, source: 'editor' }
  }
  return { type: 'fade', duration: 700, source: 'editor' }
}

export const writePptxTransition = (transition?: SlideTransition) => {
  if (!transition) return ''
  const duration = Math.max(0, Math.round(transition.duration || 0))
  const advance = transition.autoAdvanceAfter === undefined
    ? ''
    : ` advTm="${Math.max(0, Math.round(transition.autoAdvanceAfter))}"`
  const attributes = ` p14:dur="${duration}"${advance}`
  if (transition.type === 'none' || transition.type === 'no') {
    return `<p:transition${attributes}><p:cut/></p:transition>`
  }
  if (transition.type === 'morph') {
    const option = transition.morph?.mode || 'byObject'
    return `<p:transition${attributes}><p:extLst><p:ext uri="{9D8B030D-6E8B-4F1D-A177-3A5BDBA764F8}"><p159:morph option="${option}"/></p:ext></p:extLst></p:transition>`
  }
  const direction = transitionDirection(transition.direction)
  const effect = ['fade', 'dissolve', 'cut'].includes(transition.type)
    ? `<p:${transition.type}/>`
    : ['push', 'wipe', 'cover', 'uncover', 'pull'].includes(transition.type)
      ? `<p:${transition.type}${direction ? ` dir="${direction}"` : ''}/>`
      : '<p:fade/>'
  return `<p:transition${attributes}>${effect}</p:transition>`
}

const effectPreset = (effect: CanonicalAnimationEffect) => {
  if (effect.kind === 'appear') return 1
  if (effect.kind === 'fly') return 2
  if (effect.kind === 'fade') return 10
  if (effect.kind === 'wipe') return 22
  if (effect.kind === 'zoom') return 23
  if (effect.kind === 'bounce') return 26
  return undefined
}

const presetClass = (animation: TimelineAnimation) => {
  if (animation.effect.class === 'exit') return 'exit'
  if (animation.effect.class === 'emphasis') return 'emph'
  if (animation.effect.class === 'motionPath') return 'path'
  return 'entr'
}

const nodeType = (animation: TimelineAnimation) => {
  if (animation.timing.trigger === 'withPrevious') return 'withEffect'
  if (animation.timing.trigger === 'afterPrevious' || animation.timing.trigger === 'auto') return 'afterEffect'
  return 'clickEffect'
}

const targetXml = (animation: TimelineAnimation, shapeId: string) => {
  const paragraph = animation.target.paragraphRange
    ? `<p:pRg st="${animation.target.paragraphRange.start}" end="${animation.target.paragraphRange.end}"/>`
    : animation.target.paragraphIndex === undefined
      ? ''
      : `<p:pRg st="${animation.target.paragraphIndex}" end="${animation.target.paragraphIndex}"/>`
  const characters = animation.target.characterRange
    ? `<p:charRg st="${animation.target.characterRange.start}" end="${animation.target.characterRange.end}"/>`
    : ''
  const ranges = paragraph + characters
  return `<p:tgtEl><p:spTgt spid="${escapeXml(shapeId)}">${ranges}</p:spTgt></p:tgtEl>`
}

const visibilityXml = (
  animation: TimelineAnimation,
  effect: Extract<CanonicalAnimationEffect, { kind: 'appear' }>,
  shapeId: string,
  behaviorId: number,
) => {
  const value = effect.phase === 'exit' ? 'hidden' : 'visible'
  return `<p:set><p:cBhvr><p:cTn id="${behaviorId}" dur="1" fill="hold"/>${targetXml(animation, shapeId)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${value}"/></p:to></p:set>`
}

const animationBehaviorXml = (
  animation: TimelineAnimation,
  shapeId: string,
  behaviorId: number,
) => {
  const effect = animation.effect.canonical
  if (!effect) return ''
  const duration = Math.max(1, Math.round(animation.timing.duration || 1))
  const transition = 'phase' in effect && effect.phase === 'exit' ? 'out' : 'in'
  if (effect.kind === 'appear') return visibilityXml(animation, effect, shapeId, behaviorId)
  if (effect.kind === 'motionPath') {
    return `<p:animMotion path="${escapeXml(effect.path)}"><p:cBhvr><p:cTn id="${behaviorId}" dur="${duration}"/>${targetXml(animation, shapeId)}</p:cBhvr></p:animMotion>`
  }
  if (effect.kind === 'spin') {
    return `<p:animRot by="${Math.round((effect.degrees || 360) * 60000)}"><p:cBhvr><p:cTn id="${behaviorId}" dur="${duration}"/>${targetXml(animation, shapeId)}</p:cBhvr></p:animRot>`
  }
  if (effect.kind === 'scale') {
    return `<p:animScale><p:cBhvr><p:cTn id="${behaviorId}" dur="${duration}"/>${targetXml(animation, shapeId)}</p:cBhvr><p:by x="${Math.round(effect.x * 100000)}" y="${Math.round(effect.y * 100000)}"/></p:animScale>`
  }
  let filter = effect.kind
  if (effect.kind === 'wipe' || effect.kind === 'fly') filter += `(${effect.direction})`
  if (effect.kind === 'float' || effect.kind === 'bounce') filter = `fade`
  if (effect.kind === 'pulse') filter = 'fade'
  if (effect.kind === 'transparency' || effect.kind === 'blink' || effect.kind === 'teeter') return ''
  return `<p:animEffect transition="${transition}" filter="${escapeXml(filter)}"><p:cBhvr><p:cTn id="${behaviorId}" dur="${duration}"/>${targetXml(animation, shapeId)}</p:cBhvr></p:animEffect>`
}

export const writePptxTiming = (
  timeline: AnimationTimeline | undefined,
  elementIdToShapeId: ReadonlyMap<string, string> | Record<string, string>,
) => {
  if (!timeline?.animations.length) return ''
  const shapeIdFor = (elementId: string) => elementIdToShapeId instanceof Map
    ? elementIdToShapeId.get(elementId)
    : (elementIdToShapeId as Record<string, string>)[elementId]
  let timeNodeId = 1
  const nodes: string[] = []
  for (const animation of timeline.animations) {
    const elementId = animation.target.elementId
    const shapeId = elementId ? shapeIdFor(elementId) : undefined
    if (!shapeId || !animation.effect.canonical) continue
    const effect = animation.effect.canonical
    const behaviorId = ++timeNodeId
    const behavior = animationBehaviorXml(animation, shapeId, behaviorId)
    if (!behavior) continue
    const preset = animation.effect.presetId || effectPreset(effect)
    const duration = Math.max(1, Math.round(animation.timing.duration || 1))
    const delay = Math.max(0, Math.round(animation.timing.delay || 0))
    const repeat = animation.timing.repeatCount === undefined
      ? ''
      : animation.timing.repeatCount < 0 ? ' repeatCount="indefinite"' : ` repeatCount="${Math.round(animation.timing.repeatCount * 1000)}"`
    const autoReverse = animation.timing.autoReverse ? ' autoRev="1"' : ''
    const acceleration = animation.timing.acceleration ? ` accel="${Math.round(animation.timing.acceleration * 100000)}"` : ''
    const deceleration = animation.timing.deceleration ? ` decel="${Math.round(animation.timing.deceleration * 100000)}"` : ''
    const currentId = ++timeNodeId
    nodes.push(`<p:par><p:cTn id="${currentId}"${preset ? ` presetID="${preset}"` : ''} presetClass="${presetClass(animation)}" nodeType="${nodeType(animation)}" dur="${duration}" fill="hold"${repeat}${autoReverse}${acceleration}${deceleration}><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst>${behavior}</p:childTnLst></p:cTn></p:par>`)
  }
  return nodes.length ? `<p:timing><p:tnLst>${nodes.join('')}</p:tnLst></p:timing>` : ''
}

const animationStatus = (animation: TimelineAnimation): PptxExportCompatibility => {
  if (!animation.target.elementId || !animation.effect.canonical) return 'unsupported'
  if (animation.target.groupId || animation.target.paragraphRange || animation.target.characterRange) return 'approximate'
  const kind = animation.effect.canonical.kind
  if (['appear', 'fade', 'wipe', 'fly', 'zoom', 'motionPath', 'spin', 'scale'].includes(kind)) return 'exact'
  if (['float', 'bounce', 'pulse'].includes(kind)) return 'approximate'
  return 'unsupported'
}

const worstStatus = (statuses: PptxExportCompatibility[]) => {
  const rank: Record<PptxExportCompatibility, number> = {
    exact: 0,
    approximate: 1,
    flattened: 2,
    unsupported: 3,
  }
  return statuses.reduce((worst, status) => rank[status] > rank[worst] ? status : worst, 'exact')
}

export const analyzePptxExportCompatibility = (
  slides: readonly PptxExportSlideLike[],
): PptxExportCompatibilityReport => {
  const issues: PptxExportIssue[] = []
  const statuses: PptxExportCompatibility[] = []
  for (const slide of slides) {
    const transition = slide.transition || editorTurningModeTransition(slide.turningMode)
    if (transition) {
      const known = ['none', 'no', 'cut', 'fade', 'dissolve', 'push', 'wipe', 'cover', 'uncover', 'pull', 'morph'].includes(transition.type)
      const status: PptxExportCompatibility = known
        ? transition.source === 'editor' && transition.type !== 'morph' ? 'approximate' : 'exact'
        : 'approximate'
      statuses.push(status)
      if (status !== 'exact') issues.push({
        status,
        feature: 'transition',
        slideId: slide.id,
        message: `页面切换 ${transition.type} 将导出为最接近的 PowerPoint 效果。`,
      })
    }
    for (const animation of slide.animationTimeline?.animations || []) {
      const status = animationStatus(animation)
      statuses.push(status)
      if (status !== 'exact') issues.push({
        status,
        feature: 'animation',
        slideId: slide.id,
        elementId: animation.target.elementId,
        animationId: animation.id,
        message: status === 'unsupported'
          ? `动画 ${animation.id} 无法写入普通 PPTX，将保留元素最终状态。`
          : `动画 ${animation.id} 将导出为近似的 PowerPoint 效果。`,
      })
    }
    for (const element of slide.elements || []) {
      if (element.type !== 'widget') continue
      statuses.push('flattened')
      issues.push({
        status: 'flattened',
        feature: 'widget',
        slideId: slide.id,
        elementId: element.id,
        message: `网页组件 ${element.id} 将以封面或占位图导出，交互逻辑仅在网页播放器中可用。`,
      })
    }
  }
  const counts = statuses.reduce<Record<PptxExportCompatibility, number>>((result, status) => {
    result[status] += 1
    return result
  }, { exact: 0, approximate: 0, flattened: 0, unsupported: 0 })
  return { status: worstStatus(statuses), counts, issues }
}
