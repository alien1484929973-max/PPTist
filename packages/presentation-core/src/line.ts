export type PresentationLinePoint = '' | 'arrow' | 'dot'

export interface PresentationLineGeometry {
  start: [number, number]
  end: [number, number]
  width: number
  points?: [PresentationLinePoint, PresentationLinePoint]
  broken?: [number, number]
  broken2?: [number, number]
  broken2Direction?: 'horizontal' | 'vertical'
  curve?: [number, number]
  cubic?: [[number, number], [number, number]]
}

export const getPresentationBrokenLineDirection = (element: PresentationLineGeometry) => {
  if (element.broken2Direction) return element.broken2Direction
  const points = [element.start, element.end, element.broken, element.broken2, element.curve, ...(element.cubic || [])]
    .filter((point): point is [number, number] => !!point)
  const x = points.map(point => point[0])
  const y = points.map(point => point[1])
  return Math.max(...x) - Math.min(...x) >= Math.max(...y) - Math.min(...y) ? 'horizontal' : 'vertical'
}

const pathWithEnds = (
  element: PresentationLineGeometry,
  start: [number, number],
  end: [number, number],
) => {
  const startPoint = start.join(',')
  const endPoint = end.join(',')
  if (element.broken) return `M${startPoint} L${element.broken.join(',')} L${endPoint}`
  if (element.broken2) {
    const direction = getPresentationBrokenLineDirection(element)
    if (direction === 'horizontal') {
      return `M${startPoint} L${element.broken2[0]},${element.start[1]} L${element.broken2[0]},${element.end[1]} ${endPoint}`
    }
    return `M${startPoint} L${element.start[0]},${element.broken2[1]} L${element.end[0]},${element.broken2[1]} ${endPoint}`
  }
  if (element.curve) return `M${startPoint} Q${element.curve.join(',')} ${endPoint}`
  if (element.cubic) return `M${startPoint} C${element.cubic[0].join(',')} ${element.cubic[1].join(',')} ${endPoint}`
  return `M${startPoint} L${endPoint}`
}

export const getPresentationLinePath = (element: PresentationLineGeometry) => {
  return pathWithEnds(element, element.start, element.end)
}

const retractionOffset = (point: PresentationLinePoint, width: number) => {
  const size = width < 2 ? 2 : width
  if (point === 'arrow') return size
  if (point === 'dot') return size / 2
  return 0
}

const distance = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1])

const offsetPoint = (point: [number, number], target: [number, number], offset: number): [number, number] => {
  const length = distance(point, target)
  if (!length) return point
  const ratio = offset / length
  return [
    point[0] + (target[0] - point[0]) * ratio,
    point[1] + (target[1] - point[1]) * ratio,
  ]
}

const turningPoints = (element: PresentationLineGeometry) => {
  if (element.broken) return [element.broken]
  if (element.broken2) {
    return getPresentationBrokenLineDirection(element) === 'horizontal'
      ? [[element.broken2[0], element.start[1]], [element.broken2[0], element.end[1]]] as [number, number][]
      : [[element.start[0], element.broken2[1]], [element.end[0], element.broken2[1]]] as [number, number][]
  }
  if (element.curve) return [element.curve]
  if (element.cubic) return [element.cubic[0], element.cubic[1]]
  return []
}

/** Visible line body, shortened so arrow/dot markers do not overlap it. */
export const getPresentationLineRenderPath = (element: PresentationLineGeometry) => {
  const turns = turningPoints(element)
  let start = element.start
  let end = element.end
  const points = element.points || ['', '']
  const startOffset = retractionOffset(points[0], element.width)
  const endOffset = retractionOffset(points[1], element.width)
  if (startOffset) {
    const target = turns[0] || element.end
    start = offsetPoint(element.start, target, Math.min(startOffset, distance(element.start, target) / 2))
  }
  if (endOffset) {
    const target = turns[turns.length - 1] || element.start
    end = offsetPoint(element.end, target, Math.min(endOffset, distance(target, element.end) / 2))
  }
  return pathWithEnds(element, start, end)
}
