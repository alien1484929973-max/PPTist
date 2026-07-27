<template>
  <div class="slide-animation-panel">
    <div class="animation-pool">
      <div
        class="animation-item"
        :class="{ 'active': currentTurningMode === item.value }"
        v-for="item in animations"
        :key="item.label"
        @click="updateTurningMode(item.value)"
      >
        <div :class="['animation-block', item.value]">P</div>
        <div class="animation-text">{{item.label}}</div>
      </div>
    </div>
    <Button style="width: 100%;" @click="applyAllSlide()"><i-icon-park-outline:check /> 应用到全部</Button>

    <div class="morph-settings" v-if="currentTurningMode === 'morph'">
      <Divider />
      <div class="section-heading">
        <div>
          <div class="section-title">平滑设置</div>
          <div class="section-description">对象匹配与显示控制统一放在选择窗格</div>
        </div>
        <span class="match-count" v-if="previousSlide">{{ morphResult.matches.length }} 对</span>
      </div>

      <div class="setting-row">
        <div class="setting-label">持续时间</div>
        <NumberInput
          :min="100"
          :max="10000"
          :step="100"
          :value="morphTransition.duration"
          @update:value="updateMorphDuration"
        ><template #suffix>毫秒</template></NumberInput>
      </div>
      <div class="setting-row">
        <div class="setting-label">细化方式</div>
        <Select
          :value="morphTransition.morph?.mode || 'byObject'"
          @update:value="updateMorphMode"
          :options="[
            { label: '按对象', value: 'byObject' },
            { label: '按单词', value: 'byWord' },
            { label: '按字符', value: 'byChar' },
          ]"
        />
      </div>
      <div class="selection-pane-entry">
        <div>
          <div class="selection-pane-entry-title">对象关联</div>
          <div class="section-description" v-if="previousSlide">当前已识别 {{ morphResult.matches.length }} 组对象</div>
          <div class="section-description" v-else>从第二页开始设置上一页对象</div>
        </div>
        <Button size="small" @click="openSelectPanel()"><i-icon-park-outline:move-one /> 选择窗格</Button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useMainStore, useSlidesStore } from '@/store'
import type { TurningMode } from '@/types/slides'
import {
  createPresentationMorphCandidates,
  matchMorphElements,
  type PptxMorphMode,
  type SlideTransition,
} from '@pptist/presentation-core'
import { SLIDE_ANIMATIONS } from '@/configs/animation'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import message from '@/utils/message'
import Button from '@/components/Button.vue'
import Divider from '@/components/Divider.vue'
import NumberInput from '@/components/NumberInput.vue'
import Select from '@/components/Select.vue'

const slidesStore = useSlidesStore()
const mainStore = useMainStore()
const { slides, currentSlide, slideIndex } = storeToRefs(slidesStore)

const currentTurningMode = computed(() => currentSlide.value.transition?.type === 'morph'
  ? 'morph'
  : currentSlide.value.turningMode || 'slideY')

const animations = SLIDE_ANIMATIONS

const previousSlide = computed(() => slideIndex.value > 0 ? slides.value[slideIndex.value - 1] : undefined)
const morphTransition = computed<SlideTransition>(() => currentSlide.value.transition?.type === 'morph'
  ? currentSlide.value.transition
  : {
      type: 'morph',
      duration: 700,
      morph: { mode: 'byObject' },
      source: 'editor',
    })

const morphResult = computed(() => matchMorphElements(
  createPresentationMorphCandidates(previousSlide.value?.elements || []),
  createPresentationMorphCandidates(currentSlide.value.elements),
  morphTransition.value.morph,
))

const { addHistorySnapshot } = useHistorySnapshot()

const transitionForMode = (mode: TurningMode): SlideTransition | undefined => {
  if (mode !== 'morph') return undefined
  if (currentSlide.value.transition?.type === 'morph') return currentSlide.value.transition
  return {
    type: 'morph',
    duration: 700,
    morph: { mode: 'byObject' },
    source: 'editor',
  }
}

// 修改播放时的切换页面方式
const updateTurningMode = (mode: TurningMode) => {
  if (mode === currentTurningMode.value) return
  slidesStore.updateSlide({
    turningMode: mode,
    transition: transitionForMode(mode),
  })
  addHistorySnapshot()
}

const commitMorph = (morph: NonNullable<SlideTransition['morph']>, duration = morphTransition.value.duration) => {
  slidesStore.updateSlide({
    turningMode: 'morph',
    transition: {
      ...morphTransition.value,
      type: 'morph',
      duration,
      morph,
      source: 'editor',
    },
  })
  addHistorySnapshot()
}

const updateMorphDuration = (duration: number) => {
  if (duration < 100 || duration > 10000) return
  commitMorph({ ...morphTransition.value.morph! }, duration)
}
const updateMorphMode = (mode: string | number) => {
  commitMorph({ ...morphTransition.value.morph!, mode: String(mode) as PptxMorphMode })
}
const openSelectPanel = () => mainStore.setSelectPanelState(true)

