<template>
  <div class="mobile-player" 
    :style="{
      width: playerSize.width + 'px',
      height: playerSize.height + 'px',
      transform: `rotate(90deg) translateY(-${playerSize.height}px)`,
    }"
  >
    <PresentationPlayerCanvas
      :keyboard="false"
      :wheel="false"
      :clickToAdvance="false"
      @ready="attachPresentationPlayer"
      @stateChange="syncPresentationPlayerState"
      @click="toolVisible = !toolVisible"
      @touchstart="($event: TouchEvent) => touchStartListener($event)"
      @touchend="($event: TouchEvent) => touchEndListener($event)"
    />

    <template v-if="toolVisible">
      <div class="header">
        <div class="back" @click="changeMode('preview')"><i-icon-park-outline:logout /> 退出播放</div>
      </div>
      <MobileThumbnails class="thumbnails" />
    </template>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useSlidesStore } from '@/store'
import type { Mode } from '@/types/mobile'
import type { PlayerState, PresentationPlayer } from 'pptist-presentation-player'

import MobileThumbnails from './MobileThumbnails.vue'
import PresentationPlayerCanvas from '../Screen/PresentationPlayerCanvas.vue'

defineProps<{
  changeMode: (mode: Mode) => void
}>()

const slidesStore = useSlidesStore()
const { slideIndex } = storeToRefs(slidesStore)

const toolVisible = ref(false)
const dependencyPlayer = shallowRef<PresentationPlayer | null>(null)

const attachPresentationPlayer = (player: PresentationPlayer | null) => {
  dependencyPlayer.value = player
}

const syncPresentationPlayerState = (state: PlayerState) => {
  if (slideIndex.value !== state.slideIndex) slidesStore.updateSlideIndex(state.slideIndex)
}

const playerSize = ref({ width: 0, height: 0 })

onMounted(() => {
  if (slideIndex.value !== 0) slidesStore.updateSlideIndex(0)
  dependencyPlayer.value?.goTo(0)

  playerSize.value = {
    width: document.body.clientHeight,
    height: document.body.clientWidth,
  }
})

const touchInfo = ref<{ x: number; y: number; } | null>(null)
const touchStartListener = (e: TouchEvent) => {
  touchInfo.value = {
    x: e.changedTouches[0].pageX,
    y: e.changedTouches[0].pageY,
  }
}
const touchEndListener = (e: TouchEvent) => {
  if (!touchInfo.value) return

  const offsetX = e.changedTouches[0].pageX - touchInfo.value.x
  const offsetY = e.changedTouches[0].pageY - touchInfo.value.y
  const offsetAbsX = Math.abs(offsetX)
  const offsetAbsY = Math.abs(offsetY)

  if ( offsetAbsX > offsetAbsY && offsetAbsX > 50 ) {
    if (offsetX < 0) void dependencyPlayer.value?.previous()
    if (offsetX > 0) void dependencyPlayer.value?.next()
  }

  if ( offsetAbsY > offsetAbsX && offsetAbsY > 50 ) {
    if (offsetY > 0) void dependencyPlayer.value?.previous()
    if (offsetY < 0) void dependencyPlayer.value?.next()
  }
}

watch(slideIndex, index => {
  if (dependencyPlayer.value && dependencyPlayer.value.state.slideIndex !== index) {
    dependencyPlayer.value.goTo(index)
  }
})
</script>

<style lang="scss" scoped>
.mobile-player {
  transform-origin: 0 0;
  background-color: #1d1d1d;
  position: relative;
}
.screen-slide-list {
  position: relative;
  width: 100%;
  height: 100%;
}
.slide-item {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;

  &:not(.last, .next) {
    z-index: -1;
  }

  &.current {
    z-index: 2;
  }

  &.hide {
    opacity: 0;
  }

  &.turning-mode-no {
    &.before {
      transform: translateY(-100%);
    }
    &.after {
      transform: translateY(100%);
    }
  }
  &.turning-mode-fade {
    transition: opacity .75s;
    &.before {
      pointer-events: none;
      opacity: 0;
    }
    &.after {
      pointer-events: none;
      opacity: 0;
    }
  }
  &.turning-mode-slideX {
    transition: transform .35s;
    &.before {
      transform: translateX(-100%);
    }
    &.after {
      transform: translateX(100%);
    }
  }
  &.turning-mode-slideY {
    transition: transform .35s;
    &.before {
      transform: translateY(-100%);
    }
    &.after {
      transform: translateY(100%);
    }
  }
}
.slide-content {
  background-color: #fff;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  justify-content: center;
  align-items: center;
}

.header {
  width: 100%;
  height: 40px;
  line-height: 40px;
  padding: 0 15px;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 99;
  background-color: rgba($color: #1d1d1d, $alpha: .7);
  text-align: right;
  font-size: 13px;
  color: #fff;
  animation: slideInDown .15s;

  .back {
    height: 100%;
  }
}
.thumbnails {
  width: 100%;
  position: absolute;
  bottom: 0;
  left: 0;
  z-index: 99;
  background-color: rgba($color: #1d1d1d, $alpha: .7);
  overflow: auto !important;
  animation: slideInUp .15s;
}

@keyframes slideInUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
@keyframes slideInDown {
  from {
    transform: translateY(-100%);
  }
  to {
    transform: translateY(0);
  }
}
</style>
