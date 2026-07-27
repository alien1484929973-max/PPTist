<template>
  <MoveablePanel 
    class="select-panel" 
    :width="300"
    :height="480"
    :title="panelTitle"
    :left="-350"
    :top="90"
    :content-style="{ overflow: 'hidden' }"
    @close="close()"
  >
    <div class="select-panel-body">
    <div class="handler" v-if="elements.length">
      <div class="btns">
        <Button size="small" style="margin-right: 5px;" @click="showAllElements()">全部显示</Button>
        <Button size="small" @click="hideAllElements()">全部隐藏</Button>
      </div>
      <div class="icon-btns" v-if="handleElement">
        <span class="icon-btn" @click="orderElement(handleElement!, ElementOrderCommands.UP)"><i-icon-park-outline:down /></span>
        <span class="icon-btn" @click="orderElement(handleElement!, ElementOrderCommands.DOWN)"><i-icon-park-outline:up /></span>
      </div>
    </div>
    <div class="morph-pick-banner" v-if="pendingAssociation">
      <div>
        <div class="morph-pick-title"><i-icon-park-outline:link-one /> 选择关联对象</div>
        <div class="morph-pick-description">点击本页对象，关联到下一页的 {{ pendingTargetName }}</div>
      </div>
      <Button size="small" @click="cancelMorphSourcePicking()">取消</Button>
    </div>
    <div class="morph-toolbar" v-if="previousSlide && morphEnabled && !pendingAssociation">
      <div>
        <div class="morph-toolbar-title"><i-icon-park-outline:link-one /> 平滑关联</div>
        <div class="morph-toolbar-description">单击图标建立或关闭，双击更换关联</div>
      </div>
      <span class="morph-count">{{ morphResult.matches.length }} 组</span>
    </div>
    <div class="element-list" v-if="elements.length">
      <template v-for="item in elements" :key="item.id">
        <div class="group-els" v-if="item.type === 'group'">
          <div class="group-title">组合</div>
          <div 
            class="item" 
            :class="{
              'active': activeElementIdList.includes(groupItem.id),
              'group-active': activeGroupElementId.includes(groupItem.id),
              'lock': groupItem.lock,
              'morph-pickable': isPickingMorphSource,
              'morph-occupied': isPendingSourceOccupied(groupItem.id),
            }"
            v-for="groupItem in item.elements" 
            :key="groupItem.id" 
            @click="handlePanelElementClick(groupItem, item)"
            @dblclick="!isPickingMorphSource && enterEdit(groupItem.id)"
          >
            <input 
              :id="`select-panel-input-${groupItem.id}`" 
              :value="elementObjectName(groupItem, currentSlide.elements)"
              class="input" 
              type="text" 
              v-if="editingElId === groupItem.id" 
              @blur="$event => saveElementName($event, groupItem.id)"
              @keydown.enter="$event => saveElementName($event, groupItem.id)"
            >
            <div v-else class="name">{{ elementObjectName(groupItem, currentSlide.elements) }}</div>
            <div class="icons">
              <span
                class="icon morph-link-icon picking"
                :class="{ occupied: isPendingSourceOccupied(groupItem.id) }"
                v-if="isPickingMorphSource"
                v-tooltip="pendingSourceTooltip(groupItem)"
                @click.stop="chooseMorphSource(groupItem)"
              ><i-icon-park-outline:link-one /></span>
              <span
                class="icon morph-link-icon"
                :class="morphRelation(groupItem.id).state"
                v-else-if="morphEnabled && previousSlide"
                v-tooltip="morphIconTooltip(groupItem.id)"
                @click.stop="handleMorphIconClick(groupItem.id)"
                @dblclick.stop="handleMorphIconDoubleClick(groupItem.id)"
              >
                <i-icon-park-outline:link-one v-if="morphRelationLinked(groupItem.id)" />
                <i-icon-park-outline:unlink v-else />
              </span>
              <i-icon-park-outline:lock class="icon" style="font-size: 14px;" @click="unlockElement(groupItem)" v-if="groupItem.lock" />
              <div class="icon" style="width: 14px;" v-else />
              <i-icon-park-outline:preview-close class="icon" style="font-size: 17px;" @click.stop="toggleHideElement(groupItem.id)" v-if="hiddenElementIdList.includes(groupItem.id)" />
              <i-icon-park-outline:preview-open class="icon" style="font-size: 17px;" @click.stop="toggleHideElement(groupItem.id)" v-else />
            </div>
          </div>
        </div>
        <div 
          class="item" 
          :class="{
            'active': activeElementIdList.includes(item.id),
            'lock': item.lock,
            'morph-pickable': isPickingMorphSource,
            'morph-occupied': isPendingSourceOccupied(item.id),
          }"
          v-else 
          @click="handlePanelElementClick(item)"
          @dblclick="!isPickingMorphSource && enterEdit(item.id)"
        >
          <input 
            :id="`select-panel-input-${item.id}`" 
            :value="elementObjectName(item, currentSlide.elements)"
            class="input" 
            type="text" 
            v-if="editingElId === item.id" 
            @blur="$event => saveElementName($event, item.id)"
            @keydown.enter="$event => saveElementName($event, item.id)"
          >
          <div v-else class="name">{{ elementObjectName(item, currentSlide.elements) }}</div>
          <div class="icons">
            <span
              class="icon morph-link-icon picking"
              :class="{ occupied: isPendingSourceOccupied(item.id) }"
              v-if="isPickingMorphSource"
              v-tooltip="pendingSourceTooltip(item)"
              @click.stop="chooseMorphSource(item)"
            ><i-icon-park-outline:link-one /></span>
            <span
              class="icon morph-link-icon"
              :class="morphRelation(item.id).state"
              v-else-if="morphEnabled && previousSlide"
              v-tooltip="morphIconTooltip(item.id)"
              @click.stop="handleMorphIconClick(item.id)"
              @dblclick.stop="handleMorphIconDoubleClick(item.id)"
            >
              <i-icon-park-outline:link-one v-if="morphRelationLinked(item.id)" />
              <i-icon-park-outline:unlink v-else />
            </span>
            <i-icon-park-outline:lock class="icon" style="font-size: 14px;" @click="unlockElement(item)" v-if="item.lock" />
            <div class="icon" style="width: 14px;" v-else />
            <i-icon-park-outline:preview-close class="icon" style="font-size: 17px;" @click.stop="toggleHideElement(item.id)" v-if="hiddenElementIdList.includes(item.id)" />
            <i-icon-park-outline:preview-open class="icon" style="font-size: 17px;" @click.stop="toggleHideElement(item.id)" v-else />
          </div>
        </div>
      </template>
    </div>
    <div class="empty" v-if="!elements.length">本页无内容</div>
    </div>
  </MoveablePanel>
