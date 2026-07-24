<template>
  <div class="element-animation-panel">
    <div class="element-animation" v-if="handleElement">
      <Popover 
        trigger="click" 
        v-model:value="animationPoolVisible" 
        @update:value="visible => handlePopoverVisibleChange(visible)"
        style="width: 100%;"
      >
        <template #content>
          <Tabs 
            :tabs="tabs" 
            v-model:value="activeTab" 
            :tabsStyle="{ marginBottom: '20px' }" 
            :tabStyle="{ width: '33.333%' }" 
            spaceAround
          />
          <template v-for="key in animationTypes">
            <div :class="['animation-pool', key]" :key="key" v-if="activeTab === key">
              <div class="pool-type" :key="effect.name" v-for="effect in animations[key]">
                <div class="type-title">{{effect.name}}：</div>
                <div class="pool-item-wrapper">
                  <div 
                    class="pool-item" 
                    v-for="item in effect.children" :key="item.name"
                    @mouseenter="previewPoolAnimation($event, key, item.value)"
                    @mouseleave="stopPoolPreview()"
                    @click="addAnimation(key, item.value)"
                  >
                    <div class="animation-box">{{item.name}}</div>
                  </div>
                </div>
              </div>
              <div class="mask" v-if="!popoverMaskHide"></div>
            </div>
          </template>
        </template>
        <Button class="element-animation-btn" @click="handleAnimationId = ''">
          <i-icon-park-outline:effects /> 添加动画
        </Button>
      </Popover>
    </div>

    <div class="tip" v-else><i-icon-park-outline:click style="margin-right: 5px;" /> 选中画布中的元素添加动画</div>
    
    <Divider />

    <div class="pane-title">动画窗格</div>

    <Draggable 
      class="animation-sequence"
      :modelValue="animationSequence"
      :animation="200"
      :scroll="true"
      :scrollSensitivity="50"
      handle=".sequence-content"
      itemKey="id"
      @end="handleDragEnd"
    >
      <template #item="{ element }">
        <div class="sequence-item" :class="[element.type, { 'active': activeAnimationId === element.id }]" @click="selectAnimation(element)">
          <div class="sequence-content">
            <div class="index">{{element.index}}</div>
            <div class="text">
              「{{element.elType}}」{{element.animationEffect}}
              <span class="direction" v-if="element.directionLabel"> · {{element.directionLabel}}</span>
            </div>
            <div class="handler">
              <i-icon-park-outline:play-one class="handler-btn" v-tooltip="'预览'" @click.stop="previewAnimation(element)" />
              <i-icon-park-outline:close-small class="handler-btn" v-tooltip="'删除'" @click.stop="deleteAnimation(element.id)" />
            </div>
          </div>

          <div class="configs" v-if="activeAnimationId === element.id">
            <Divider :margin="16" />

            <div class="config-item" v-if="getAnimationDirectionOptions(element).length">
              <div style="width: 35%;">效果选项：</div>
              <Select
                :value="getAnimationDirection(element) || ''"
                @update:value="value => updateElementAnimationDirection(element.id, value as AnimationDirection)"
                style="width: 65%;"
                :options="getAnimationDirectionOptions(element)"
              />
            </div>
            <div class="config-item">
              <div style="width: 35%;">持续时长：</div>
              <NumberInput 
                :min="100"
                :max="10000"
                :step="100"
                :value="element.duration" 
                @update:value="value => updateElementAnimationDuration(element.id, value)" 
                style="width: 65%;" 
              />
            </div>
            <div class="config-item">
              <div style="width: 35%;">延迟：</div>
              <NumberInput
                :min="0"
                :max="10000"
                :step="100"
                :value="element.delay || 0"
                @update:value="value => updateElementAnimationDelay(element.id, value)"
                style="width: 65%;"
              />
            </div>
            <div class="config-item">
              <div style="width: 35%;">开始：</div>
              <Select
                :value="element.trigger"
                @update:value="value => updateElementAnimationTrigger(element.id, value as AnimationTrigger)"
                style="width: 65%;"
                :options="[
                  { label: '单击时', value: 'click' },
                  { label: '与上一动画同时', value: 'meantime' },
                  { label: '上一动画之后', value: 'auto' },
                ]"
              />
            </div>
            <div class="config-item">
              <div style="width: 35%;">重复：</div>
              <Select
                :value="element.repeatCount || 1"
                @update:value="value => updateElementAnimationRepeat(element.id, Number(value))"
                style="width: 65%;"
                :options="[
                  { label: '无', value: 1 },
                  { label: '2 次', value: 2 },
                  { label: '3 次', value: 3 },
                  { label: '5 次', value: 5 },
                  { label: '10 次', value: 10 },
                ]"
              />
            </div>
            <div class="config-item">
              <div style="width: 35%;">速度曲线：</div>
              <Select
                :value="element.easing || 'ease'"
                @update:value="value => updateElementAnimationEasing(element.id, String(value))"
                style="width: 65%;"
                :options="[
                  { label: '平滑', value: 'ease' },
                  { label: '匀速', value: 'linear' },
                  { label: '平滑开始', value: 'ease-in' },
                  { label: '平滑结束', value: 'ease-out' },
                  { label: '平滑开始和结束', value: 'ease-in-out' },
                ]"
              />
            </div>
            <div class="config-item">
              <div style="width: 35%;">自动翻转：</div>
              <Switch
                :value="!!element.autoReverse"
                @update:value="value => updateElementAnimationAutoReverse(element.id, value)"
              />
            </div>
            <div class="config-item">
              <Button style="width: 100%;" @click="openAnimationPool(element.id)"><i-icon-park-outline:switch /> 更换动画</Button>
            </div>
          </div>
        </div>
      </template>
    </Draggable>

    <template v-if="animationSequence.length >= 2">
      <Divider />
      <Button @click="runAllAnimation()">
        <i-icon-park-outline:pause v-if="animateIn" /><i-icon-park-outline:play-one v-else /> {{ animateIn ? '停止预览' : '预览全部'}}
      </Button>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { nanoid } from 'nanoid'
