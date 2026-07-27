import { ELEMENT_TYPE_ZH } from '@/configs/element'
import type { PPTElement } from '@/types/slides'

const DEFAULT_OBJECT_NAME = /^(?:图片|picture|image|文本|文本框|text|text\s*box|textbox|形状|shape|rectangle|矩形|线条|line|组合|group|graphicframe|图表|chart|表格|table|视频|video|音频|audio|公式|latex)\s*\d+$/i

export const isDefaultElementObjectName = (name: string) => DEFAULT_OBJECT_NAME.test(name.trim())

/**
 * Office-style object label used by the selection, animation and Morph panes.
 * Text content is intentionally never used as the label: an unnamed text box
 * remains "文本 1" even when its contents change between slides.
 */
export const elementObjectName = (element: PPTElement, elements: readonly PPTElement[]) => {
  if (element.name && !isDefaultElementObjectName(element.name)) return element.name
  const ordinal = elements
    .filter(candidate => candidate.type === element.type)
    .findIndex(candidate => candidate.id === element.id)
  return `${ELEMENT_TYPE_ZH[element.type] || '对象'} ${Math.max(0, ordinal) + 1}`
}

export const groupObjectName = (groupId: string, elements: readonly PPTElement[]) => {
  const groupIds = [...new Set(elements.flatMap(element => element.groupId ? [element.groupId] : []))]
  return `组合 ${Math.max(0, groupIds.indexOf(groupId)) + 1}`
}
