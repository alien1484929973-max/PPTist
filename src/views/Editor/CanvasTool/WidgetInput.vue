<template>
  <div class="widget-input">
    <label>组件 ID</label>
    <Input v-model:value="widgetId" placeholder="例如 lesson-outline" />
    <label>版本要求</label>
    <Input v-model:value="widgetVersion" placeholder="例如 ^1" />
    <label>内容模式</label>
    <Select v-model:value="scrollMode" :options="scrollModeOptions" />
    <label>滚动到边界</label>
    <Select v-model:value="overscroll" :options="overscrollOptions" :disabled="scrollMode === 'fit'" />
    <label>挂载时机</label>
    <Select v-model:value="mountPolicy" :options="mountPolicyOptions" />
    <div class="actions">
      <Button @click="$emit('close')">取消</Button>
      <Button type="primary" :disabled="!widgetId.trim()" @click="insert">插入</Button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import type { PPTWidgetElement } from '@/types/slides'
import Input from '@/components/Input.vue'
import Select from '@/components/Select.vue'
import Button from '@/components/Button.vue'

const emit = defineEmits<{
  close: []
  insert: [data: Pick<PPTWidgetElement, 'widgetId' | 'widgetVersion' | 'widgetMountPolicy' | 'widgetInteractive' | 'widgetScroll'>]
}>()
const widgetId = ref('')
const widgetVersion = ref('')
const scrollMode = ref<'fit' | 'internal' | 'document'>('internal')
const overscroll = ref<'contain' | 'handoff'>('contain')
const mountPolicy = ref<'eager' | 'onReveal'>('eager')
const scrollModeOptions = [
  { label: '按比例适配', value: 'fit' },
  { label: '区域内滚动', value: 'internal' },
  { label: '长页面滚动', value: 'document' },
]
const overscrollOptions = [
  { label: '边界仍由组件接管', value: 'contain' },
  { label: '边界交给播放器翻页', value: 'handoff' },
]
const mountPolicyOptions = [
  { label: '页面载入即挂载', value: 'eager' },
  { label: '入场动画时挂载', value: 'onReveal' },
]

const insert = () => {
  if (!widgetId.value.trim()) return
  emit('insert', {
    widgetId: widgetId.value.trim(),
    widgetVersion: widgetVersion.value.trim() || undefined,
    widgetMountPolicy: mountPolicy.value,
    widgetInteractive: true,
    widgetScroll: {
      mode: scrollMode.value,
      overscroll: scrollMode.value === 'fit' ? undefined : overscroll.value,
    },
  })
}
</script>

<style lang="scss" scoped>
.widget-input {
  display: grid;
  gap: 10px;
  padding: 20px;
}
.widget-input label { color: #475569; font-size: 12px; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
</style>
