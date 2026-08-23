<template>
  <div class="widget-input">
    <Input
      ref="inputRef"
      v-model:value="name"
      :maxlength="60"
      placeholder="组件名称，例如：课程大纲"
      @enter="insert"
    />
    <div class="options">
      <div class="option-row">
        <span>允许长页面滚动</span>
        <Switch v-model:value="longPage" />
      </div>
      <template v-if="longPage">
        <div class="option-row">
          <span>显示滚动条</span>
          <Switch v-model:value="showScrollbar" />
        </div>
        <div class="option-row">
          <span>滚动到边界后允许翻页</span>
          <Switch v-model:value="handoffAtBoundary" />
        </div>
      </template>
    </div>
    <div class="actions">
      <Button @click="$emit('close')">取消</Button>
      <Button type="primary" :disabled="!name.trim()" @click="insert">
        <i-icon-park-outline:plus /> 插入
      </Button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, ref } from 'vue'
import Input from '@/components/Input.vue'
import Button from '@/components/Button.vue'
import Switch from '@/components/Switch.vue'

const emit = defineEmits<{
  close: []
  insert: [options: {
    name: string
    longPage: boolean
    showScrollbar: boolean
    handoffAtBoundary: boolean
  }]
}>()
const name = ref('')
const longPage = ref(false)
const showScrollbar = ref(false)
const handoffAtBoundary = ref(false)
const inputRef = ref<{ focus: () => void }>()

onMounted(() => nextTick(() => inputRef.value?.focus()))

const insert = () => {
  const value = name.value.trim()
  if (!value) return
  emit('insert', {
    name: value,
    longPage: longPage.value,
    showScrollbar: longPage.value && showScrollbar.value,
    handoffAtBoundary: longPage.value && handoffAtBoundary.value,
  })
}
</script>

<style lang="scss" scoped>
.widget-input {
  width: 300px;
  padding: 12px;
}
.options {
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}
.option-row {
  display: flex;
  min-height: 20px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: #334155;
  font-size: 13px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
</style>
