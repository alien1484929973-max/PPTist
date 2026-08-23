import type {
  AnimationTimeline,
  CanonicalAnimationEffect,
  LegacyAnimationLike,
  SlideTransition,
  TimelineAnimation,
} from './types'
import { canonicalEffectFromTimeline, createAnimationTimelineFromLegacy } from './effects'

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
  animations?: readonly LegacyAnimationLike[]
  elements?: Array<{ id: string; type: string; groupId?: string; poster?: string }>
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
  if (turningMode === 'no') return { type: 'none', duration: 0, source: 'editor' }
  if (turningMode === 'fade') return { type: 'fade', duration: 700, source: 'editor' }
  if (turningMode === 'slideX' || turningMode === 'slideX3D') {
    return { type: 'push', direction: 'l', duration: 700, source: 'editor' }
  }
  if (!turningMode || turningMode === 'slideY' || turningMode === 'slideY3D') {
    return { type: 'push', direction: 'u', duration: 700, source: 'editor' }
  }
  return { type: 'fade', duration: 700, source: 'editor' }
}

export const writePptxTransition = (transition?: SlideTransition) => {
  if (!transition) return ''
  const duration = Math.max(0, Math.round(transition.duration || 0))
  const speed = duration <= 500 ? 'fast' : duration >= 1000 ? 'slow' : 'med'
  const advance = transition.autoAdvanceAfter === undefined
    ? ''
    : ` advTm="${Math.max(0, Math.round(transition.autoAdvanceAfter))}"`
  const attributes = ` spd="${speed}" p14:dur="${duration}"${advance}`
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

const directionPresetSubtype = (effect: CanonicalAnimationEffect) => {
  if (!('direction' in effect) || !effect.direction) return undefined
  if (effect.direction === 'up') return 1
  if (effect.direction === 'right') return 2
  if (effect.direction === 'topRight') return 3
  if (effect.direction === 'down') return 4
  if (effect.direction === 'bottomRight') return 6
  if (effect.direction === 'left') return 8
  if (effect.direction === 'topLeft') return 9
  if (effect.direction === 'bottomLeft') return 12
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
  value: 'visible' | 'hidden',
  shapeId: string,
  behaviorId: number,
) => {
  return `<p:set><p:cBhvr><p:cTn id="${behaviorId}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${targetXml(animation, shapeId)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${value}"/></p:to></p:set>`
}

const numericAnimationXml = (
  animation: TimelineAnimation,
  shapeId: string,
  behaviorId: number,
  attribute: string,
  from: string,
  to: string,
) => {
  const duration = Math.max(1, Math.round(animation.timing.duration || 1))
  return `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${behaviorId}" dur="${duration}" fill="hold"/>${targetXml(animation, shapeId)}<p:attrNameLst><p:attrName>${attribute}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${escapeXml(from)}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${escapeXml(to)}"/></p:val></p:tav></p:tavLst></p:anim>`
}

const flyPosition = (direction: Extract<CanonicalAnimationEffect, { kind: 'fly' }>['direction']) => ({
  x: direction.includes('Left') || direction === 'left'
    ? '0-#ppt_w/2'
    : direction.includes('Right') || direction === 'right' ? '1+#ppt_w/2' : '#ppt_x',
  y: direction.startsWith('top') || direction === 'up'
    ? '0-#ppt_h/2'
    : direction.startsWith('bottom') || direction === 'down' ? '1+#ppt_h/2' : '#ppt_y',
})

const animationBehaviorXml = (
  animation: TimelineAnimation,
  shapeId: string,
  nextId: () => number,
) => {
  const effect = canonicalEffectFromTimeline(animation)
  const duration = Math.max(1, Math.round(animation.timing.duration || 1))
  const transition = animation.effect.transition || (animation.effect.class === 'exit' ? 'out' : 'in')
  const behaviors: string[] = []

  if (!effect) {
    if (animation.effect.motionPath) {
      if (animation.effect.class === 'entrance') behaviors.push(visibilityXml(animation, 'visible', shapeId, nextId()))
      behaviors.push(`<p:animMotion origin="layout" pathEditMode="relative" path="${escapeXml(animation.effect.motionPath)}"><p:cBhvr><p:cTn id="${nextId()}" dur="${duration}" fill="hold"/>${targetXml(animation, shapeId)}</p:cBhvr></p:animMotion>`)
    }
    else if (animation.effect.rotateBy !== undefined) {
      if (animation.effect.class === 'entrance') behaviors.push(visibilityXml(animation, 'visible', shapeId, nextId()))
      behaviors.push(`<p:animRot by="${Math.round(animation.effect.rotateBy * 60000)}"><p:cBhvr><p:cTn id="${nextId()}" dur="${duration}" fill="hold"/>${targetXml(animation, shapeId)}</p:cBhvr></p:animRot>`)
    }
    else if (animation.effect.scaleBy) {
      if (animation.effect.class === 'entrance') behaviors.push(visibilityXml(animation, 'visible', shapeId, nextId()))
      behaviors.push(`<p:animScale><p:cBhvr><p:cTn id="${nextId()}" dur="${duration}" fill="hold"/>${targetXml(animation, shapeId)}</p:cBhvr><p:by x="${Math.round(animation.effect.scaleBy.x * 100000)}" y="${Math.round(animation.effect.scaleBy.y * 100000)}"/></p:animScale>`)
    }
    else if (animation.effect.filter) {
      if (animation.effect.class === 'entrance') behaviors.push(visibilityXml(animation, 'visible', shapeId, nextId()))
      behaviors.push(`<p:animEffect transition="${transition}" filter="${escapeXml(animation.effect.filter)}"><p:cBhvr><p:cTn id="${nextId()}" dur="${duration}" fill="hold"/>${targetXml(animation, shapeId)}</p:cBhvr></p:animEffect>`)
    }
    return behaviors.join('')
  }

  if (effect.kind === 'appear') {
    return visibilityXml(animation, effect.phase === 'exit' ? 'hidden' : 'visible', shapeId, nextId())
  }
  if (animation.effect.class === 'entrance') {
    behaviors.push(visibilityXml(animation, 'visible', shapeId, nextId()))
  }
  if (effect.kind === 'motionPath') {
    behaviors.push(`<p:animMotion origin="layout" pathEditMode="relative" path="${escapeXml(effect.path)}"><p:cBhvr><p:cTn id="${nextId()}" dur="${duration}" fill="hold"/>${targetXml(animation, shapeId)}</p:cBhvr></p:animMotion>`)
    return behaviors.join('')
  }
  if (effect.kind === 'spin' || effect.kind === 'teeter') {
    const degrees = effect.kind === 'spin' ? effect.degrees || 360 : effect.degrees || 4
    behaviors.push(`<p:animRot by="${Math.round(degrees * 60000)}"><p:cBhvr><p:cTn id="${nextId()}" dur="${duration}" fill="hold"/>${targetXml(animation, shapeId)}</p:cBhvr></p:animRot>`)
    return behaviors.join('')
  }
  if (effect.kind === 'scale' || effect.kind === 'pulse') {
    const x = effect.kind === 'scale' ? effect.x : effect.scale || 1.12
    const y = effect.kind === 'scale' ? effect.y : effect.scale || 1.12
    behaviors.push(`<p:animScale><p:cBhvr><p:cTn id="${nextId()}" dur="${duration}" fill="hold"/>${targetXml(animation, shapeId)}</p:cBhvr><p:by x="${Math.round(x * 100000)}" y="${Math.round(y * 100000)}"/></p:animScale>`)
    return behaviors.join('')
  }
  if (effect.kind === 'fly') {
    const outside = flyPosition(effect.direction)
    const exiting = effect.phase === 'exit'
    behaviors.push(numericAnimationXml(animation, shapeId, nextId(), 'ppt_x', exiting ? '#ppt_x' : outside.x, exiting ? outside.x : '#ppt_x'))
    behaviors.push(numericAnimationXml(animation, shapeId, nextId(), 'ppt_y', exiting ? '#ppt_y' : outside.y, exiting ? outside.y : '#ppt_y'))
    return behaviors.join('')
  }
  let filter = effect.kind
  if (effect.kind === 'wipe') filter += `(${effect.direction})`
  if (effect.kind === 'float' || effect.kind === 'bounce') filter = `fade`
  if (effect.kind === 'transparency' || effect.kind === 'blink') filter = 'fade'
  behaviors.push(`<p:animEffect transition="${transition}" filter="${escapeXml(filter)}"><p:cBhvr><p:cTn id="${nextId()}" dur="${duration}" fill="hold"/>${targetXml(animation, shapeId)}</p:cBhvr></p:animEffect>`)
  return behaviors.join('')
}

const basePptxExportTimeline = (
  slide: Pick<PptxExportSlideLike, 'animationTimeline' | 'animations' | 'elements'>,
): AnimationTimeline | undefined => slide.animationTimeline?.animations.length
  ? slide.animationTimeline
  : slide.animations?.length ? createAnimationTimelineFromLegacy(slide.animations) : undefined

export const resolvePptxExportTimeline = (
  slide: Pick<PptxExportSlideLike, 'animationTimeline' | 'animations' | 'elements'>,
): AnimationTimeline | undefined => {
  const source = basePptxExportTimeline(slide)
  if (!source?.animations.length) return undefined

  const elements = slide.elements || []
  const animations = source.animations.flatMap(animation => {
    const groupId = animation.target.groupId
    if (!groupId) return [animation]
    return elements
      .filter(element => element.groupId === groupId)
      .map(element => ({
        ...animation,
        id: `${animation.id}:${element.id}`,
        target: {
          ...animation.target,
          groupId: undefined,
          elementId: element.id,
        },
      }))
  })
  return animations.length ? { version: 1, animations } : undefined
}

export const writePptxTiming = (
  timeline: AnimationTimeline | undefined,
  elementIdToShapeId: ReadonlyMap<string, string> | Record<string, string>,
) => {
  if (!timeline?.animations.length) return ''
  const shapeIdFor = (elementId: string) => elementIdToShapeId instanceof Map
    ? elementIdToShapeId.get(elementId)
    : (elementIdToShapeId as Record<string, string>)[elementId]
  let timeNodeId = 2
  const nextId = () => ++timeNodeId
  const writable: Array<{ animation: TimelineAnimation; shapeId: string }> = []
  for (const animation of timeline.animations) {
    const elementId = animation.target.elementId
    const shapeId = elementId ? shapeIdFor(elementId) : undefined
    if (shapeId) writable.push({ animation, shapeId })
  }

  const groups: Array<{ automatic: boolean; items: typeof writable }> = []
  for (const item of writable) {
    const trigger = item.animation.timing.trigger
    if (!groups.length || trigger === 'click') groups.push({ automatic: trigger !== 'click', items: [item] })
    else groups[groups.length - 1].items.push(item)
  }

  const groupNodes: string[] = []
  for (const group of groups) {
    const outerId = nextId()
    const innerId = nextId()
    const effectNodes: string[] = []
    for (const { animation, shapeId } of group.items) {
      const currentId = nextId()
      const behavior = animationBehaviorXml(animation, shapeId, nextId)
      if (!behavior) continue
      const effect = canonicalEffectFromTimeline(animation)
      const preset = animation.effect.presetId || (effect ? effectPreset(effect) : undefined)
      const subtype = animation.effect.presetSubtype || (effect ? directionPresetSubtype(effect) : undefined)
      const duration = Math.max(1, Math.round(animation.timing.duration || 1))
      const delay = Math.max(0, Math.round(animation.timing.delay || 0))
      const repeat = animation.timing.repeatCount === undefined
        ? ''
        : animation.timing.repeatCount < 0 ? ' repeatCount="indefinite"' : ` repeatCount="${Math.round(animation.timing.repeatCount * 1000)}"`
      const autoReverse = animation.timing.autoReverse ? ' autoRev="1"' : ''
      const easing = animation.timing.easing?.toLowerCase()
      const accelerationValue = animation.timing.acceleration ?? (easing === 'ease-in' || easing === 'ease-in-out' ? 0.5 : 0)
      const decelerationValue = animation.timing.deceleration ?? (easing === 'ease-out' || easing === 'ease-in-out' ? 0.5 : 0)
      const acceleration = accelerationValue ? ` accel="${Math.round(accelerationValue * 100000)}"` : ''
      const deceleration = decelerationValue ? ` decel="${Math.round(decelerationValue * 100000)}"` : ''
      effectNodes.push(`<p:par><p:cTn id="${currentId}"${preset ? ` presetID="${preset}"` : ''}${subtype ? ` presetSubtype="${subtype}"` : ''} presetClass="${presetClass(animation)}" grpId="0" nodeType="${nodeType(animation)}" dur="${duration}" fill="hold"${repeat}${autoReverse}${acceleration}${deceleration}><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst>${behavior}</p:childTnLst></p:cTn></p:par>`)
    }
    if (!effectNodes.length) continue
    const gateDelay = group.automatic ? '0' : 'indefinite'
    groupNodes.push(`<p:par><p:cTn id="${outerId}" fill="hold"><p:stCondLst><p:cond delay="${gateDelay}"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${innerId}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effectNodes.join('')}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`)
  }
  if (!groupNodes.length) return ''
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${groupNodes.join('')}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`
}

const animationStatus = (animation: TimelineAnimation): PptxExportCompatibility => {
  if (!animation.target.elementId && !animation.target.groupId) return 'unsupported'
  if (animation.target.groupId || animation.target.paragraphRange || animation.target.characterRange) return 'approximate'
  const effect = canonicalEffectFromTimeline(animation)
  if (!effect) {
    return animation.effect.motionPath || animation.effect.filter ||
      animation.effect.rotateBy !== undefined || animation.effect.scaleBy
      ? 'approximate'
      : 'unsupported'
  }
  const kind = effect.kind
  if (['appear', 'fade', 'wipe', 'fly', 'zoom', 'motionPath', 'spin', 'scale'].includes(kind)) return 'exact'
  if (['float', 'bounce', 'pulse', 'transparency', 'blink', 'teeter'].includes(kind)) return 'approximate'
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
      if (status !== 'exact') {
        issues.push({
          status,
          feature: 'transition',
          slideId: slide.id,
          message: `页面切换 ${transition.type} 将导出为最接近的 PowerPoint 效果。`,
        })
      }
    }
    for (const animation of basePptxExportTimeline(slide)?.animations || []) {
      const status = animationStatus(animation)
      statuses.push(status)
      if (status !== 'exact') {
        issues.push({
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
