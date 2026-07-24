import type { MorphableElement, MorphElementMatch, MorphMatchResult } from './types'

export interface PresentationMorphCandidate<T = unknown> extends MorphableElement {
  element: T
  order: number
  appearanceFingerprint?: string
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
    const name = String(element.morphKey || element.name || '') || undefined
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

const normalizeName = (name?: string) => name?.trim().toLocaleLowerCase() || ''
const forcedMorphName = (element: MorphableElement) => {
  const name = normalizeName(element.source?.name || element.name)
  return name.startsWith('!!') ? name : ''
}

const elementScore = (from: MorphableElement, to: MorphableElement) => {
  if (from.type !== to.type) return Number.NEGATIVE_INFINITY

  let score = 20
  const fromName = normalizeName(from.source?.name || from.name)
  const toName = normalizeName(to.source?.name || to.name)

  if (from.source?.creationId && from.source.creationId === to.source?.creationId) score += 120
  if (fromName && fromName === toName) score += 80
  if (from.contentFingerprint && from.contentFingerprint === to.contentFingerprint) score += 60

  const fromCenterX = from.left + from.width / 2
  const fromCenterY = from.top + from.height / 2
  const toCenterX = to.left + to.width / 2
  const toCenterY = to.top + to.height / 2
  const distance = Math.hypot(fromCenterX - toCenterX, fromCenterY - toCenterY)
  const sizeDelta = Math.abs(from.width - to.width) + Math.abs(from.height - to.height)

  score -= Math.min(distance / 50, 20)
  score -= Math.min(sizeDelta / 100, 10)
  return score
}

export const matchMorphElements = <T extends MorphableElement>(fromElements: T[], toElements: T[]): MorphMatchResult<T> => {
  const matches: MorphElementMatch<T>[] = []
  const usedFrom = new Set<string>()
  const usedTo = new Set<string>()

  // PowerPoint supports matching objects whose names begin with !!. These matches
  // are explicit and must take precedence over all inferred matches.
  for (const from of fromElements) {
    const key = forcedMorphName(from)
    if (!key) continue
    const to = toElements.find(candidate => !usedTo.has(candidate.id) && forcedMorphName(candidate) === key)
    if (!to) continue
    matches.push({ from, to, confidence: 'forced' })
    usedFrom.add(from.id)
    usedTo.add(to.id)
  }

  for (const to of toElements) {
    if (usedTo.has(to.id)) continue

    let best: T | undefined
    let bestScore = Number.NEGATIVE_INFINITY
    for (const from of fromElements) {
      if (usedFrom.has(from.id)) continue
      const score = elementScore(from, to)
      if (score > bestScore) {
        best = from
        bestScore = score
      }
    }

    if (!best || bestScore < 15) continue
    matches.push({
      from: best,
      to,
      confidence: bestScore >= 80 ? 'strong' : 'inferred',
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
