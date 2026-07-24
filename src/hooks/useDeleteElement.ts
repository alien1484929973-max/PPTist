import { storeToRefs } from 'pinia'
import { useMainStore, useSlidesStore } from '@/store'
import type { PPTElement } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'

export default () => {
  const mainStore = useMainStore()
  const slidesStore = useSlidesStore()
  const { activeElementIdList, activeGroupElementId } = storeToRefs(mainStore)
  const { currentSlide } = storeToRefs(slidesStore)

  const { addHistorySnapshot } = useHistorySnapshot()

  const animationsForElements = (elements: PPTElement[]) => {
    const elementIds = new Set(elements.map(element => element.id))
    const groupIds = new Set(elements.flatMap(element => element.groupId ? [element.groupId] : []))
    const animations = currentSlide.value.animations?.filter(animation => {
      return animation.target?.groupId
        ? groupIds.has(animation.target.groupId)
        : elementIds.has(animation.elId)
    })
    const timeline = currentSlide.value.animationTimeline
    const animationTimeline = timeline ? {
      ...timeline,
      animations: timeline.animations.filter(animation => {
        if (animation.target.groupId) return groupIds.has(animation.target.groupId)
        if (animation.target.elementId) return elementIds.has(animation.target.elementId)
        return true
      }),
    } : undefined
    return { animations, animationTimeline }
  }

  // 删除全部选中元素
  // 组合元素成员中，存在被选中可独立操作的元素时，优先删除该元素。否则默认删除所有被选中的元素
  const deleteElement = () => {
    if (!activeElementIdList.value.length) return

    let newElementList: PPTElement[] = []
    if (activeGroupElementId.value) {
      newElementList = currentSlide.value.elements.filter(el => el.id !== activeGroupElementId.value)
    }
    else {
      newElementList = currentSlide.value.elements.filter(el => !activeElementIdList.value.includes(el.id))
    }

    const groupMemberCount = new Map<string, number>()
    for (const element of newElementList) {
      if (element.groupId) groupMemberCount.set(element.groupId, (groupMemberCount.get(element.groupId) || 0) + 1)
    }
    newElementList = newElementList.map(element => {
      if (!element.groupId || (groupMemberCount.get(element.groupId) || 0) >= 2) return element
      const ungrouped = { ...element }
      delete ungrouped.groupId
      return ungrouped
    })

    mainStore.setActiveElementIdList([])
    slidesStore.updateSlide({ elements: newElementList, ...animationsForElements(newElementList) })
    addHistorySnapshot()
  }

  // 删除内面内全部元素(无论是否选中)
  const deleteAllElements = () => {
    if (!currentSlide.value.elements.length) return
    mainStore.setActiveElementIdList([])
    slidesStore.updateSlide({ elements: [], animations: [], animationTimeline: undefined })
    addHistorySnapshot()
  }

  return {
    deleteElement,
    deleteAllElements,
  }
}
