import { storeToRefs } from 'pinia'
import { nanoid } from 'nanoid'
import { useSlidesStore, useMainStore } from '@/store'
import type { PPTElement, Slide } from '@/types/slides'
import { createSlideIdMap, createElementIdMap, getElementRange } from '@/utils/element'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'

export default () => {
  const mainStore = useMainStore()
  const slidesStore = useSlidesStore()
  const { currentSlide } = storeToRefs(slidesStore)

  const { addHistorySnapshot } = useHistorySnapshot()

  /**
   * 添加指定的元素数据（一组）
   * @param elements 元素列表数据
   */
  const addElementsFromData = (elements: PPTElement[]) => {
    const { groupIdMap, elIdMap } = createElementIdMap(elements)

    const firstElement = elements[0]
    let offset = 0
    let lastSameElement: PPTElement | undefined
    
    do {
      lastSameElement = currentSlide.value.elements.find(el => {
        if (el.type !== firstElement.type) return false
  
        const { minX: oMinX, maxX: oMaxX, minY: oMinY, maxY: oMaxY } = getElementRange(el)
        const { minX: nMinX, maxX: nMaxX, minY: nMinY, maxY: nMaxY } = getElementRange({
          ...firstElement,
          left: firstElement.left + offset,
          top: firstElement.top + offset
        })
        if (
          oMinX === nMinX &&
          oMaxX === nMaxX &&
          oMinY === nMinY &&
          oMaxY === nMaxY
        ) return true
  
        return false
      })
      if (lastSameElement) offset += 10

    } while (lastSameElement)
    
    for (const element of elements) {
      element.id = elIdMap[element.id]

      element.left = element.left + offset
      element.top = element.top + offset

      if (element.groupId) element.groupId = groupIdMap[element.groupId]
    }
    slidesStore.addElement(elements)
    mainStore.setActiveElementIdList(Object.values(elIdMap))
    addHistorySnapshot()
  }

  /**
   * 添加指定的页面数据
   * @param slide 页面数据
   */
  const addSlidesFromData = (slides: Slide[]) => {
    const slideIdMap = createSlideIdMap(slides)
    const newSlides = slides.map(slide => {
      const { groupIdMap, elIdMap } = createElementIdMap(slide.elements)

      for (const element of slide.elements) {
        element.id = elIdMap[element.id]
        if (element.groupId) element.groupId = groupIdMap[element.groupId]
		
        // 若元素绑定了页面跳转链接
        if (element.link && element.link.type === 'slide') {

          // 待添加页面中包含该页面，则替换相关绑定关系
          if (slideIdMap[element.link.target]) {
            element.link.target = slideIdMap[element.link.target]
          }
          // 待添加页面中不包含该页面，则删除该元素绑定的页面跳转
          else delete element.link
        }
      }
      // 动画id替换
      const animationIdMap = new Map<string, string>()
      if (slide.animations) {
        for (const animation of slide.animations) {
          const oldAnimationId = animation.id
          const newAnimationId = nanoid(10)
          animationIdMap.set(oldAnimationId, newAnimationId)
          animation.id = newAnimationId
          const groupId = animation.target?.groupId
          if (groupId) {
            const newGroupId = groupIdMap[groupId]
            animation.elId = newGroupId
            animation.target = { ...animation.target, elementId: undefined, groupId: newGroupId }
          }
          else {
            animation.elId = elIdMap[animation.elId]
            if (animation.target?.elementId) {
              animation.target = { ...animation.target, elementId: elIdMap[animation.target.elementId] }
            }
          }
        }
      }
      if (slide.animationTimeline) {
        for (const animation of slide.animationTimeline.animations) {
          animation.id = animationIdMap.get(animation.id) || nanoid(10)
          if (animation.target.groupId) {
            animation.target.groupId = groupIdMap[animation.target.groupId]
            animation.target.elementId = undefined
          }
          else if (animation.target.elementId) {
            animation.target.elementId = elIdMap[animation.target.elementId]
          }
        }
      }
      return {
        ...slide,
        id: slideIdMap[slide.id],
      }
    })
    slidesStore.addSlide(newSlides)
    addHistorySnapshot()
  }

  return {
    addElementsFromData,
    addSlidesFromData,
  }
}
