<template>
  <div class="element-animation-panel">
    <div class="element-animation" v-if="animationTargetAvailable">
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
          <i-icon-park-outline:effects /> {{ addAnimationButtonText }}
        </Button>
      </Popover>
    </div>

    <div class="tip" v-else><i-icon-park-outline:click style="margin-right: 5px;" /> 选中画布中的元素添加动画</div>
    
    <Divider :margin="8" />

    <div class="pane-toolbar">
      <div class="sequence-title">
        <span>顺序</span>
        <span class="sequence-count">{{ animationSequence.length }}</span>
      </div>
      <Button size="small" @click="runAllAnimation()" :disabled="!animationSequence.length">
        <i-icon-park-outline:pause v-if="animateIn" />
        <i-icon-park-outline:play-one v-else />
        {{ animateIn ? '停止' : '播放' }}
      </Button>
    </div>

    <div class="selected-animation-editor" v-if="selectedAnimation">
      <div class="selected-animation-heading">
        <div class="selected-animation-name">
          <span :class="['effect-dot', selectedAnimation.type]"></span>
          {{ selectedAnimation.elementLabel }}
        </div>
        <div class="selected-animation-actions">
          <Popover
            trigger="click"
            placement="bottom-end"
            v-model:value="advancedTimingVisible"
            :contentStyle="{ width: '224px' }"
          >
            <template #content>
              <div class="advanced-timing-title">高级设置</div>
              <div class="property-row">
                <div class="property-label">持续时间</div>
                <NumberInput
                  :min="100"
                  :max="10000"
                  :step="100"
                  :value="selectedAnimation.duration"
                  @update:value="value => updateElementAnimationDuration(activeAnimationId, value)"
                ><template #suffix>毫秒</template></NumberInput>
              </div>
              <div class="property-row">
                <div class="property-label">延迟</div>
                <NumberInput
                  :min="0"
                  :max="10000"
                  :step="100"
                  :value="selectedAnimation.delay || 0"
                  @update:value="value => updateElementAnimationDelay(activeAnimationId, value)"
                ><template #suffix>毫秒</template></NumberInput>
              </div>
              <div class="property-row">
                <div class="property-label">重复</div>
                <Select
                  :value="selectedAnimation.repeatCount || 1"
                  @update:value="value => updateElementAnimationRepeat(activeAnimationId, Number(value))"
                  :options="[
                    { label: '无', value: 1 },
                    { label: '2 次', value: 2 },
                    { label: '3 次', value: 3 },
                    { label: '5 次', value: 5 },
                    { label: '10 次', value: 10 },
                  ]"
                />
              </div>
              <div class="property-row">
                <div class="property-label" v-tooltip="'控制动画开始、途中和结束时的加速方式'">速度曲线</div>
                <Select
                  :value="selectedAnimation.easing || 'ease'"
                  @update:value="value => updateElementAnimationEasing(activeAnimationId, String(value))"
                  :options="[
                    { label: '平滑', value: 'ease' },
                    { label: '匀速', value: 'linear' },
                    { label: '平滑开始', value: 'ease-in' },
                    { label: '平滑结束', value: 'ease-out' },
                    { label: '平滑开始和结束', value: 'ease-in-out' },
                  ]"
                />
              </div>
              <div class="auto-reverse-row">
                <span v-tooltip="'到达终点后沿相反方向播放一次'">自动翻转</span>
                <Switch
                  :value="!!selectedAnimation.autoReverse"
                  @update:value="value => updateElementAnimationAutoReverse(activeAnimationId, value)"
                />
              </div>
            </template>
            <button class="advanced-settings-trigger" type="button" v-tooltip="'高级设置'">
              <i-icon-park-outline:setting-two />
            </button>
          </Popover>
        </div>
      </div>

      <div class="property-row">
        <div class="property-label">效果</div>
        <Button class="effect-button" @click="openAnimationPool(selectedAnimation.id)">
          {{ selectedAnimation.animationEffect }}
          <span v-if="selectedAnimation.directionLabel"> · {{ selectedAnimation.directionLabel }}</span>
          <i-icon-park-outline:down />
        </Button>
      </div>
      <div class="property-row" v-if="getAnimationDirectionOptions(selectedAnimation).length">
        <div class="property-label">效果属性</div>
        <Select
          :value="getAnimationDirection(selectedAnimation) || ''"
          @update:value="value => updateElementAnimationDirection(activeAnimationId, value as AnimationDirection)"
          :options="getAnimationDirectionOptions(selectedAnimation)"
        />
      </div>
      <div class="quick-settings-grid">
        <div class="quick-setting">
          <div class="quick-setting-label">开始</div>
          <Select
            :value="selectedAnimation.trigger"
            @update:value="value => updateElementAnimationTrigger(activeAnimationId, value as AnimationTrigger)"
            :options="animationStartOptions"
          />
        </div>
        <div class="quick-setting">
          <div class="quick-setting-label">速度</div>
          <Select
            :value="selectedAnimation.duration"
            defaultLabel="自定义"
            @update:value="value => updateElementAnimationDuration(activeAnimationId, Number(value))"
            :options="speedOptions"
          />
        </div>
      </div>
    </div>
    <div class="selected-animation-empty" v-else>
      选择下方动画即可编辑
    </div>

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
        <div class="sequence-item" :class="[element.type, { 'active': activeAnimationId === element.id }]">
          <div
            class="sequence-content"
            role="button"
            tabindex="0"
            @click="selectAnimation(element)"
            @keydown.enter.space.prevent="selectAnimation(element)"
          >
            <div class="index" :class="{ simultaneous: element.index === '' }">{{ element.index || '•' }}</div>
            <span :class="['effect-bar', element.type]"></span>
            <div class="text-block">
              <div class="object-name">{{ element.elementLabel }}</div>
            </div>
            <div class="handler">
              <i-icon-park-outline:play-one class="handler-btn" v-tooltip="'预览'" @click.stop="previewAnimation(element)" />
              <i-icon-park-outline:close-small class="handler-btn" v-tooltip="'删除'" @click.stop="deleteAnimation(element.id)" />
            </div>
          </div>
        </div>
      </template>
    </Draggable>
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
import type { AnimationTrigger, AnimationType, PPTAnimation, PPTElement } from '@/types/slides'
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
import { elementObjectName, groupObjectName } from '@/utils/elementObjectName'
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
  key: EditableAnimationType
  label: string
  color: string
}

