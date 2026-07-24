import tinycolor from 'tinycolor2'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, RadarChart, ScatterChart } from 'echarts/charts'
import { LegendComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  ScatterChart,
  LegendComponent,
  SVGRenderer,
])

export type PlayerChartType = 'bar' | 'column' | 'line' | 'pie' | 'ring' | 'area' | 'radar' | 'scatter'

export interface PlayerChartData {
  labels: string[]
  legends: string[]
  series: number[][]
}

export interface PlayerChartOptionPayload {
  type: PlayerChartType
  data: PlayerChartData
  themeColors: string[]
  textColor?: string
  lineColor?: string
  lineSmooth?: boolean
  stack?: boolean
}

const chartColors = (input: string[]) => {
  if (input.length >= 10) return input
  if (!input.length) return ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4', '#70ad47']
  if (input.length === 1) return tinycolor(input[0]).analogous(10).map(color => color.toRgbString())
  const supplement = tinycolor(input[input.length - 1])
    .analogous(11 - input.length)
    .map(color => color.toRgbString())
  return [...input.slice(0, -1), ...supplement]
}

const radarScale = (max: number) => {
  if (max <= 0) return { max: 0, splitNumber: 5 }
  return [4, 5, 6]
    .map(splitNumber => {
      const raw = max / splitNumber
      const power = 10 ** Math.floor(Math.log10(raw))
      const ratio = raw / power
      const nice = ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 3 ? 3 : ratio <= 5 ? 5 : 10
      return { max: nice * power * splitNumber, splitNumber }
    })
    .reduce((best, item) => {
      const overflow = item.max - max
      const bestOverflow = best.max - max
      if (overflow < bestOverflow) return item
      if (overflow === bestOverflow && Math.abs(item.splitNumber - 5) < Math.abs(best.splitNumber - 5)) return item
      return best
    })
}

/** Shared ECharts option builder used by both Vue editing surfaces and DOM playback. */
export const getChartOption = ({
  type,
  data,
  themeColors,
  textColor,
  lineColor,
  lineSmooth = false,
  stack = false,
}: PlayerChartOptionPayload): EChartsOption | null => {
  const color = chartColors(themeColors)
  const textStyle = textColor ? { color: textColor } : {}
  const axisLine = textColor ? { lineStyle: { color: textColor } } : undefined
  const axisLabel = textColor ? { color: textColor } : undefined
  const splitLine = lineColor ? { lineStyle: { color: lineColor } } : {}
  const legend = data.series.length > 1 ? { top: 'bottom', textStyle } : undefined
  const valueAxis = { type: 'value' as const, axisLine, axisLabel, splitLine }
  const categoryAxis = { type: 'category' as const, data: data.labels, axisLine, axisLabel }

  if (type === 'bar' || type === 'column') {
    const series = data.series.map((item, index) => ({
      data: item,
      name: data.legends[index],
      type: 'bar' as const,
      label: { show: true },
      itemStyle: { borderRadius: type === 'bar' ? [2, 2, 0, 0] : [0, 2, 2, 0] },
      stack: stack ? 'A' : undefined,
    }))
    return type === 'bar'
      ? { color, textStyle, legend, xAxis: categoryAxis, yAxis: valueAxis, series }
      : { color, textStyle, legend, yAxis: categoryAxis, xAxis: valueAxis, series }
  }

  if (type === 'line' || type === 'area') {
    return {
      color,
      textStyle,
      legend,
      xAxis: { ...categoryAxis, boundaryGap: type === 'area' ? false : undefined },
      yAxis: valueAxis,
      series: data.series.map((item, index) => ({
        data: item,
        name: data.legends[index],
        type: 'line' as const,
        smooth: lineSmooth,
        areaStyle: type === 'area' ? {} : undefined,
        label: { show: true },
        stack: stack ? 'A' : undefined,
      })),
    }
  }

  if (type === 'pie' || type === 'ring') {
    return {
      color,
      textStyle,
      legend: { top: 'bottom', textStyle },
      series: [{
        data: (data.series[0] || []).map((value, index) => ({ value, name: data.labels[index] })),
        label: textColor ? { color: textColor } : {},
        type: 'pie',
        radius: type === 'ring' ? ['40%', '70%'] : '70%',
        padAngle: type === 'ring' ? 1 : undefined,
        avoidLabelOverlap: type === 'ring' ? false : undefined,
        itemStyle: type === 'ring' ? { borderRadius: 4 } : undefined,
        emphasis: {
          itemStyle: type === 'pie'
            ? { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,.5)' }
            : undefined,
          label: { show: true, fontSize: 14, fontWeight: 'bold' },
        },
      }],
    }
  }

  if (type === 'radar') {
    const values = data.series.flat()
    const scale = radarScale(Math.max(0, ...values))
    return {
      color,
      textStyle,
      legend,
      radar: {
        splitNumber: scale.splitNumber,
        indicator: data.labels.map(name => ({ name, max: scale.max })),
        splitLine,
        axisLine: lineColor ? { lineStyle: { color: lineColor } } : undefined,
      },
      series: [{
        type: 'radar',
        data: data.series.map((value, index) => ({ value, name: data.legends[index] })),
      }],
    }
  }

  if (type === 'scatter') {
    const xData = data.series[0] || []
    const ySeries = data.series.length > 1 ? data.series.slice(1) : [xData]
    return {
      color,
      textStyle,
      legend: data.series.length > 2 ? { top: 'bottom', textStyle } : undefined,
      xAxis: { axisLine, axisLabel, splitLine },
      yAxis: { axisLine, axisLabel, splitLine },
      series: ySeries.map((item, index) => ({
        symbolSize: 12,
        data: xData.map((x, dataIndex) => [x, item[dataIndex]]),
        name: data.legends[index + 1],
        type: 'scatter',
      })),
    }
  }
  return null
}

export interface PlayerChartHandle {
  update: (payload: PlayerChartOptionPayload) => void
  resize: (size?: { width: number; height: number }) => void
  destroy: () => void
}

export const renderPresentationChart = (
  container: HTMLElement,
  payload: PlayerChartOptionPayload,
  size: { width: number; height: number },
): PlayerChartHandle => {
  const chart = echarts.init(container, null, {
    renderer: 'svg',
    width: Math.max(1, size.width),
    height: Math.max(1, size.height),
  })
  let currentSize = size
  const update = (nextPayload: PlayerChartOptionPayload) => {
    const option = getChartOption(nextPayload)
    if (option) chart.setOption(option, true)
  }
  update(payload)
  return {
    update,
    resize: nextSize => {
      if (nextSize) currentSize = nextSize
      chart.resize({ width: currentSize.width, height: currentSize.height })
    },
    destroy: () => chart.dispose(),
  }
}