</template>

<script lang="ts" setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useSlidesStore, useMainStore } from '@/store'
import type { PPTElement, Slide } from '@/types/slides'
import { createPresentationMorphCandidates, matchMorphElements } from '@pptist/presentation-core'
import useOrderElement from '@/hooks/useOrderElement'
import useHideElement from '@/hooks/useHideElement'
import useSelectElement from '@/hooks/useSelectElement'
import useLockElement from '@/hooks/useLockElement'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { elementObjectName } from '@/utils/elementObjectName'
import { ElementOrderCommands } from '@/types/edit'

import MoveablePanel from '@/components/MoveablePanel.vue'
import Button from '@/components/Button.vue'

const slidesStore = useSlidesStore()
const mainStore = useMainStore()
const { slides, currentSlide, slideIndex } = storeToRefs(slidesStore)
const { handleElement, handleElementId, activeElementIdList, activeGroupElementId, hiddenElementIdList } = storeToRefs(mainStore)

const { orderElement } = useOrderElement()
const { selectElement } = useSelectElement()
const { toggleHideElement, showAllElements, hideAllElements } = useHideElement()
const { unlockElement } = useLockElement()
const { addHistorySnapshot } = useHistorySnapshot()

const previousSlide = computed(() => slideIndex.value > 0 ? slides.value[slideIndex.value - 1] : undefined)
const morphEnabled = computed(() => currentSlide.value.transition?.type === 'morph')
const morphConfig = computed(() => currentSlide.value.transition?.type === 'morph'
  ? currentSlide.value.transition.morph || { mode: 'byObject' as const }
  : { mode: 'byObject' as const })
