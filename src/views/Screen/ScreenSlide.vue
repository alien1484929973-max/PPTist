<template>
  <div 
    class="screen-slide"
    :style="{
      width: viewportSize + 'px',
      height: viewportSize * viewportRatio + 'px',
      transform: `scale(${scale})`,
    }"
  >
    <div class="background" :style="{ ...backgroundStyle }"></div>
    <template v-for="item in renderItems" :key="item.key">
      <div
        v-if="item.groupId"
        class="screen-element-group"
        :id="`screen-group-${item.groupId}`"
        :data-group-id="item.groupId"
        :style="{
          left: item.range.minX + 'px',
          top: item.range.minY + 'px',
          width: Math.max(0.01, item.range.maxX - item.range.minX) + 'px',
          height: Math.max(0.01, item.range.maxY - item.range.minY) + 'px',
          zIndex: item.zIndex,
          visibility: needWaitGroupAnimation(item.groupId) ? 'hidden' : 'visible',
        }"
      >
        <div
          class="screen-element-group-content"
          :style="{
            left: -item.range.minX + 'px',
            top: -item.range.minY + 'px',
            width: viewportSize + 'px',
            height: viewportSize * viewportRatio + 'px',
          }"
        >
          <ScreenElement
            v-for="member in item.elements"
            :key="member.element.id"
            :elementInfo="member.element"
            :elementIndex="member.index + 1"
            :animationIndex="animationIndex"
            :turnSlideToId="turnSlideToId"
            :manualExitFullscreen="manualExitFullscreen"
          />
        </div>
      </div>
      <ScreenElement
        v-else
        :elementInfo="item.elements[0].element"
        :elementIndex="item.elements[0].index + 1"
        :animationIndex="animationIndex"
        :turnSlideToId="turnSlideToId"
        :manualExitFullscreen="manualExitFullscreen"
      />
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, provide } from 'vue'
import { storeToRefs } from 'pinia'
import { useSlidesStore } from '@/store'
import type { Slide } from '@/types/slides'
import { injectKeySlideId } from '@/types/injectKey'
import useSlideBackgroundStyle from '@/hooks/useSlideBackgroundStyle'
import { groupElementsForRender } from '@/utils/elementGroup'

import ScreenElement from './ScreenElement.vue'

const props = defineProps<{
  slide: Slide
  scale: number
  animationIndex: number
  turnSlideToId: (id: string) => void
  manualExitFullscreen: () => void
}>()

const { formatedAnimations, viewportRatio, viewportSize } = storeToRefs(useSlidesStore())

const renderItems = computed(() => groupElementsForRender(props.slide.elements))

const needWaitGroupAnimation = (groupId: string) => {
  const stepIndex = formatedAnimations.value.findIndex(step => {
    return step.animations.some(animation => animation.target?.groupId === groupId)
  })
  if (stepIndex === -1 || stepIndex < props.animationIndex) return false
  const firstAnimation = formatedAnimations.value[stepIndex].animations.find(animation => animation.target?.groupId === groupId)
  return firstAnimation?.type === 'in'
}

const background = computed(() => props.slide.background)
const { backgroundStyle } = useSlideBackgroundStyle(background)

const slideId = computed(() => props.slide.id)
provide(injectKeySlideId, slideId)
</script>

<style lang="scss" scoped>
.screen-slide {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  overflow: hidden;
  isolation: isolate;
}
.background {
  width: 100%;
  height: 100%;
  background-position: center;
  position: absolute;
  z-index: -1;
}
.screen-element-group {
  position: absolute;
  transform-origin: center;
  pointer-events: none;

  .screen-element-group-content {
    position: absolute;
  }

  :deep(.screen-element) {
    pointer-events: auto;
  }
}
</style>
