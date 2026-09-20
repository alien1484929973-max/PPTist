<template>
  <div class="remark">
    <div 
      class="resize-handler"
      @mousedown="$event => resize($event)"
    ></div>
    <Editor
      v-if="expanded"
      :key="currentSlide.id"
      :value="remark"
      ref="editorRef"
      @update="value => handleInput(value)"
    />
    <button class="collapsed" v-else @click="expand">演讲者备注{{ remark ? '（已填写，点击编辑）' : '（点击添加）' }}</button>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useSlidesStore } from '@/store'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'

import Editor from './Editor.vue'

const props = defineProps<{
  height: number
}>()

const emit = defineEmits<{
  (event: 'update:height', payload: number): void
}>()

const slidesStore = useSlidesStore()
const { currentSlide } = storeToRefs(slidesStore)
const { addHistorySnapshot } = useHistorySnapshot()

const expanded = computed(() => props.height > 48)
const editorRef = useTemplateRef<InstanceType<typeof Editor>>('editorRef')
const expand = async () => {
  emit('update:height', 160)
  await nextTick()
  editorRef.value?.focus()
}

const remark = computed(() => currentSlide.value?.remark || '')

const handleInput = (content: string) => {
  if (content === remark.value) return
  slidesStore.updateSlide({ remark: content })
  addHistorySnapshot()
}

const resize = (e: MouseEvent) => {
  let isMouseDown = true
  const startPageY = e.pageY
  const originHeight = props.height

  document.onmousemove = e => {
    if (!isMouseDown) return

    const currentPageY = e.pageY

    const moveY = currentPageY - startPageY
    let newHeight = -moveY + originHeight

    if (newHeight < 40) newHeight = 40
    if (newHeight > 360) newHeight = 360

    emit('update:height', newHeight)
  }

  document.onmouseup = () => {
    isMouseDown = false
    document.onmousemove = null
    document.onmouseup = null
  }
}
</script>

<style lang="scss" scoped>
.remark {
  position: relative;
  border-top: 1px solid $borderColor;
}
.resize-handler {
  height: 7px;
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  cursor: n-resize;
  z-index: 2;
}
.collapsed {
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  height: 100%;
  padding: 0 10px;
  display: flex;
  align-items: center;
  color: #888;
  font-size: 12px;
  cursor: pointer;
}
</style>