const morphResult = computed(() => matchMorphElements(
  createPresentationMorphCandidates(previousSlide.value?.elements || []),
  createPresentationMorphCandidates(currentSlide.value.elements),
  morphConfig.value,
))
const morphMatchesByTarget = computed(() => new Map(morphResult.value.matches.map(match => [match.to.id, match])))

interface PendingMorphAssociation {
  targetSlideId: string
  targetElementId: string
  sourceSlideId: string
}
const pendingAssociation = ref<PendingMorphAssociation>()
const pendingTargetSlide = computed(() => pendingAssociation.value
  ? slides.value.find(slide => slide.id === pendingAssociation.value!.targetSlideId)
  : undefined)
const pendingTargetElement = computed(() => pendingTargetSlide.value?.elements.find(
  element => element.id === pendingAssociation.value?.targetElementId,
))
const pendingTargetName = computed(() => pendingTargetElement.value && pendingTargetSlide.value
  ? elementObjectName(pendingTargetElement.value, pendingTargetSlide.value.elements)
  : '目标对象')
const isPickingMorphSource = computed(() => !!pendingAssociation.value && currentSlide.value.id === pendingAssociation.value.sourceSlideId)
const panelTitle = computed(() => isPickingMorphSource.value
  ? `选择关联对象（${currentSlide.value.elements.length}）`
  : `选择窗格（${activeElementIdList.value.length}/${currentSlide.value.elements.length}）`)
const pendingSourceUsage = computed(() => new Map(
  (pendingTargetSlide.value?.transition?.type === 'morph'
    ? pendingTargetSlide.value.transition.morph?.links || []
    : []).map(link => [link.fromElementId, link.toElementId]),
))

const morphSourceValue = (targetId: string) => {
  if (morphConfig.value.excludedToElementIds?.includes(targetId)) return '__none'
  return morphConfig.value.links?.find(link => link.toElementId === targetId)?.fromElementId || '__auto'
}
const morphRelation = (targetId: string) => {
  const selected = morphSourceValue(targetId)
  if (selected === '__none') {
    return {
      state: 'none',
      label: '不关联',
      tooltip: '该对象不会与上一页对象平滑关联',
    }
  }
  const match = morphMatchesByTarget.value.get(targetId)
  const source = match?.from.element
  if (!source || !previousSlide.value) {
    return {
      state: 'unmatched',
      label: '未关联',
      tooltip: '未找到可信的上一页对象，播放时将淡入',
    }
  }
  const sourceName = elementObjectName(source, previousSlide.value.elements)
  return {
    state: match.confidence === 'explicit' ? 'manual' : 'automatic',
    label: `${match.confidence === 'explicit' ? '←' : '自动'} ${sourceName}`,
    tooltip: `上一页：${sourceName}`,
  }
}
const morphRelationLinked = (targetId: string) => morphSourceValue(targetId) !== '__none' && morphMatchesByTarget.value.has(targetId)
const morphIconTooltip = (targetId: string) => morphRelationLinked(targetId)
  ? `已关联 ${morphRelation(targetId).label}；单击关闭，双击更换`
  : '未关联；单击选择上一页对象建立关联'

const updateMorphAssociationOnSlide = (slide: Slide, targetId: string, selected: string) => {
  if (slide.transition?.type !== 'morph') return
  const currentMorph = slide.transition.morph || { mode: 'byObject' as const }
  const links = (currentMorph.links || []).filter(link => (
    link.toElementId !== targetId && (selected.startsWith('__') || link.fromElementId !== selected)
  ))
  const excludedToElementIds = (currentMorph.excludedToElementIds || []).filter(id => id !== targetId)
  if (selected === '__none') excludedToElementIds.push(targetId)
  else if (selected !== '__auto') links.push({ fromElementId: selected, toElementId: targetId })
  slidesStore.updateSlide({
    turningMode: 'morph',
    transition: {
      ...slide.transition,
      type: 'morph',
      morph: {
        ...currentMorph,
        links: links.length ? links : undefined,
        excludedToElementIds: excludedToElementIds.length ? excludedToElementIds : undefined,
      },
      source: 'editor',
    },
  }, slide.id)
  addHistorySnapshot()
}
const updateMorphAssociation = (targetId: string, selected: string) => {
  updateMorphAssociationOnSlide(currentSlide.value, targetId, selected)
}