import { storeToRefs } from 'pinia'
import {
  canonicalEffectFromLegacy,
  defaultDirectionForEffect,
  normalizeAnimationEffectId,
  type AnimationDirection,
  type TimelineAnimation,
  type TimelineTrigger,
} from '@pptist/presentation-core'
import { useMainStore, useSlidesStore } from '@/store'
import type { AnimationTrigger, AnimationType, PPTAnimation } from '@/types/slides'
import {
  ENTER_ANIMATIONS,
  EXIT_ANIMATIONS,
  ATTENTION_ANIMATIONS,
  ANIMATION_DEFAULT_DURATION,
  ANIMATION_DEFAULT_TRIGGER,
  getAnimationDirection,
  getAnimationDirectionLabel,
  getAnimationDirectionOptions,
  getAnimationEffectLabel,
} from '@/configs/animation'
import { ELEMENT_TYPE_ZH } from '@/configs/element'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useSelectElement from '@/hooks/useSelectElement'
import { runElementAnimation, type ElementAnimationHandle } from '@/utils/elementAnimation'

import Tabs from '@/components/Tabs.vue'
import Divider from '@/components/Divider.vue'
import Button from '@/components/Button.vue'
import Draggable from 'vuedraggable'
import NumberInput from '@/components/NumberInput.vue'
import Select from '@/components/Select.vue'
import Switch from '@/components/Switch.vue'
import Popover from '@/components/Popover.vue'

interface TabItem {
  key: AnimationType
  label: string
  color: string
}

interface SequenceAnimation extends PPTAnimation {
  index: number | ''
  elType: string
  animationEffect: string
  directionLabel: string
}

const animationTypes: AnimationType[] = ['in', 'out', 'attention']
const slidesStore = useSlidesStore()
const { handleElement, handleElementId } = storeToRefs(useMainStore())
const { currentSlide, formatedAnimations, currentSlideAnimations } = storeToRefs(slidesStore)
const { addHistorySnapshot } = useHistorySnapshot()
const { selectElement } = useSelectElement()

const tabs: TabItem[] = [
  { key: 'in', label: '入场', color: '#68a490' },
  { key: 'out', label: '退场', color: '#d86344' },
  { key: 'attention', label: '强调', color: '#e8b76a' },
]
const activeTab = ref<AnimationType>('in')
const animateIn = ref(false)
const animationPoolVisible = ref(false)
const activeAnimationId = ref('')
const handleAnimationId = ref('')

