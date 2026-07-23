import type { PPTElement, PPTLineElement, PPTShapeElement } from '@/types/slides'

const clonePoint = (point: [number, number] | undefined) => point ? [...point] as [number, number] : undefined

/**
 * Creates the mutable geometry snapshot used by the canvas without copying
 * large immutable payloads such as image data URLs, text HTML and SVG paths.
 * Canvas operations replace element objects and only mutate the small arrays
 * copied below.
 */
export const cloneEditorElement = (element: PPTElement): PPTElement => {
  if (element.type === 'line') {
    const line: PPTLineElement = {
      ...element,
      start: [...element.start],
      end: [...element.end],
      points: [...element.points],
    }
    const broken = clonePoint(element.broken)
    const broken2 = clonePoint(element.broken2)
    const curve = clonePoint(element.curve)
    if (broken) line.broken = broken
    if (broken2) line.broken2 = broken2
    if (curve) line.curve = curve
    if (element.cubic) {
      line.cubic = [
        [...element.cubic[0]],
        [...element.cubic[1]],
      ]
    }
    return line
  }

  if (element.type === 'shape') {
    const shape: PPTShapeElement = {
      ...element,
      viewBox: [...element.viewBox],
    }
    if (element.keypoints) shape.keypoints = [...element.keypoints]
    return shape
  }

  return { ...element }
}

export const cloneEditorElements = (elements: PPTElement[]) => elements.map(cloneEditorElement)
