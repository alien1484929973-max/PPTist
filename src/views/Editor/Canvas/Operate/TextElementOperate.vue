<template>
  <div class="text-element-operate">
    <BorderLine 
      class="operate-border-line"
      v-for="line in borderLines" 
      :key="line.type" 
      :type="line.type" 
      :style="line.style"
    />
    <template v-if="handlerVisible">
      <button
        class="text-move-handler"
        type="button"
        aria-label="拖动文本框"
        title="拖动移动文本框；Ctrl 拖动复制，Shift 拖动约束方向"
        :style="{ top: scaleHeight / 2 - 14 + 'px' }"
        @mousedown.left.stop.prevent="startMove"
        @touchstart.stop.prevent="startMove"
        @click.stop
        @dblclick.stop
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4" />
        </svg>
      </button>
      <ResizeHandler
        class="operate-resize-handler" 
        v-for="point in resizeHandlers"
        :key="point.direction"
        :type="point.direction"
        :rotate="elementInfo.rotate"
        :style="point.style"
        @mousedown.stop="($event: MouseEvent) => scaleElement($event, elementInfo, point.direction)"
      />
      <RotateHandler
        class="operate-rotate-handler" 
        :style="{ left: scaleWidth / 2 + 'px' }"
        @mousedown.stop="($event: MouseEvent) => rotateElement($event, elementInfo)"
      />
    </template>
  </div>
</template>

<script lang="ts">
export default {
  inheritAttrs: false,
}
</script>

<script lang="ts" setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useMainStore } from '@/store'
import type { PPTTextElement } from '@/types/slides'
import type { OperateResizeHandlers } from '@/types/edit'
import useCommonOperate from '../hooks/useCommonOperate'

import RotateHandler from './RotateHandler.vue'
import ResizeHandler from './ResizeHandler.vue'
import BorderLine from './BorderLine.vue'

const props = defineProps<{
  elementInfo: PPTTextElement
  handlerVisible: boolean
  rotateElement: (e: MouseEvent, element: PPTTextElement) => void
  scaleElement: (e: MouseEvent, element: PPTTextElement, command: OperateResizeHandlers) => void
  moveElement: (e: MouseEvent | TouchEvent, element: PPTTextElement) => void
}>()

const { canvasScale } = storeToRefs(useMainStore())

const startMove = (e: MouseEvent | TouchEvent) => {
  // 使用已有拖动逻辑保留吸附、组合、复制及历史快照，手柄不抢占文字点击区域。
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  window.getSelection()?.removeAllRanges()
  props.moveElement(e, props.elementInfo)
}

const scaleWidth = computed(() => props.elementInfo.width * canvasScale.value)
const scaleHeight = computed(() => props.elementInfo.height * canvasScale.value)

const { resizeHandlers: normalResizeHandlers, textElementResizeHandlers, verticalTextElementResizeHandlers, borderLines } = useCommonOperate(scaleWidth, scaleHeight)
const resizeHandlers = computed(() => {
  if (props.elementInfo.fixedHeight) return normalResizeHandlers.value
  return props.elementInfo.vertical ? verticalTextElementResizeHandlers.value : textElementResizeHandlers.value
})
</script>

<style lang="scss" scoped>
.text-move-handler {
  position: absolute;
  left: -38px;
  width: 28px;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $themeColor;
  background: #fff;
  border: 1px solid $themeColor;
  border-radius: 5px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, .12);
  cursor: grab;
  touch-action: none;

  &:hover {
    background: #f5f5f5;
  }
  &:active {
    cursor: grabbing;
  }
}
</style>