watch(handleElementId, elementId => {
  animationPoolVisible.value = false
  const active = currentSlideAnimations.value.find(animation => animation.id === activeAnimationId.value)
  if (active?.elId === elementId) return
  activeAnimationId.value = currentSlideAnimations.value.find(animation => animation.elId === elementId)?.id || ''
}, { immediate: true })

const timelineTrigger = (trigger: AnimationTrigger): TimelineTrigger => {
  if (trigger === 'meantime') return 'withPrevious'
  if (trigger === 'auto') return 'afterPrevious'
  return 'click'
}

const toTimelineAnimation = (
  animation: PPTAnimation,
  existing?: TimelineAnimation,
): TimelineAnimation => {
  const canonical = canonicalEffectFromLegacy(animation.effect, animation.type, animation.direction)
  return {
    ...existing,
    id: animation.id,
    target: { ...existing?.target, elementId: animation.elId },
    timing: {
      duration: animation.duration,
      delay: animation.delay || 0,
      trigger: timelineTrigger(animation.trigger),
      repeatCount: animation.repeatCount,
      autoReverse: animation.autoReverse,
      easing: animation.easing,
    },
    effect: {
      ...existing?.effect,
      class: animation.type === 'in' ? 'entrance' : animation.type === 'out' ? 'exit' : 'emphasis',
      compatibility: canonical ? 'mapped' : existing?.effect.compatibility || 'approximate',
      direction: canonical && 'direction' in canonical ? canonical.direction : undefined,
      canonical,
    },
  }
}

const commitAnimations = (animations: PPTAnimation[]) => {
  const existingTimeline = currentSlide.value.animationTimeline?.animations || []
  const existingById = new Map(existingTimeline.map(animation => [animation.id, animation]))
  const activeIds = new Set(animations.map(animation => animation.id))
  const preserved = existingTimeline.filter(animation => {
    return !activeIds.has(animation.id) && (
      animation.effect.compatibility === 'unsupported' || !animation.target.elementId
    )
  })
  slidesStore.updateSlide({
    animations,
    animationTimeline: {
      version: 1,
      animations: [
        ...animations.map(animation => toTimelineAnimation(animation, existingById.get(animation.id))),
        ...preserved,
      ],
    },
  })
}

const animationSequence = computed<SequenceAnimation[]>(() => {
  const sequence: SequenceAnimation[] = []
  for (let i = 0; i < formatedAnimations.value.length; i++) {
    const step = formatedAnimations.value[i]
    for (let j = 0; j < step.animations.length; j++) {
      const animation = step.animations[j]
      const element = currentSlide.value.elements.find(item => item.id === animation.elId)
      if (!element) continue
      sequence.push({
        ...animation,
        index: j === 0 ? i + 1 : '',
        elType: ELEMENT_TYPE_ZH[element.type],
        animationEffect: getAnimationEffectLabel(animation.effect, animation.type),
        directionLabel: getAnimationDirectionLabel(animation),
      })
    }
  }
  return sequence
})

const selectAnimation = (animation: PPTAnimation) => {
  activeAnimationId.value = animation.id
  selectElement(animation.elId)
}

const deleteAnimation = (id: string) => {
  const animations = currentSlideAnimations.value.filter(item => item.id !== id)
  commitAnimations(animations)
  activeAnimationId.value = animations.find(item => item.elId === handleElementId.value)?.id || ''
  addHistorySnapshot()
}

const handleDragEnd = (eventData: { newIndex: number; oldIndex: number }) => {
  const { newIndex, oldIndex } = eventData
  if (newIndex === undefined || oldIndex === undefined || newIndex === oldIndex) return
  const animations: PPTAnimation[] = JSON.parse(JSON.stringify(currentSlideAnimations.value))
  const animation = animations[oldIndex]
  animations.splice(oldIndex, 1)
  animations.splice(newIndex, 0, animation)
  commitAnimations(animations)
  addHistorySnapshot()
}

const animationElement = (elementId: string) => {
  return document.querySelector<HTMLElement>(`#editable-element-${elementId} [class^=editable-element-]`)
}

