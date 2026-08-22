import type { PPTImageElement, Slide, SlideBackground } from '@/types/slides'

type ImageBackgroundUpdate = Pick<Slide, 'background' | 'elements' | 'animations' | 'animationTimeline'>

export const createImageBackgroundUpdate = (
  slide: Slide,
  image: PPTImageElement,
): ImageBackgroundUpdate => {
  const remainingElements = slide.elements.filter(element => element.id !== image.id)
  const groupMemberCount = new Map<string, number>()

  for (const element of remainingElements) {
    if (element.groupId) {
      groupMemberCount.set(element.groupId, (groupMemberCount.get(element.groupId) || 0) + 1)
    }
  }

  const elements = remainingElements.map(element => {
    if (!element.groupId || (groupMemberCount.get(element.groupId) || 0) >= 2) return element
    const ungroupedElement = { ...element }
    delete ungroupedElement.groupId
    return ungroupedElement
  })

  const elementIds = new Set(elements.map(element => element.id))
  const groupIds = new Set(elements.flatMap(element => element.groupId ? [element.groupId] : []))
  const animations = slide.animations?.filter(animation => {
    return animation.target?.groupId
      ? groupIds.has(animation.target.groupId)
      : elementIds.has(animation.elId)
  })
  const animationTimeline = slide.animationTimeline ? {
    ...slide.animationTimeline,
    animations: slide.animationTimeline.animations.filter(animation => {
      if (animation.target.groupId) return groupIds.has(animation.target.groupId)
      if (animation.target.elementId) return elementIds.has(animation.target.elementId)
      return true
    }),
  } : undefined

  const background: SlideBackground = {
    ...slide.background,
    type: 'image',
    image: {
      src: image.src,
      size: 'cover',
    },
  }

  return { background, elements, animations, animationTimeline }
}
