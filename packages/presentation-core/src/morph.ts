import type {
  MorphableElement,
  MorphElementMatch,
  MorphMatchResult,
  MorphObjectLink,
} from './types'

export interface PresentationMorphCandidate<T = unknown> extends MorphableElement {
  element: T
  order: number
  appearanceFingerprint?: string
}

/**
 * Resolve the editor lineage key when cloning an element.
 * Cross-slide copies inherit identity, while same-slide duplicates become a
 * new object. Imported objects can keep using PowerPoint's creationId without
 * manufacturing an additional editor key.
 */
export const presentationMorphKeyForCopy = (
  element: Pick<MorphableElement, 'id' | 'morphKey' | 'source'>,
  newElementId: string,
  preserveIdentity: boolean,
) => {
  if (!preserveIdentity) return newElementId
  if (element.morphKey) return element.morphKey
  if (element.source?.creationId) return undefined
  return element.id
}

const textFingerprint = (html: string) => html
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase()

const appearanceFields: Record<string, string[]> = {
  text: [
    'content', 'defaultFontName', 'defaultColor', 'outline', 'fill', 'lineHeight',
    'wordSpace', 'opacity', 'shadow', 'paragraphSpace', 'vertical', 'textType',
    'inset', 'fixedHeight', 'vAlign',
  ],
  image: [
    'src', 'outline', 'filters', 'clip', 'flipH', 'flipV', 'shadow', 'radius',
    'colorMask', 'imageType',
  ],
  shape: [
    'viewBox', 'path', 'fixedRatio', 'fill', 'gradient', 'pattern', 'outline',
    'opacity', 'flipH', 'flipV', 'shadow', 'special', 'text', 'pathFormula',
    'keypoints',
  ],
  line: [
    'start', 'end', 'width', 'style', 'color', 'points', 'shadow', 'broken',
    'broken2', 'broken2Direction', 'curve', 'cubic',
  ],
  latex: ['latex', 'path', 'color', 'strokeWidth', 'viewBox'],
}

const contentFingerprint = (element: Record<string, unknown>) => {
  if (element.type === 'text') return textFingerprint(String(element.content || ''))
  if (element.type === 'shape') {
    const text = element.text as { content?: string } | undefined
    return textFingerprint(text?.content || '')
  }
  if (element.type === 'image') {
    const src = String(element.src || '')
    return `${src.length}:${src.slice(0, 96)}:${src.slice(-96)}`
  }
  return undefined
}

const appearanceFingerprint = (element: Record<string, unknown>) => {
  const fields = appearanceFields[String(element.type)]
  if (!fields) return undefined
  return JSON.stringify([element.type, ...fields.map(field => {
    if (field === 'src') return contentFingerprint(element)
    return element[field]
  })])
}

/**
 * Convert PPTist-compatible elements into the renderer-neutral candidates used
 * by both the Vue fallback and the standalone DOM player.
 */
export const createPresentationMorphCandidates = <T>(elements: readonly T[]): PresentationMorphCandidate<T>[] => {
  return elements.flatMap((rawElement, order): PresentationMorphCandidate<T>[] => {
    const element = rawElement as Record<string, unknown>
    const id = String(element.id || '')
    const type = String(element.type || '')
    const left = Number(element.left)
    const top = Number(element.top)
    const width = Number(element.width)
    if (!id || !type || !Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width)) return []

    const source = element.source as MorphableElement['source']
    const name = String(element.name || '') || undefined
    const morphKey = String(element.morphKey || '') || undefined
    if (type === 'line') {
      const start = element.start as [number, number] | undefined
      const end = element.end as [number, number] | undefined
      if (!start || !end) return []
      return [{
        id,
        type,
        left,
        top,
        width: Math.max(24, Math.abs(start[0] - end[0])),
        height: Math.max(24, Math.abs(start[1] - end[1])),
        rotate: 0,
        name,
        morphKey,
        source,
        appearanceFingerprint: appearanceFingerprint(element),
        element: rawElement,
        order,
      }]
    }

    const height = Number(element.height)
    const rotate = Number(element.rotate)
    if (!Number.isFinite(height) || !Number.isFinite(rotate) || !width || !height) return []
    return [{
      id,
      type,
      left,
      top,
      width,
      height,
      rotate,
      name,
      morphKey,
      source,
      contentFingerprint: contentFingerprint(element),
      appearanceFingerprint: appearanceFingerprint(element),
      element: rawElement,
      order,
    }]
  })
}

