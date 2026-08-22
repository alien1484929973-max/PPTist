import { storeToRefs } from 'pinia'
import { useMainStore, useSlidesStore } from '@/store'
import type { PPTImageElement } from '@/types/slides'
import { createImageBackgroundUpdate } from '@/utils/slideBackground'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'

export default () => {
  const mainStore = useMainStore()
  const slidesStore = useSlidesStore()
  const { currentSlide } = storeToRefs(slidesStore)
  const { addHistorySnapshot } = useHistorySnapshot()

  const setImageAsBackground = (image: PPTImageElement) => {
    const update = createImageBackgroundUpdate(currentSlide.value, image)
    slidesStore.updateSlide(update)
    mainStore.setActiveElementIdList([])
    mainStore.setActiveGroupElementId('')
    addHistorySnapshot()
  }

  return {
    setImageAsBackground,
  }
}