const beginMorphSourcePicking = (targetId: string) => {
  if (!morphEnabled.value || !previousSlide.value) return
  pendingAssociation.value = {
    targetSlideId: currentSlide.value.id,
    targetElementId: targetId,
    sourceSlideId: previousSlide.value.id,
  }
  mainStore.setActiveElementIdList([])
  slidesStore.updateSlideIndex(slideIndex.value - 1)
}
const returnToPendingTarget = (pending: PendingMorphAssociation) => {
  const targetIndex = slides.value.findIndex(slide => slide.id === pending.targetSlideId)
  if (targetIndex < 0) return
  slidesStore.updateSlideIndex(targetIndex)
  nextTick(() => mainStore.setActiveElementIdList([pending.targetElementId]))
}
const cancelMorphSourcePicking = () => {
  const pending = pendingAssociation.value
  pendingAssociation.value = undefined
  if (pending) returnToPendingTarget(pending)
}
const isPendingSourceOccupied = (sourceId: string) => {
  const targetId = pendingAssociation.value?.targetElementId
  const usedBy = pendingSourceUsage.value.get(sourceId)
  return !!usedBy && usedBy !== targetId
}
const pendingSourceTooltip = (source: PPTElement) => {
  const usedBy = pendingSourceUsage.value.get(source.id)
  if (usedBy && usedBy !== pendingAssociation.value?.targetElementId) {
    const target = pendingTargetSlide.value?.elements.find(element => element.id === usedBy)
    return target && pendingTargetSlide.value
      ? `已关联到 ${elementObjectName(target, pendingTargetSlide.value.elements)}`
      : '已被其他对象关联'
  }
  return `单击关联到下一页的 ${pendingTargetName.value}`
}
const chooseMorphSource = (source: PPTElement) => {
  const pending = pendingAssociation.value
  const targetSlide = pendingTargetSlide.value
  if (!pending || !targetSlide || isPendingSourceOccupied(source.id)) return
  updateMorphAssociationOnSlide(targetSlide, pending.targetElementId, source.id)
  pendingAssociation.value = undefined
  returnToPendingTarget(pending)
}

// The source can be chosen from the list or directly on the canvas. Canvas
// clicks update the global selection, so complete the pending association from
// that signal and return to the target slide immediately.
watch(activeElementIdList, selectedIds => {
  if (!isPickingMorphSource.value || selectedIds.length !== 1) return
  const source = currentSlide.value.elements.find(element => element.id === selectedIds[0])
  if (source) chooseMorphSource(source)
}, { flush: 'post' })

let morphClickTimer = 0
const clearMorphClickTimer = () => {
  if (!morphClickTimer) return
  window.clearTimeout(morphClickTimer)
  morphClickTimer = 0
}
const handleMorphIconClick = (targetId: string) => {
  clearMorphClickTimer()
  morphClickTimer = window.setTimeout(() => {
    morphClickTimer = 0
    if (morphRelationLinked(targetId)) updateMorphAssociation(targetId, '__none')
    else beginMorphSourcePicking(targetId)
  }, 260)
}
const handleMorphIconDoubleClick = (targetId: string) => {
  clearMorphClickTimer()
  beginMorphSourcePicking(targetId)
}

interface GroupElements {
  type: 'group'
  id: string
  elements: PPTElement[]
}
type ElementItem = PPTElement | GroupElements

const handlePanelElementClick = (element: PPTElement, group?: GroupElements) => {
  if (isPickingMorphSource.value) {
    chooseMorphSource(element)
    return
  }
  if (group) selectGroupEl(group, element.id)
  else selectElement(element.id)
}

const elements = computed<ElementItem[]>(() => {
  const _elements: ElementItem[] = []

  for (const el of currentSlide.value.elements) {
    if (el.groupId) {
      const lastItem = _elements[_elements.length - 1]

      if (lastItem && lastItem.type === 'group' && lastItem.id && lastItem.id === el.groupId) {
        lastItem.elements.push(el)
      }
      else _elements.push({ type: 'group', id: el.groupId, elements: [el] })
    }
    else _elements.push(el)
  }

  return _elements
})

const selectGroupEl = (item: GroupElements, id: string) => {
  if (handleElementId.value === id) return
  if (hiddenElementIdList.value.includes(id)) return

  const idList = item.elements.filter(item => !item.lock).map(el => el.id)

  if (idList.length) {
    mainStore.setActiveElementIdList(idList)
    mainStore.setHandleElementId(id)
    nextTick(() => mainStore.setActiveGroupElementId(id))
  }
}