export const presentationMorphNeedsCrossfade = (
  from: PresentationMorphCandidate,
  to: PresentationMorphCandidate,
) => {
  if (!from.appearanceFingerprint || from.appearanceFingerprint !== to.appearanceFingerprint) return true
  const fromElement = from.element as { type?: string; text?: { content?: string } }
  const containsText = fromElement.type === 'text' || (fromElement.type === 'shape' && !!fromElement.text?.content)
  return containsText && (from.width !== to.width || from.height !== to.height)
}

const geometryDiffers = (from: number, to: number) => Math.abs(from - to) > 0.001
const rotationDiffers = (from: number, to: number) => {
  const delta = ((from - to + 180) % 360 + 360) % 360 - 180
  return Math.abs(delta) > 0.001
}

/**
 * Whether a matched object needs any visual animation at all. Keeping a truly
 * unchanged object off the Web Animations compositor avoids the sub-pixel
 * re-rasterization flash that otherwise appears at the start and end of Morph.
 */
export const presentationMorphNeedsAnimation = (
  from: PresentationMorphCandidate,
  to: PresentationMorphCandidate,
) => presentationMorphNeedsCrossfade(from, to) ||
  geometryDiffers(from.left, to.left) ||
  geometryDiffers(from.top, to.top) ||
  geometryDiffers(from.width, to.width) ||
  geometryDiffers(from.height, to.height) ||
  rotationDiffers(from.rotate, to.rotate)

const normalizeName = (name?: string) => name?.trim().toLocaleLowerCase() || ''
const forcedMorphName = (element: MorphableElement) => {
  const candidates = [element.morphKey, element.name, element.source?.name]
  return candidates.map(normalizeName).find(name => name.startsWith('!!')) || ''
}

interface MorphScore {
  score: number
  reason: NonNullable<MorphElementMatch['reason']>
  identity: boolean
}

const elementScore = (from: MorphableElement, to: MorphableElement): MorphScore => {
  if (from.type !== to.type) {
    return {
      score: Number.NEGATIVE_INFINITY,
      reason: 'inferred',
      identity: false,
    }
  }
  // Microsoft documents that !! objects are matched only through the !!
  // naming scheme and never against ordinary objects. Unique pairs were
  // already consumed before the weighted fallback.
  if (forcedMorphName(from) || forcedMorphName(to)) {
    return {
      score: Number.NEGATIVE_INFINITY,
      reason: 'inferred',
      identity: false,
    }
  }

  let score = 0
  let reason: MorphScore['reason'] = 'inferred'
  let identity = false
  const fromName = normalizeName(from.name || from.source?.name)
  const toName = normalizeName(to.name || to.source?.name)
  const fromEditorIdentity = from.morphKey || from.source?.creationId || from.id
  const toEditorIdentity = to.morphKey || to.source?.creationId || to.id
  const hasEditorIdentityOverride = !!from.morphKey || !!to.morphKey

  // Once the editor has recorded a lineage key, a different key is explicit
  // evidence that these are different objects. Fuzzy evidence must not undo it.
  if (hasEditorIdentityOverride && fromEditorIdentity !== toEditorIdentity) {
    return {
      score: Number.NEGATIVE_INFINITY,
      reason: 'inferred',
      identity: false,
    }
  }

  // PowerPoint's private matcher is not published. Keep publicly observable
  // identity signals dominant, then use content/appearance/geometry only as
  // supporting evidence for ordinary objects.
  if (fromEditorIdentity === toEditorIdentity) {
    const matchedByMorphKey = !!from.morphKey || !!to.morphKey
    const matchedByCreationId = !matchedByMorphKey && !!from.source?.creationId && !!to.source?.creationId
    score += matchedByCreationId ? 200 : 220
    reason = matchedByMorphKey ? 'morphKey' : matchedByCreationId ? 'creationId' : 'elementId'
    identity = true
  }
  if (from.source?.shapeId && from.source.shapeId === to.source?.shapeId) {
    score += 35
    if (!identity) reason = 'shapeId'
  }
  // Ordinary Office names such as "TextBox 3" are evidence, but only !! names
  // are authoritative and were handled before scoring.
  if (fromName && fromName === toName) score += 20
  if (from.contentFingerprint && from.contentFingerprint === to.contentFingerprint) score += 45
  if (from.appearanceFingerprint && from.appearanceFingerprint === to.appearanceFingerprint) score += 35

  const fromCenterX = from.left + from.width / 2
  const fromCenterY = from.top + from.height / 2
  const toCenterX = to.left + to.width / 2
  const toCenterY = to.top + to.height / 2
  const distance = Math.hypot(fromCenterX - toCenterX, fromCenterY - toCenterY)
  const sizeDelta = Math.abs(from.width - to.width) + Math.abs(from.height - to.height)

  score += Math.max(0, 20 - distance / 25)
  score += Math.max(0, 10 - sizeDelta / 25)
  return { score, reason, identity }
}

