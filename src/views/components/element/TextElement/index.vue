<template>
  <div 
    class="editable-element-text" 
    :class="{ 'lock': elementInfo.lock, 'move-ready': moveReady }"
    :style="{
      top: elementInfo.top + 'px',
      left: elementInfo.left + 'px',
      width: elementInfo.width + 'px',
      height: elementInfo.height + 'px',
    }"
  >
    <div
      class="rotate-wrapper"
      :style="{ transform: `rotate(${elementInfo.rotate}deg)` }"
    >
      <div 
        class="element-content"
        ref="elementRef"
        :style="{
          width: elementInfo.vertical && !elementInfo.fixedHeight ? 'auto' : elementInfo.width + 'px',
          height: !elementInfo.vertical && !elementInfo.fixedHeight ? 'auto' : elementInfo.height + 'px',
          backgroundColor: elementInfo.fill,
          opacity: elementInfo.opacity,
          textShadow: shadowStyle,
          lineHeight: elementInfo.lineHeight,
          letterSpacing: (elementInfo.wordSpace || 0) + 'px',
          color: elementInfo.defaultColor,
          fontFamily: elementInfo.defaultFontName,
          writingMode: elementInfo.vertical ? 'vertical-rl' : 'horizontal-tb',
          padding: `${inset[0]}px ${inset[1]}px ${inset[2]}px ${inset[3]}px`,
          display: elementInfo.fixedHeight ? 'flex' : undefined,
          flexDirection: elementInfo.fixedHeight ? 'column' : undefined,
          justifyContent: fixedContentJustify,
          '--paragraphSpace': `${elementInfo.paragraphSpace === undefined ? 5 : elementInfo.paragraphSpace}px`,
        }"
        v-contextmenu="contextmenus"
        @mousedown="$event => handleSelectElement($event)"
        @touchstart="$event => handleSelectElement($event)"
      >
        <ElementOutline
          :width="elementInfo.width"
          :height="elementInfo.height"
          :outline="elementInfo.outline"
        />
        <ProsemirrorEditor
          class="text"
          :elementId="elementInfo.id"
          :defaultColor="elementInfo.defaultColor"
          :defaultFontName="elementInfo.defaultFontName"
          :editable="!elementInfo.lock"
          :value="elementInfo.content"
          @update="({ value, ignore }) => updateContent(value, ignore)"
          @mousedown="handleTextMousedown"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch, useTemplateRef, type CSSProperties } from 'vue'
import { storeToRefs } from 'pinia'
import { debounce } from 'lodash'
import { useMainStore, useSlidesStore } from '@/store'
import type { PPTTextElement } from '@/types/slides'
import type { ContextmenuItem } from '@/components/Contextmenu/types'
import useElementShadow from '@/views/components/element/hooks/useElementShadow'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'

import ElementOutline from '@/views/components/element/ElementOutline.vue'
import ProsemirrorEditor from '@/views/components/element/ProsemirrorEditor.vue'

const props = defineProps<{
  elementInfo: PPTTextElement
  selectElement: (e: MouseEvent | TouchEvent, element: PPTTextElement, canMove?: boolean) => void
  contextmenus: () => ContextmenuItem[] | null
}>()

const mainStore = useMainStore()
const slidesStore = useSlidesStore()
const { handleElementId, isScaling } = storeToRefs(mainStore)

const { addHistorySnapshot } = useHistorySnapshot()

const elementRef = useTemplateRef<HTMLElement>('elementRef')

const shadow = computed(() => props.elementInfo.shadow)
const { shadowStyle } = useElementShadow(shadow)
const inset = computed(() => props.elementInfo.inset || [10, 10, 10, 10])
const fixedContentJustify = computed<CSSProperties['justifyContent']>(() => {
  if (!props.elementInfo.fixedHeight) return undefined

  const vAlignMap: Record<NonNullable<PPTTextElement['vAlign']>, CSSProperties['justifyContent']> = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
  }
  return vAlignMap[props.elementInfo.vAlign || 'top']
})

const handleSelectElement = (e: MouseEvent | TouchEvent, canMove = true) => {
  if (props.elementInfo.lock) return
  e.stopPropagation()

  props.selectElement(e, props.elementInfo, canMove)
}

