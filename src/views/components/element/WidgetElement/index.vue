<template>
  <div
    class="editable-element-widget"
    :class="{ lock: elementInfo.lock }"
    :style="{
      top: elementInfo.top + 'px',
      left: elementInfo.left + 'px',
      width: elementInfo.width + 'px',
      height: elementInfo.height + 'px',
    }"
  >
    <div class="rotate-wrapper" :style="{ transform: `rotate(${elementInfo.rotate}deg)` }">
      <div
        class="element-content"
        v-contextmenu="contextmenus"
        @mousedown="$event => handleSelectElement($event)"
        @touchstart="$event => handleSelectElement($event)"
      >
        <BaseWidgetElement :elementInfo="normalizedElement" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import type { PPTWidgetElement } from '@/types/slides'
import type { ContextmenuItem } from '@/components/Contextmenu/types'
import BaseWidgetElement from './BaseWidgetElement.vue'

const props = defineProps<{
  elementInfo: PPTWidgetElement
  selectElement: (e: MouseEvent | TouchEvent, element: PPTWidgetElement, canMove?: boolean) => void
  contextmenus: () => ContextmenuItem[] | null
}>()

const normalizedElement = computed(() => ({ ...props.elementInfo, left: 0, top: 0 }))
const handleSelectElement = (event: MouseEvent | TouchEvent) => {
  if (props.elementInfo.lock) return
  event.stopPropagation()
  props.selectElement(event, props.elementInfo)
}
</script>

<style lang="scss" scoped>
.editable-element-widget { position: absolute; }
.rotate-wrapper,.element-content { width: 100%; height: 100%; }
.element-content { position: relative; cursor: move; }
.lock .element-content { cursor: default; }
</style>