type EditableAnimationType = Exclude<AnimationType, 'motion'>

interface SequenceAnimation extends PPTAnimation {
  index: number | ''
  elType: string
  elementLabel: string
  animationEffect: string
  targetLabel: string
  directionLabel: string
  triggerLabel: string
}

const animationTypes: EditableAnimationType[] = ['in', 'out', 'attention']
const slidesStore = useSlidesStore()
const mainStore = useMainStore()
const {
  activeElementList,
  activeGroupElementId,
  handleElement,
  handleElementId,
} = storeToRefs(mainStore)
const { currentSlide, formatedAnimations, currentSlideAnimations, viewportSize, viewportRatio } = storeToRefs(slidesStore)
const { addHistorySnapshot } = useHistorySnapshot()
const { selectElement } = useSelectElement()

const tabs: TabItem[] = [
  { key: 'in', label: '入场', color: '#68a490' },
  { key: 'out', label: '退场', color: '#d86344' },
  { key: 'attention', label: '强调', color: '#e8b76a' },
]
const activeTab = ref<EditableAnimationType>('in')
const animateIn = ref(false)
const animationPoolVisible = ref(false)
const activeAnimationId = ref('')
const handleAnimationId = ref('')
const advancedTimingVisible = ref(false)

const speedOptions = [
  { label: '非常快 0.25秒', value: 250 },
  { label: '快速 0.5秒', value: 500 },
  { label: '中速 1秒', value: 1000 },
  { label: '慢速 2秒', value: 2000 },
  { label: '非常慢 3秒', value: 3000 },
]

const batchTargetIds = computed(() => {
  if (activeGroupElementId.value || activeElementList.value.length <= 1) return []
  return activeElementList.value.map(element => element.id)
})
const animationTargetIds = computed(() => {
  if (batchTargetIds.value.length) return batchTargetIds.value
  return handleElementId.value ? [handleElementId.value] : []
})
const animationTargetAvailable = computed(() => animationTargetIds.value.length > 0 && (!!handleElement.value || batchTargetIds.value.length > 0))
const animationTargetKey = computed(() => animationTargetIds.value.join('|'))
const addAnimationButtonText = computed(() => batchTargetIds.value.length
  ? `批量添加动画（${batchTargetIds.value.length} 个元素）`
  : '添加动画')
