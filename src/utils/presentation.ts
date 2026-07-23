import { nanoid } from 'nanoid'
import type { PresentationContent } from '@/types/cloud'
import type { SlideTheme } from '@/types/slides'
import { useSlidesStore } from '@/store/slides'

const defaultTheme: SlideTheme = {
  themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4', '#70ad47'],
  fontColor: '#333',
  fontName: '',
  backgroundColor: '#fff',
  shadow: {
    h: 3,
    v: 3,
    blur: 2,
    color: '#808080',
  },
  outline: {
    width: 2,
    color: '#525252',
    style: 'solid',
  },
}

export const createBlankPresentation = (title = '未命名演示文稿'): PresentationContent => ({
  schemaVersion: 1,
  title,
  width: 1000,
  height: 562.5,
  theme: structuredClone(defaultTheme),
  slides: [{
    id: nanoid(10),
    elements: [],
    background: {
      type: 'solid',
      color: defaultTheme.backgroundColor,
    },
  }],
  lastSlideIndex: 0,
})

export const serializePresentation = (): PresentationContent => {
  const slidesStore = useSlidesStore()
  return {
    schemaVersion: 1,
    title: slidesStore.title,
    width: slidesStore.viewportSize,
    height: slidesStore.viewportSize * slidesStore.viewportRatio,
    theme: structuredClone(slidesStore.theme),
    slides: structuredClone(slidesStore.slides),
    lastSlideIndex: slidesStore.slideIndex,
  }
}

export const applyPresentation = (content: PresentationContent) => {
  const slidesStore = useSlidesStore()
  const width = Number(content.width) || 1000
  const height = Number(content.height) || 562.5
  const maxIndex = Math.max(0, content.slides.length - 1)

  slidesStore.$patch({
    title: content.title || '未命名演示文稿',
    theme: structuredClone(content.theme || defaultTheme),
    slides: structuredClone(content.slides),
    slideIndex: Math.min(Math.max(Number(content.lastSlideIndex) || 0, 0), maxIndex),
    viewportSize: width,
    viewportRatio: height / width,
  })
}