// 将当前页的切换页面方式应用到全部页面
const applyAllSlide = () => {
  const transition = currentSlide.value.transition
  const newSlides = slides.value.map(slide => {
    return {
      ...slide,
      turningMode: currentSlide.value.turningMode,
      transition: transition ? {
        ...transition,
        morph: transition.morph ? {
          mode: transition.morph.mode,
          ...(slide.id === currentSlide.value.id ? {
            links: transition.morph.links?.map(link => ({ ...link })),
            excludedToElementIds: transition.morph.excludedToElementIds
              ? [...transition.morph.excludedToElementIds]
              : undefined,
          } : {}),
        } : undefined,
      } : undefined,
    }
  })
  slidesStore.setSlides(newSlides)
  message.success('已应用到全部')
  addHistorySnapshot()
}
</script>

<style lang="scss" scoped>
.animation-pool {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.animation-item {
  width: 50%;
  height: 100px;
  border: solid 1px #d6d6d6;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 20px 0 15px 0;
  position: relative;
  cursor: pointer;

  &.active {
    border-color: $themeColor;
    background-color: rgba($color: $themeColor, $alpha: .05);
    z-index: 1;
  }

  &:nth-child(2n) {
    margin-left: -1px;
  }
  &:nth-child(n+3) {
    margin-top: -1px;
  }
}
.animation-block {
  width: 64px;
  height: 36px;
  background: #666;
  position: relative;
  overflow: hidden;
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: center;

  @mixin elAnimation($animationType) {
    content: 'PPTist';
    width: 100%;
    height: 100%;
    position: absolute;
    left: 0;
    top: 0;
    background-color: $themeColor;
    color: #fff;
    display: flex;
    justify-content: center;
    align-items: center;
    animation: $animationType $transitionDelaySlow linear;
  }

  &.fade:hover {
    &::after {
      @include elAnimation(fade);
    }
  }
  &.slideX:hover {
    &::after {
      @include elAnimation(slideX);
    }
  }
  &.slideY:hover {
    &::after {
      @include elAnimation(slideY);
    }
  }
  &.slideX3D:hover {
    &::after {
      @include elAnimation(slideX3D);
    }
  }
  &.slideY3D:hover {
    &::after {
      @include elAnimation(slideY3D);
    }
  }
  &.rotate:hover {
    &::after {
      transform-origin: 0 0;
      @include elAnimation(rotate);
    }
  }
  &.scaleY:hover {
    &::after {
      @include elAnimation(scaleY);
    }
  }
  &.scaleX:hover {
    &::after {
      @include elAnimation(scaleX);
    }
  }
  &.scale:hover {
    &::after {
      @include elAnimation(scale);
    }
  }
  &.scaleReverse:hover {
    &::after {
      @include elAnimation(scaleReverse);
    }
  }
}
.animation-text {
  font-size: 12px;
  color: #333;
  text-align: center;
}
.morph-settings {
  margin-top: 2px;
}
.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
}
.section-title {
  font-weight: 600;
  color: #444;
}
.section-description {
  margin-top: 2px;
  color: #999;
  font-size: 11px;
}
.match-count {
  flex: none;
  padding: 2px 6px;
  border-radius: 10px;
  color: $themeColor;
  background: rgba($color: $themeColor, $alpha: .08);
  font-size: 11px;
}
.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;

  > :last-child {
    flex: 1;
    min-width: 0;
  }
}
.setting-label {
  flex: none;
  width: 58px;
  color: #666;
}
.selection-pane-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 11px;
  padding: 9px;
  border: 1px solid #e1e1e1;
  border-radius: $borderRadius;
  background: #fafafa;
}
.selection-pane-entry-title {
  color: #555;
  font-weight: 600;
}

@keyframes fade {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
@keyframes slideX {
  0% {
    transform: translateX(100%);
  }
  100% {
    transform: translateX(0);
  }
}
@keyframes slideY {
  0% {
    transform: translateY(100%);
  }
  100% {
    transform: translateY(0);
  }
}
@keyframes slideX3D {
  0% {
    transform: translateX(100%) scale(.5);
  }
  100% {
    transform: translateX(0);
  }
}
@keyframes slideY3D {
  0% {
    transform: translateY(100%) scale(.5);
  }
  100% {
    transform: translateY(0);
  }
}
@keyframes rotate {
  0% {
    transform: rotate(-90deg);
  }
  100% {
    transform: rotate(0);
  }
}
@keyframes scaleY {
  0% {
    transform: scaleY(.1);
  }
  100% {
    transform: scaleY(1);
  }
}
@keyframes scaleX {
  0% {
    transform: scaleX(.1);
  }
  100% {
    transform: scaleY(1);
  }
}
@keyframes scale {
  0% {
    transform: scale(.25);
  }
  100% {
    transform: scale(1);
  }
}
@keyframes scaleReverse {
  0% {
    transform: scale(2);
  }
  100% {
    transform: scale(1);
  }
}
</style>