const selectedTargetsContainGroup = (groupId: string) => {
  const memberIds = currentSlide.value.elements
    .filter(element => element.groupId === groupId)
    .map(element => element.id)
  return memberIds.length > 1 &&
    memberIds.length === animationTargetIds.value.length &&
    memberIds.every(id => animationTargetIds.value.includes(id))
}

watch([animationTargetKey, () => currentSlide.value.id], () => {
  animationPoolVisible.value = false
  advancedTimingVisible.value = false
  const active = currentSlideAnimations.value.find(animation => animation.id === activeAnimationId.value)
  if (active && (
    animationTargetIds.value.includes(active.elId) ||
    (active.target?.groupId && selectedTargetsContainGroup(active.target.groupId))
  )) return
  activeAnimationId.value = currentSlideAnimations.value.find(animation => animationTargetIds.value.includes(animation.elId))?.id || currentSlideAnimations.value[0]?.id || ''
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
  const canonical = canonicalEffectFromLegacy(
    animation.effect,
    animation.type,
    animation.direction,
    animation.motionPath,
  )
  const hasScopedTarget = !!(animation.target?.paragraphRange ||
    animation.target?.characterRange ||
    animation.target?.paragraphIndex !== undefined)
  return {
    ...existing,
    id: animation.id,
    target: {
      ...existing?.target,
      ...animation.target,
      elementId: animation.target?.groupId ? undefined : animation.elId,
    },
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
      class: animation.type === 'motion'
        ? 'motionPath'
        : animation.type === 'in' ? 'entrance' : animation.type === 'out' ? 'exit' : 'emphasis',
      compatibility: canonical
        ? hasScopedTarget ? 'approximate' : 'mapped'
        : existing?.effect.compatibility || 'approximate',
      direction: canonical && 'direction' in canonical ? canonical.direction : undefined,
      motionPath: animation.type === 'motion' ? animation.motionPath : undefined,
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
      animation.effect.compatibility === 'unsupported' ||
      (!animation.target.elementId && !animation.target.groupId)
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

const elementDisplayLabel = (element: PPTElement | undefined, groupId?: string) => {
  if (groupId) return groupObjectName(groupId, currentSlide.value.elements)
  if (!element) return '未知对象'
  return elementObjectName(element, currentSlide.value.elements)
}

const animationSequence = computed<SequenceAnimation[]>(() => {
  const sequence: SequenceAnimation[] = []
  let clickIndex = 0
  for (let position = 0; position < currentSlideAnimations.value.length; position++) {
    const animation = currentSlideAnimations.value[position]
    const element = currentSlide.value.elements.find(item => item.id === animation.elId)
    const groupId = animation.target?.groupId
    if (!element && !groupId) continue
    const simultaneous = animation.trigger === 'meantime' && sequence.length > 0
    if (!simultaneous) clickIndex += 1
    const isFirst = position === 0
    const triggerLabel = animation.trigger === 'click'
      ? '单击时'
      : animation.trigger === 'meantime'
        ? isFirst ? '与页面切换同时' : '与上一动画同时'
        : isFirst ? '页面切换之后' : '上一动画之后'
    sequence.push({
      ...animation,
      index: simultaneous ? '' : clickIndex,
      elType: groupId ? '组合' : ELEMENT_TYPE_ZH[element!.type],
      elementLabel: elementDisplayLabel(element, groupId),
      animationEffect: getAnimationEffectLabel(animation.effect, animation.type),
      targetLabel: animation.target?.characterRange
        ? `字符 ${animation.target.characterRange.start + 1}–${animation.target.characterRange.end + 1}`
        : animation.target?.paragraphRange
          ? `段落 ${animation.target.paragraphRange.start + 1}–${animation.target.paragraphRange.end + 1}`
          : animation.target?.paragraphIndex === undefined ? '' : `段落 ${animation.target.paragraphIndex + 1}`,
      directionLabel: getAnimationDirectionLabel(animation),
      triggerLabel,
    })
  }
  return sequence
})

const selectedAnimation = computed(() => animationSequence.value.find(animation => animation.id === activeAnimationId.value))
const selectedAnimationIndex = computed(() => animationSequence.value.findIndex(animation => animation.id === activeAnimationId.value))
const animationStartOptions = computed(() => selectedAnimationIndex.value === 0
  ? [
      { label: '单击时', value: 'click' },
      { label: '与页面切换同时', value: 'meantime' },
      { label: '页面切换之后', value: 'auto' },
    ]
  : [
      { label: '单击时', value: 'click' },
      { label: '与上一动画同时', value: 'meantime' },
      { label: '上一动画之后', value: 'auto' },
    ])

const selectAnimation = (animation: PPTAnimation) => {
  activeAnimationId.value = animation.id
  const groupId = animation.target?.groupId
  if (!groupId) {
    selectElement(animation.elId)
    return
  }
  const memberIds = currentSlide.value.elements
    .filter(element => element.groupId === groupId)
    .map(element => element.id)
  mainStore.setActiveGroupElementId('')
  mainStore.setActiveElementIdList(memberIds)
  if (memberIds.length) mainStore.setHandleElementId(memberIds[0])
}

const deleteAnimation = (id: string) => {
  const animations = currentSlideAnimations.value.filter(item => item.id !== id)
  commitAnimations(animations)
  activeAnimationId.value = animations.find(item => animationTargetIds.value.includes(item.elId))?.id || animations[0]?.id || ''
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

const animationElement = (animation: PPTAnimation) => {
  if (animation.target?.groupId) {
    return document.getElementById(`editable-group-${animation.target.groupId}`)
  }
  return document.querySelector<HTMLElement>(`#editable-element-${animation.elId} [class^=editable-element-]`)
}

const runAnimation = (animation: PPTAnimation, target = animationElement(animation)) => {
  if (!target) return undefined
  return runElementAnimation(target, animation, {
    viewportWidth: viewportSize.value,
    viewportHeight: viewportSize.value * viewportRatio.value,
  })
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
const previewPoolAnimation = (event: MouseEvent, type: EditableAnimationType, effect: string) => {
  stopPoolPreview()
  // Keep the hover hit area stationary. Animating the pool item itself can
  // move it away from the pointer, immediately firing mouseleave/mouseenter
  // and producing a rapid flash loop for fly, zoom and bounce effects.
  const poolItem = event.currentTarget as HTMLElement
  const target = poolItem.querySelector<HTMLElement>('.animation-box')
  if (!target) return
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

const updateElementAnimation = (type: EditableAnimationType, effect: string) => {
  let changed: PPTAnimation | undefined
  const animations = currentSlideAnimations.value.map(item => {
    if (item.id !== handleAnimationId.value) return item
    changed = {
      ...item,
      type,
      effect,
      motionPath: undefined,
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

const addAnimation = (type: EditableAnimationType, effect: string) => {
  if (handleAnimationId.value) {
    updateElementAnimation(type, effect)
    return
  }
  const targetIds = animationTargetIds.value
  if (!targetIds.length) return
  const newAnimations: PPTAnimation[] = targetIds.map((elId, index) => ({
    id: nanoid(10),
    elId,
    type,
    effect,
    direction: defaultDirectionForEffect(effect, type),
    duration: ANIMATION_DEFAULT_DURATION,
    trigger: targetIds.length > 1
      ? index === 0 ? 'click' : 'meantime'
      : ANIMATION_DEFAULT_TRIGGER,
  }))
  commitAnimations([...currentSlideAnimations.value, ...newAnimations])
  animationPoolVisible.value = false
  activeAnimationId.value = newAnimations[0].id
  addHistorySnapshot()
  window.setTimeout(() => newAnimations.forEach(previewAnimation), 0)
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
  if (animation && animation.type !== 'motion') activeTab.value = animation.type
  else activeTab.value = 'in'
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
$motionColor: #6f7fc6;

.element-animation-panel {
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
}
.element-animation {
  height: 32px;
  display: flex;
  align-items: center;
}
.element-animation-btn {
  width: 100%;
}
.pane-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
}
.sequence-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #555;
  font-weight: 600;
}
.sequence-count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  color: #777;
  background: #f0f0f0;
  font-size: 11px;
  font-weight: 400;
  line-height: 18px;
  text-align: center;
}
.selected-animation-editor {
  flex: none;
  margin-bottom: 7px;
  padding: 8px;
  border: 1px solid #dedede;
  border-radius: $borderRadius;
  background: #fafafa;
}
.selected-animation-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.selected-animation-name {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 600;
  @include ellipsis-oneline();
}
.selected-animation-actions {
  flex: none;
  display: flex;
  color: #777;
  font-size: 15px;
}
.advanced-settings-trigger {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 4px;
  color: #777;
  background: transparent;
  font-size: 15px;
  cursor: pointer;

  &:hover {
    color: $themeColor;
    background: rgba($color: $themeColor, $alpha: .08);
  }
}
.effect-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: $motionColor;

  &.in { background: $inColor; }
  &.out { background: $outColor; }
  &.attention { background: $attentionColor; }
}
.property-row {
  display: flex;
  align-items: center;
  gap: 6px;

  & + .property-row {
    margin-top: 7px;
  }
  > :last-child {
    flex: 1;
    min-width: 0;
  }
}
.property-label {
  flex: none;
  width: 52px;
  color: #666;
}
.effect-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  letter-spacing: 0;
}
.quick-settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 6px;
}
.quick-setting {
  min-width: 0;

  &:only-child {
    grid-column: 1 / -1;
  }
}
.quick-setting-label {
  margin: 0 0 3px 2px;
  color: #777;
  font-size: 11px;
}
.advanced-timing-title {
  margin-bottom: 9px;
  color: #555;
  font-weight: 600;
}
.auto-reverse-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 7px;
  color: #777;
}
.selected-animation-empty {
  flex: none;
  margin-bottom: 7px;
  padding: 8px 10px;
  border: 1px dashed #d7d7d7;
  border-radius: $borderRadius;
  color: #999;
  text-align: center;
  font-size: 11px;
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
  width: 100%;
  height: 100%;
  background-color: $lightGray;
  border-radius: $borderRadius;
  pointer-events: none;
}

.animation-sequence {
  flex: 1;
  min-height: 120px;
  min-width: 0;
  padding-right: 2px;

  @include overflow-overlay();
}
.sequence-item {
  border: 1px solid #dedede;
  padding: 4px 5px;
  border-radius: $borderRadius;
  margin-bottom: 3px;
  background: #fff;
  transition: border-color .16s, background-color .16s, box-shadow .16s;

  &.in.active {
    border-color: $inColor;
  }
  &.out.active {
    border-color: $outColor;
  }
  &.attention.active {
    border-color: $attentionColor;
  }
  &.motion.active {
    border-color: $motionColor;
  }
  &.active {
    background: rgba($color: $themeColor, $alpha: .035);
    box-shadow: inset 0 0 0 1px rgba($color: $themeColor, $alpha: .06);
  }

  .sequence-content {
    display: flex;
    align-items: center;
    cursor: grab;
    outline: none;

    &:active {
      cursor: grabbing;
    }
    &:focus-visible {
      outline: 2px solid rgba($color: $themeColor, $alpha: .2);
      outline-offset: 2px;
    }

    .index {
      flex: none;
      width: 20px;
      height: 20px;
      line-height: 18px;
      border: 1px solid #d4d4d4;
      border-radius: 4px;
      color: #555;
      text-align: center;
      font-size: 12px;

      &.simultaneous {
        color: #999;
        border-color: transparent;
      }
    }
    .effect-bar {
      align-self: center;
      flex: none;
      width: 3px;
      height: 20px;
      margin-left: 6px;
      border-radius: 2px;
      background: $motionColor;

      &.in { background: $inColor; }
      &.out { background: $outColor; }
      &.attention { background: $attentionColor; }
    }
    .text-block {
      flex: 1;
      min-width: 0;
      margin-left: 7px;
    }
    .object-name {
      color: #444;
      line-height: 20px;
      @include ellipsis-oneline();
    }
    .handler {
      flex: none;
      min-width: 44px;
      font-size: 15px;
      text-align: right;
      opacity: .58;
    }
    .handler-btn {
      margin-left: 6px;
      cursor: pointer;
    }
    &:hover .handler,
    &:focus-visible .handler {
      opacity: 1;
    }
  }
}
</style>
