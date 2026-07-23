import type { MorphableElement, MorphElementMatch, MorphMatchResult } from './types'

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