const AUTOMATIC_MATCH_THRESHOLD = 80

export interface MorphMatchOptions {
  links?: readonly MorphObjectLink[]
  excludedToElementIds?: readonly string[]
}

export const matchMorphElements = <T extends MorphableElement>(
  fromElements: T[],
  toElements: T[],
  options: MorphMatchOptions = {},
): MorphMatchResult<T> => {
  const matches: MorphElementMatch<T>[] = []
  const usedFrom = new Set<string>()
  const usedTo = new Set<string>()
  const excludedTo = new Set(options.excludedToElementIds || [])

  // Editor-authored links are authoritative and may intentionally connect
  // different element families. The renderer will cross-fade their visuals
  // while retaining the requested geometry relationship.
  for (const link of options.links || []) {
    const from = fromElements.find(candidate => candidate.id === link.fromElementId)
    const to = toElements.find(candidate => candidate.id === link.toElementId)
    if (!from || !to || excludedTo.has(to.id) || usedFrom.has(from.id) || usedTo.has(to.id)) continue
    matches.push({ from, to, confidence: 'explicit', reason: 'manual' })
    usedFrom.add(from.id)
    usedTo.add(to.id)
  }

  // PowerPoint supports matching objects whose names begin with !!. These matches
  // are explicit and must take precedence over all inferred matches.
  const forcedFromCounts = new Map<string, number>()
  const forcedToCounts = new Map<string, number>()
  for (const from of fromElements) {
    if (usedFrom.has(from.id)) continue
    const key = `${from.type}:${forcedMorphName(from)}`
    if (key.endsWith(':')) continue
    forcedFromCounts.set(key, (forcedFromCounts.get(key) || 0) + 1)
  }
  for (const to of toElements) {
    if (usedTo.has(to.id) || excludedTo.has(to.id)) continue
    const key = `${to.type}:${forcedMorphName(to)}`
    if (key.endsWith(':')) continue
    forcedToCounts.set(key, (forcedToCounts.get(key) || 0) + 1)
  }
  for (const from of fromElements) {
    if (usedFrom.has(from.id)) continue
    const name = forcedMorphName(from)
    const key = `${from.type}:${name}`
    if (!name || forcedFromCounts.get(key) !== 1 || forcedToCounts.get(key) !== 1) continue
    const to = toElements.find(candidate => (
      !usedTo.has(candidate.id) &&
      !excludedTo.has(candidate.id) &&
      candidate.type === from.type &&
      forcedMorphName(candidate) === name
    ))
    if (!to) continue
    matches.push({ from, to, confidence: 'forced', reason: 'forcedName' })
    usedFrom.add(from.id)
    usedTo.add(to.id)
  }

  for (const to of toElements) {
    if (usedTo.has(to.id) || excludedTo.has(to.id)) continue

    let best: T | undefined
    let bestScore: MorphScore = {
      score: Number.NEGATIVE_INFINITY,
      reason: 'inferred',
      identity: false,
    }
    let tied = false
    for (const from of fromElements) {
      if (usedFrom.has(from.id)) continue
      const scored = elementScore(from, to)
      if (scored.score > bestScore.score) {
        best = from
        bestScore = scored
        tied = false
      }
      else if (scored.score === bestScore.score) {
        tied = true
      }
    }

    // Stable identity is always sufficient. Heuristic matches need multiple
    // supporting signals and must not be tied, so equal-looking repeated
    // objects are left for explicit user association instead of guessed.
    if (!best || tied || (!bestScore.identity && bestScore.score < AUTOMATIC_MATCH_THRESHOLD)) continue
    matches.push({
      from: best,
      to,
      confidence: bestScore.identity || bestScore.score >= 120 ? 'strong' : 'inferred',
      reason: bestScore.reason,
      score: bestScore.score,
    })
    usedFrom.add(best.id)
    usedTo.add(to.id)
  }

  return {
    matches,
    leaving: fromElements.filter(element => !usedFrom.has(element.id)),
    entering: toElements.filter(element => !usedTo.has(element.id)),
  }
}