const runAnimation = (animation: PPTAnimation, target = animationElement(animation.elId)) => {
  if (!target) return undefined
  return runElementAnimation(target, animation)
}

const previewAnimation = (animation: PPTAnimation) => {
  const handle = runAnimation(animation)
  handle?.finished.then(() => window.setTimeout(handle.restore, 80))
}

let poolPreviewHandle: ElementAnimationHandle | undefined
const stopPoolPreview = () => {
  poolPreviewHandle?.restore()
  poolPreviewHandle = undefined
}
const previewPoolAnimation = (event: MouseEvent, type: AnimationType, effect: string) => {
  stopPoolPreview()
  const target = event.currentTarget as HTMLElement
  const handle = runElementAnimation(target, {
    id: 'pool-preview',
    elId: 'pool-preview',
    type,
    effect,
    direction: defaultDirectionForEffect(effect, type),
    duration: 500,
    trigger: 'click',
  })
  poolPreviewHandle = handle
  handle.finished.then(() => window.setTimeout(() => {
    if (poolPreviewHandle === handle) stopPoolPreview()
  }, 80))
}

let sequencePreviewHandles: ElementAnimationHandle[] = []
const stopSequencePreview = () => {
  for (const handle of sequencePreviewHandles) handle.restore()
  sequencePreviewHandles = []
}
const runAllAnimation = async () => {
  if (animateIn.value) {
    animateIn.value = false
    stopSequencePreview()
    return
  }
  animateIn.value = true
  for (const step of formatedAnimations.value) {
    if (!animateIn.value) break
    const handles = step.animations
      .map(animation => runAnimation(animation))
      .filter((handle): handle is ElementAnimationHandle => !!handle)
    sequencePreviewHandles = handles
    await Promise.all(handles.map(handle => handle.finished))
    if (!animateIn.value) break
    await new Promise(resolve => window.setTimeout(resolve, 80))
    stopSequencePreview()
  }
  stopSequencePreview()
  animateIn.value = false
}

const updateAnimationProps = (id: string, props: Partial<PPTAnimation>) => {
  const animations = currentSlideAnimations.value.map(item => item.id === id ? { ...item, ...props } : item)
  commitAnimations(animations)
  addHistorySnapshot()
}

const updateElementAnimationDuration = (id: string, duration: number) => {
  if (duration < 100 || duration > 10000) return
  updateAnimationProps(id, { duration })
}
const updateElementAnimationDelay = (id: string, delay: number) => {
  if (delay < 0 || delay > 10000) return
  updateAnimationProps(id, { delay })
}
const updateElementAnimationTrigger = (id: string, trigger: AnimationTrigger) => updateAnimationProps(id, { trigger })
const updateElementAnimationRepeat = (id: string, repeatCount: number) => updateAnimationProps(id, { repeatCount })
const updateElementAnimationEasing = (id: string, easing: string) => updateAnimationProps(id, { easing })
const updateElementAnimationAutoReverse = (id: string, autoReverse: boolean) => updateAnimationProps(id, { autoReverse })
const updateElementAnimationDirection = (id: string, direction: AnimationDirection) => {
  const animation = currentSlideAnimations.value.find(item => item.id === id)
  if (!animation) return
  updateAnimationProps(id, {
    effect: normalizeAnimationEffectId(animation.effect, animation.type),
    direction,
  })
  window.setTimeout(() => previewAnimation({ ...animation, effect: normalizeAnimationEffectId(animation.effect, animation.type), direction }), 0)
}

const updateElementAnimation = (type: AnimationType, effect: string) => {
  let changed: PPTAnimation | undefined
  const animations = currentSlideAnimations.value.map(item => {
    if (item.id !== handleAnimationId.value) return item
    changed = {
      ...item,
      type,
      effect,
      direction: defaultDirectionForEffect(effect, type),
    }
    return changed
  })
  commitAnimations(animations)
  animationPoolVisible.value = false
  handleAnimationId.value = ''
  if (changed) activeAnimationId.value = changed.id
  addHistorySnapshot()
  if (changed) window.setTimeout(() => previewAnimation(changed!), 0)
}

