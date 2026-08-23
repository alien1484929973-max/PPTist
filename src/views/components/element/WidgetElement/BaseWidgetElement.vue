<template>
  <div
    class="base-element-widget"
    :style="{
      top: elementInfo.top + 'px',
      left: elementInfo.left + 'px',
      width: elementInfo.width + 'px',
      height: elementInfo.height + 'px',
    }"
  >
    <div class="rotate-wrapper" :style="{ transform: `rotate(${elementInfo.rotate}deg)` }">
      <div class="element-content" :style="posterStyle">
        <div class="widget-mark">
          <i-icon-park-outline:application-one />
          <strong>{{ elementInfo.widgetId || '未配置网页组件' }}</strong>
          <span>{{ modeLabel }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import type { PPTWidgetElement } from '@/types/slides'

const props = defineProps<{ elementInfo: PPTWidgetElement }>()

const modeLabel = computed(() => {
  if (props.elementInfo.widgetScroll.mode === 'fit') return '按比例适配'
  if (props.elementInfo.widgetScroll.mode === 'document') return '长页面滚动'
  return '区域内滚动'
})
const posterStyle = computed(() => props.elementInfo.poster
  ? { backgroundImage: `url(${props.elementInfo.poster})` }
  : {})
</script>

<style lang="scss" scoped>
.base-element-widget { position: absolute; }
.rotate-wrapper { width: 100%; height: 100%; }
.element-content {
  display: grid;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px dashed #94a3b8;
  background: #f8fafc center / cover no-repeat;
  place-items: center;
}
.widget-mark {
  display: grid;
  max-width: 85%;
  justify-items: center;
  gap: 5px;
  color: #334155;
  text-align: center;
}
.widget-mark svg { font-size: 28px; color: #2563eb; }
.widget-mark strong { overflow-wrap: anywhere; }
.widget-mark span { color: #64748b; font-size: 11px; }
</style>
