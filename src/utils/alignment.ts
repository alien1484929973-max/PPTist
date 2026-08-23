import type { AlignmentLineProps } from '@/types/edit'
import type { AlignLine } from '@/utils/element'

const MIN_CANVAS_SCALE = 0.01
const ALIGNMENT_THRESHOLD_PX = 4
const ALIGNMENT_GUIDE_PADDING_PX = 12
const DISTANCE_EPSILON = 0.000001

export interface AlignmentAnchor {
  value: number
  range: [number, number]
  priority?: number
}

export interface AlignmentMatch {
  line: AlignLine
  anchor: AlignmentAnchor
  offset: number
  distance: number
}

export const getAlignmentThreshold = (canvasScale: number) => {
  return ALIGNMENT_THRESHOLD_PX / Math.max(canvasScale, MIN_CANVAS_SCALE)
}

export const getAlignmentGuidePadding = (canvasScale: number) => {
  return ALIGNMENT_GUIDE_PADDING_PX / Math.max(canvasScale, MIN_CANVAS_SCALE)
}

export const findClosestAlignment = (
  lines: AlignLine[],
  anchors: AlignmentAnchor[],
  threshold: number,
): AlignmentMatch | null => {
  let closestMatch: (AlignmentMatch & { priority: number }) | null = null

  for (const line of lines) {
    for (const anchor of anchors) {
      const offset = anchor.value - line.value
      const distance = Math.abs(offset)
      if (distance > threshold) continue

      const priority = anchor.priority ?? 1
      const isCloser = !closestMatch || distance < closestMatch.distance - DISTANCE_EPSILON
      const isPreferredTie = closestMatch &&
        Math.abs(distance - closestMatch.distance) <= DISTANCE_EPSILON &&
        priority < closestMatch.priority

      if (isCloser || isPreferredTie) {
        closestMatch = { line, anchor, offset, distance, priority }
      }
    }
  }

  if (!closestMatch) return null
  return {
    line: closestMatch.line,
    anchor: closestMatch.anchor,
    offset: closestMatch.offset,
    distance: closestMatch.distance,
  }
}

export const createAlignmentGuide = (
  type: AlignmentLineProps['type'],
  match: AlignmentMatch,
  padding: number,
): AlignmentLineProps => {
  const min = Math.min(...match.line.range, ...match.anchor.range) - padding
  const max = Math.max(...match.line.range, ...match.anchor.range) + padding

  if (type === 'horizontal') {
    return {
      type,
      axis: { x: min, y: match.line.value },
      length: max - min,
    }
  }

  return {
    type,
    axis: { x: match.line.value, y: min },
    length: max - min,
  }
}