const editingElId = ref('')

const saveElementName = (e: FocusEvent | KeyboardEvent, id: string) => {
  const name = (e.target as HTMLInputElement).value
  slidesStore.updateElement({ id, props: { name } })
  editingElId.value = ''
}

const enterEdit = (id: string) => {
  editingElId.value = id
  nextTick(() => {
    const inputRef = document.querySelector(`#select-panel-input-${id}`) as HTMLInputElement
    inputRef.focus()
  })
}

const close = () => {
  clearMorphClickTimer()
  if (pendingAssociation.value) cancelMorphSourcePicking()
  mainStore.setSelectPanelState(false)
}

onUnmounted(clearMorphClickTimer)
</script>

<style lang="scss" scoped>
.select-panel {
  height: 100%;
  font-size: 12px;
  user-select: none;
}
.select-panel-body {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.handler {
  flex: none;
  height: 24px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;

  .icon-btns {
    height: 100%;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
  .icon-btn {
    width: 16px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    &:hover {
      color: $themeColor;
    }
  }
}
.empty {
  flex: 1;
  width: 100%;
  height: 100%;
  color: #999;
  font-style: italic;
  display: flex;
  justify-content: center;
  align-items: center;
}
.element-list {
  min-height: 0;
  flex: 1;
  padding-right: 10px;
  margin-right: -10px;
  overflow: auto;
}
.item {
  padding: 5px;
  font-size: 12px;
  border-radius: $borderRadius;
  display: flex;
  align-items: center;
  cursor: pointer;

  &.active {
    background-color: rgba($color: $themeColor, $alpha: .1);
  }
  &.group-active {
    background-color: rgba($color: $themeColor, $alpha: .2);
  }
  &.lock {
    cursor: default;
  }
  &.morph-pickable {
    cursor: crosshair;
  }
  &.morph-occupied {
    color: #aaa;
    cursor: not-allowed;
    opacity: .58;
  }
  &:not(.lock):hover {
    background-color: rgba($color: $themeColor, $alpha: .25);
    transition: background-color $transitionDelay;
  }

  .name {
    height: 18px;
    line-height: 18px;
    flex: 1;
    @include ellipsis-oneline();
  }
  .icons {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-left: 10px;

    .icon {
      min-width: 14px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 6px;
      cursor: pointer;

      &:hover {
        color: $themeColor;
      }
    }
  }
}
.morph-pick-banner {
  min-height: 42px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
  padding: 6px 8px;
  border: 1px solid rgba($color: $themeColor, $alpha: .28);
  border-radius: $borderRadius;
  color: #444;
  background: rgba($color: $themeColor, $alpha: .07);
}
.morph-pick-title {
  display: flex;
  align-items: center;
  gap: 4px;
  color: $themeColor;
  font-weight: 600;
}
.morph-pick-description {
  max-width: 215px;
  margin-top: 2px;
  color: #777;
  font-size: 9px;
  @include ellipsis-oneline();
}
.morph-toolbar {
  flex: none;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  padding: 5px 7px;
  border-radius: $borderRadius;
  color: #555;
  background: #f5f5f5;
}
.morph-toolbar-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}
.morph-toolbar-description {
  margin-top: 1px;
  color: #999;
  font-size: 10px;
}
.morph-count {
  flex: none;
  padding: 2px 6px;
  border-radius: 8px;
  color: $themeColor;
  background: rgba($color: $themeColor, $alpha: .1);
  font-size: 10px;
}
.morph-link-icon {
  color: #aaa;

  &.manual {
    color: #2e8066;
  }
  &.automatic {
    color: #4b82ad;
  }
  &.picking {
    color: $themeColor;
  }
  &.occupied {
    color: #bbb;
    cursor: not-allowed !important;
  }
}
.group-els {
  padding: 5px 0;

  .group-title {
    margin-bottom: 5px;
    padding: 0 5px;
  }
  .item {
    margin-left: 15px;
  }
}
.input {
  width: 100%;
  height: 16px;
  border: 0;
  outline: 0;
  padding-left: 0;
  padding-right: 0;
  flex: 1;
  font-size: 12px;
  background-color: transparent;
}
</style>