const addAnimation = (type: AnimationType, effect: string) => {
  if (handleAnimationId.value) {
    updateElementAnimation(type, effect)
    return
  }
  const animation: PPTAnimation = {
    id: nanoid(10),
    elId: handleElementId.value,
    type,
    effect,
    direction: defaultDirectionForEffect(effect, type),
    duration: ANIMATION_DEFAULT_DURATION,
    trigger: ANIMATION_DEFAULT_TRIGGER,
  }
  commitAnimations([...currentSlideAnimations.value, animation])
  animationPoolVisible.value = false
  activeAnimationId.value = animation.id
  addHistorySnapshot()
  window.setTimeout(() => previewAnimation(animation), 0)
}

const popoverMaskHide = ref(false)
const handlePopoverVisibleChange = (visible: boolean) => {
  if (visible) window.setTimeout(() => popoverMaskHide.value = true, 600)
  else {
    popoverMaskHide.value = false
    stopPoolPreview()
    handleAnimationId.value = ''
  }
}

const openAnimationPool = (animationId: string) => {
  const animation = currentSlideAnimations.value.find(item => item.id === animationId)
  if (animation) activeTab.value = animation.type
  animationPoolVisible.value = true
  handleAnimationId.value = animationId
  handlePopoverVisibleChange(true)
}

const animations = {
  in: ENTER_ANIMATIONS,
  out: EXIT_ANIMATIONS,
  attention: ATTENTION_ANIMATIONS,
}
</script>

<style lang="scss" scoped>
$inColor: #68a490;
$outColor: #d86344;
$attentionColor: #e8b76a;

.element-animation-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.element-animation {
  height: 32px;
  display: flex;
  align-items: center;
}
.element-animation-btn {
  width: 100%;
}
.pane-title {
  margin: -2px 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: #555;
}
.config-item {
  display: flex;
  align-items: center;

  & + .config-item {
    margin-top: 5px;
  }
}
.tip {
  height: 32px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-style: italic;
}
.animation-pool {
  width: 400px;
  height: 500px;
  overflow-y: auto;
  overflow-x: hidden;
  font-size: 12px;
  margin-right: -10px;
  padding-right: 5px;
  position: relative;

  .mask {
    @include absolute-0();
  }

  &.in .type-title {
    border-left-color: $inColor;
    background-color: rgba($color: $inColor, $alpha: .15);
  }
  &.out .type-title {
    border-left-color: $outColor;
    background-color: rgba($color: $outColor, $alpha: .15);
  }
  &.attention .type-title {
    border-left-color: $attentionColor;
    background-color: rgba($color: $attentionColor, $alpha: .15);
  }
}
.pool-type:not(:last-child) {
  margin-bottom: 5px;
}
.type-title {
  width: 100%;
  font-size: 13px;
  margin-bottom: 10px;
  border-left: 4px solid #aaa;
  background-color: #eee;
  padding: 4px 0 4px 10px;
}
.pool-item-wrapper {
  @include flex-grid-layout();
}
.pool-item {
  @include flex-grid-layout-children(4, 24%);

  margin-bottom: 5px;
  height: 40px;
  line-height: 40px;
  text-align: center;
  cursor: pointer;
}
.animation-box {
  background-color: $lightGray;
  border-radius: $borderRadius;
}

.animation-sequence {
  flex: 1;
  padding-right: 12px;
  margin-right: -12px;

  @include overflow-overlay();
}
.sequence-item {
  border: 1px solid $borderColor;
  padding: 8px;
  border-radius: $borderRadius;
  margin-bottom: 8px;
  transition: all .5s;

  &.in.active {
    border-color: $inColor;
  }
  &.out.active {
    border-color: $outColor;
  }
  &.attention.active {
    border-color: $attentionColor;
  }
  &.active {
    height: auto;
  }

  .sequence-content {
    display: flex;
    align-items: center;
    cursor: grab;

    &:active {
      cursor: grabbing;
    }

    .index {
      flex: 1;
    }
    .text {
      flex: 6;

      .direction {
        color: #888;
      }
    }
    .handler {
      flex: 2;
      font-size: 15px;
      text-align: right;
    }
    .handler-btn {
      margin-left: 8px;
      cursor: pointer;
    }
  }
}
</style>
