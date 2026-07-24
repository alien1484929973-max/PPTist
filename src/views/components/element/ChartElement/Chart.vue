<template>
  <div class="chart" ref="chartRef"></div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import type { ChartData, ChartOptions, ChartType } from '@/types/slides'
import { renderPresentationChart, type PlayerChartHandle } from '@pptist/presentation-player'

const props = defineProps<{
  width: number
  height: number
  type: ChartType
  data: ChartData
  themeColors: string[]
  textColor?: string
  lineColor?: string
  options?: ChartOptions
}>()

let chart: PlayerChartHandle | null = null
const chartRef = useTemplateRef<HTMLElement>('chartRef')

const payload = () => ({
  type: props.type,
  data: props.data,
  themeColors: props.themeColors,
  textColor: props.textColor,
  lineColor: props.lineColor,
  lineSmooth: props.options?.lineSmooth || false,
  stack: props.options?.stack || false,
})

onMounted(() => {
  if (!chartRef.value) return
  chart = renderPresentationChart(chartRef.value, payload(), { width: props.width, height: props.height })
})

watch(
  [() => props.type, () => props.data, () => props.themeColors, () => props.textColor, () => props.lineColor, () => props.options],
  () => chart?.update(payload()),
  { deep: true },
)
watch([() => props.width, () => props.height], () => {
  chart?.resize({ width: props.width, height: props.height })
})
onUnmounted(() => chart?.destroy())
</script>

<style lang="scss" scoped>
.chart {
  width: 100%;
  height: 100%;
}
</style>
