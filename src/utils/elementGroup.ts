import type { PPTElement } from '@/types/slides'
import { getElementListRange } from './element'

export interface RenderElementItem {
  element: PPTElement
  index: number
}

export interface RenderElementGroup {
  key: string
  groupId?: string
  elements: RenderElementItem[]
  range: { minX: number; maxX: number; minY: number; maxY: number }
  zIndex: number
}

/** Builds stable render groups without changing the flat document schema. */
export const groupElementsForRender = (elements: PPTElement[]): RenderElementGroup[] => {
  const groups: RenderElementGroup[] = []
  const renderedGroupIds = new Set<string>()

  elements.forEach((element, index) => {
    if (!element.groupId) {
      groups.push({
        key: element.id,
        elements: [{ element, index }],
        range: getElementListRange([element]),
        zIndex: index + 1,
      })
      return
    }
    if (renderedGroupIds.has(element.groupId)) return
    renderedGroupIds.add(element.groupId)

    const members = elements
      .map((candidate, candidateIndex) => ({ element: candidate, index: candidateIndex }))
      .filter(item => item.element.groupId === element.groupId)
    groups.push({
      key: `group-${element.groupId}`,
      groupId: element.groupId,
      elements: members,
      range: getElementListRange(members.map(item => item.element)),
      zIndex: Math.max(...members.map(item => item.index + 1)),
    })
  })

  return groups
}