const moveReady = ref(false)
let holdTimer: ReturnType<typeof setTimeout> | undefined
const cancelHold = () => {
  clearTimeout(holdTimer)
  moveReady.value = false
  document.removeEventListener('mousemove', cancelOnMove)
  document.removeEventListener('mouseup', cancelHold)
  window.removeEventListener('blur', cancelHold)
}
let holdX = 0
let holdY = 0
const cancelOnMove = (e: MouseEvent) => {
  if (Math.hypot(e.clientX - holdX, e.clientY - holdY) > 5) cancelHold()
}
const handleTextMousedown = (e: MouseEvent) => {
  cancelHold()
  if (props.elementInfo.lock) return
  if (e.ctrlKey || e.metaKey || e.shiftKey) {
    handleSelectElement(e)
    return
  }
  handleSelectElement(e, false)
  if (e.button !== 0 || e.detail > 1) return
  holdX = e.clientX
  holdY = e.clientY
  document.addEventListener('mousemove', cancelOnMove)
  document.addEventListener('mouseup', cancelHold)
  window.addEventListener('blur', cancelHold)
  // 先保留原生光标/拖选；只有静止长按才将手势交给画布拖动。
  holdTimer = setTimeout(() => {
    document.removeEventListener('mousemove', cancelOnMove)
    window.getSelection()?.removeAllRanges()
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    moveReady.value = true
    props.selectElement(e, props.elementInfo, true)
  }, 450)
}
onUnmounted(cancelHold)

// 监听文本元素的尺寸变化，当高度变化时，更新高度到vuex
// 如果高度变化时正处在缩放操作中，则等待缩放操作结束后再更新
const realHeightCache = ref(-1)
const realWidthCache = ref(-1)

watch(isScaling, () => {
  if (handleElementId.value !== props.elementInfo.id) return

  if (!isScaling.value) {
    if (!props.elementInfo.fixedHeight && !props.elementInfo.vertical && realHeightCache.value !== -1) {
      slidesStore.updateElement({
        id: props.elementInfo.id,
        props: { height: realHeightCache.value },
      })
      realHeightCache.value = -1
    }
    if (!props.elementInfo.fixedHeight && props.elementInfo.vertical && realWidthCache.value !== -1) {
      slidesStore.updateElement({
        id: props.elementInfo.id,
        props: { width: realWidthCache.value },
      })
      realWidthCache.value = -1
    }
  }
})

watch(() => props.elementInfo.inset, () => {
  nextTick(() => {
    if (!elementRef.value) return

    if (!props.elementInfo.fixedHeight && !props.elementInfo.vertical && props.elementInfo.height !== elementRef.value.offsetHeight) {
      slidesStore.updateElement({
        id: props.elementInfo.id,
        props: { height: elementRef.value.offsetHeight },
      })
    }
    if (!props.elementInfo.fixedHeight && props.elementInfo.vertical && props.elementInfo.width !== elementRef.value.offsetWidth) {
      slidesStore.updateElement({
        id: props.elementInfo.id,
        props: { width: elementRef.value.offsetWidth },
      })
    }
  })
})

const updateTextElementHeight = (entries: ResizeObserverEntry[]) => {
  const contentRect = entries[0].contentRect
  if (!elementRef.value) return

  const realHeight = contentRect.height + inset.value[0] + inset.value[2]
  const realWidth = contentRect.width + inset.value[1] + inset.value[3]

  if (!props.elementInfo.fixedHeight && !props.elementInfo.vertical && props.elementInfo.height !== realHeight) {
    if (!isScaling.value) {
      slidesStore.updateElement({
        id: props.elementInfo.id,
        props: { height: realHeight },
      })
    }
    else realHeightCache.value = realHeight
  }
  if (!props.elementInfo.fixedHeight && props.elementInfo.vertical && props.elementInfo.width !== realWidth) {
    if (!isScaling.value) {
      slidesStore.updateElement({
        id: props.elementInfo.id,
        props: { width: realWidth },
      })
    }
    else realWidthCache.value = realWidth
  }
}
const resizeObserver = new ResizeObserver(updateTextElementHeight)

onMounted(() => {
  if (elementRef.value) resizeObserver.observe(elementRef.value)
})
onUnmounted(() => {
  if (elementRef.value) resizeObserver.unobserve(elementRef.value)
})

const updateContent = (content: string, ignore = false) => {
  slidesStore.updateElement({
    id: props.elementInfo.id,
    props: { content },
  })
  
  if (!ignore) addHistorySnapshot()
}

const checkEmptyText = debounce(function() {
  const pureText = props.elementInfo.content.replace(/<[^>]+>/g, '')
  if (!pureText) slidesStore.deleteElement(props.elementInfo.id)
}, 300, { trailing: true })

const isHandleElement = computed(() => handleElementId.value === props.elementInfo.id)
watch(isHandleElement, () => {
  if (!isHandleElement.value) checkEmptyText()
})
</script>

<style lang="scss" scoped>
.editable-element-text {
  position: absolute;

  &.lock .element-content {
    cursor: default;
  }
}
.rotate-wrapper {
  width: 100%;
  height: 100%;
}
.element-content {
  position: relative;
  line-height: 1.5;
  word-break: break-word;
  font-family: $textElementFont;
  cursor: move;

  .text {
    position: relative;
  }

  ::v-deep(a) {
    cursor: text;
  }
}
.move-ready {
  ::v-deep(.prosemirror-editor) {
    cursor: move;
    user-select: none;
  }
}
</style>
