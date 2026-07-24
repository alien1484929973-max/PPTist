import type {
  ElementRendererContext,
  PlayerDocument,
  PlayerElement,
  PlayerElementRenderer,
  PlayerGradient,
  PlayerOptions,
  PlayerOutline,
  PlayerShadow,
  PlayerSlide,
  PlayerSlideBackground,
} from './types'
import { renderPresentationChart, type PlayerChartData, type PlayerChartType } from './chart'
import tinycolor from 'tinycolor2'
import { getPresentationLinePath, getPresentationLineRenderPath } from '@pptist/presentation-core'
import { PRESENTATION_IMAGE_CLIP_PATHS } from './image'

const SVG_NS = 'http://www.w3.org/2000/svg'

const svgElement = <K extends keyof SVGElementTagNameMap>(
  ownerDocument: Document,
  name: K,
) => ownerDocument.createElementNS(SVG_NS, name)

const shadowStyle = (shadow?: PlayerShadow) => shadow
  ? `${shadow.h}px ${shadow.v}px ${shadow.blur}px ${shadow.color}`
  : ''

const outlineStyle = (outline?: PlayerOutline) => {
  if (!outline?.width) return ''
  return `${outline.width}px ${outline.style || 'solid'} ${outline.color || '#000'}`
}

const gradientCss = (gradient: PlayerGradient) => {
  const stops = gradient.colors.map(item => `${item.color} ${item.pos}%`).join(', ')
  return gradient.type === 'radial'
    ? `radial-gradient(${stops})`
    : `linear-gradient(${(gradient.rotate || 0) + 90}deg, ${stops})`
}

export const applySlideBackground = (
  target: HTMLElement,
  background: PlayerSlideBackground | undefined,
  themeColor = '#fff',
  resolveResourceUrl: (url: string) => string | null = url => url,
) => {
  target.style.background = themeColor
  target.style.backgroundImage = ''
  target.style.backgroundRepeat = ''
  target.style.backgroundSize = ''
  target.style.backgroundPosition = ''
  if (!background) return
  if (background.type === 'solid') {
    target.style.background = background.color || themeColor
  }
  else if (background.type === 'gradient' && background.gradient) {
    target.style.background = gradientCss(background.gradient)
  }
  else if (background.type === 'image' && background.image?.src) {
    const src = resolveResourceUrl(background.image.src)
    if (!src) return
    target.style.backgroundImage = `url("${src.replace(/"/g, '\\"')}")`
    target.style.backgroundRepeat = background.image.size === 'repeat' ? 'repeat' : 'no-repeat'
    target.style.backgroundSize = background.image.size === 'repeat' ? 'contain' : background.image.size || 'cover'
    target.style.backgroundPosition = 'center'
  }
}

type TextElementData = PlayerElement & {
  content?: string
  defaultFontName?: string
  defaultColor?: string
  fill?: string
  opacity?: number
  lineHeight?: number
  wordSpace?: number
  paragraphSpace?: number
  vertical?: boolean
  fixedHeight?: boolean
  vAlign?: 'top' | 'middle' | 'bottom'
  inset?: [number, number, number, number]
  outline?: PlayerOutline
  shadow?: PlayerShadow
}

const renderText = (context: ElementRendererContext) => {
  const element = context.element as TextElementData
  const content = context.container.ownerDocument.createElement('div')
  const inset = element.inset || [10, 10, 10, 10]
  content.className = 'pptist-player-text ProseMirror-static'
  content.style.boxSizing = 'border-box'
  content.style.width = element.vertical && !element.fixedHeight ? 'auto' : '100%'
  content.style.height = !element.vertical && !element.fixedHeight ? 'auto' : '100%'
  content.style.padding = `${inset[0]}px ${inset[1]}px ${inset[2]}px ${inset[3]}px`
  content.style.background = element.fill || 'transparent'
  content.style.color = element.defaultColor || context.presentation.theme?.fontColor || '#333'
  content.style.fontFamily = element.defaultFontName || context.presentation.theme?.fontName || 'sans-serif'
  content.style.lineHeight = String(element.lineHeight || 1.5)
  content.style.letterSpacing = `${element.wordSpace || 0}px`
  content.style.opacity = String(element.opacity ?? 1)
  content.style.writingMode = element.vertical ? 'vertical-rl' : 'horizontal-tb'
  content.style.textShadow = shadowStyle(element.shadow)
  content.style.border = outlineStyle(element.outline)
  content.style.setProperty('--pptist-paragraph-space', `${element.paragraphSpace ?? 5}px`)
  if (element.fixedHeight) {
    content.style.display = 'flex'
    content.style.flexDirection = 'column'
    content.style.justifyContent = element.vAlign === 'middle'
      ? 'center'
      : element.vAlign === 'bottom' ? 'flex-end' : 'flex-start'
  }
  content.innerHTML = context.sanitizeHtml(element.content || '')
  return content
}

type ImageElementData = PlayerElement & {
  src?: string
  filters?: Record<string, string>
  clip?: { range?: [[number, number], [number, number]]; shape?: string }
  flipH?: boolean
  flipV?: boolean
  shadow?: PlayerShadow
  outline?: PlayerOutline
  radius?: number
  colorMask?: string
}

const renderImage = (context: ElementRendererContext) => {
  const element = context.element as ImageElementData
  const wrapper = context.container.ownerDocument.createElement('div')
  wrapper.className = 'pptist-player-image'
  wrapper.style.width = '100%'
  wrapper.style.height = '100%'
  wrapper.style.position = 'relative'
  wrapper.style.overflow = 'hidden'
  wrapper.style.border = outlineStyle(element.outline)
  wrapper.style.borderRadius = element.radius ? `${element.radius}px` : ''
  const clipShape = element.clip?.shape || 'rect'
  wrapper.style.clipPath = element.radius && (clipShape === 'rect' || clipShape === 'roundRect')
    ? `inset(0 round ${element.radius}px)`
    : PRESENTATION_IMAGE_CLIP_PATHS[clipShape] || ''
  wrapper.style.filter = element.shadow ? `drop-shadow(${shadowStyle(element.shadow)})` : ''
  wrapper.style.transform = `scale(${element.flipH ? -1 : 1}, ${element.flipV ? -1 : 1})`

  const image = context.container.ownerDocument.createElement('img')
  image.alt = element.name || ''
  image.draggable = false
  image.src = context.resolveResourceUrl(element.src || '', 'image') || ''
  image.style.position = 'absolute'
  image.style.objectFit = 'fill'
  const range = element.clip?.range
  if (range) {
    const widthScale = Math.max(0.01, (range[1][0] - range[0][0]) / 100)
    const heightScale = Math.max(0.01, (range[1][1] - range[0][1]) / 100)
    image.style.left = `${-(range[0][0] / widthScale)}%`
    image.style.top = `${-(range[0][1] / heightScale)}%`
    image.style.width = `${100 / widthScale}%`
    image.style.height = `${100 / heightScale}%`
  }
  else {
    image.style.inset = '0'
    image.style.width = '100%'
    image.style.height = '100%'
  }
  image.style.filter = Object.entries(element.filters || {}).map(([name, value]) => `${name}(${value})`).join(' ')
  wrapper.appendChild(image)

  if (element.colorMask) {
    const mask = context.container.ownerDocument.createElement('div')
    mask.style.position = 'absolute'
    mask.style.inset = '0'
    mask.style.background = element.colorMask
    mask.style.pointerEvents = 'none'
    wrapper.appendChild(mask)
  }
  return wrapper
}

type ShapeElementData = PlayerElement & {
  viewBox?: [number, number]
  path?: string
  fill?: string
  gradient?: PlayerGradient
  pattern?: string
  outline?: PlayerOutline
  opacity?: number
  flipH?: boolean
  flipV?: boolean
  shadow?: PlayerShadow
  text?: {
    content?: string
    defaultFontName?: string
    defaultColor?: string
    align?: 'top' | 'middle' | 'bottom'
    lineHeight?: number
    wordSpace?: number
    paragraphSpace?: number
    inset?: [number, number, number, number]
  }
}

const appendSvgFill = (
  svg: SVGSVGElement,
  element: ShapeElementData,
) => {
  const id = `pptist-fill-${element.id.replace(/[^a-zA-Z0-9_-]/g, '')}`
  if (!element.gradient && !element.pattern) return element.fill || 'transparent'
  const defs = svgElement(svg.ownerDocument, 'defs')
  if (element.gradient) {
    const gradient = element.gradient.type === 'radial'
      ? svgElement(svg.ownerDocument, 'radialGradient')
      : svgElement(svg.ownerDocument, 'linearGradient')
    gradient.id = id
    if (element.gradient.type === 'linear') {
      gradient.setAttribute('x1', '0%')
      gradient.setAttribute('x2', '100%')
      gradient.setAttribute('gradientTransform', `rotate(${element.gradient.rotate || 0},0.5,0.5)`)
    }
    for (const item of element.gradient.colors) {
      const stop = svgElement(svg.ownerDocument, 'stop')
      stop.setAttribute('offset', `${item.pos}%`)
      stop.setAttribute('stop-color', item.color)
      gradient.appendChild(stop)
    }
    defs.appendChild(gradient)
  }
  else if (element.pattern) {
    const pattern = svgElement(svg.ownerDocument, 'pattern')
    pattern.id = id
    pattern.setAttribute('width', '1')
    pattern.setAttribute('height', '1')
    pattern.setAttribute('patternContentUnits', 'objectBoundingBox')
    const image = svgElement(svg.ownerDocument, 'image')
    image.setAttribute('href', element.pattern)
    image.setAttribute('width', '1')
    image.setAttribute('height', '1')
    image.setAttribute('preserveAspectRatio', 'xMidYMid slice')
    pattern.appendChild(image)
    defs.appendChild(pattern)
  }
  svg.appendChild(defs)
  return `url(#${id})`
}

const renderShape = (context: ElementRendererContext) => {
  const element = context.element as ShapeElementData
  const renderElement = element.pattern
    ? { ...element, pattern: context.resolveResourceUrl(element.pattern, 'pattern') || undefined }
    : element
  const wrapper = context.container.ownerDocument.createElement('div')
  wrapper.style.position = 'relative'
  wrapper.style.width = '100%'
  wrapper.style.height = '100%'
  wrapper.style.opacity = String(element.opacity ?? 1)
  wrapper.style.filter = element.shadow ? `drop-shadow(${shadowStyle(element.shadow)})` : ''
  wrapper.style.transform = `scale(${element.flipH ? -1 : 1}, ${element.flipV ? -1 : 1})`

  const svg = svgElement(context.container.ownerDocument, 'svg')
  const viewBox = element.viewBox || [element.width, element.height || 1]
  svg.setAttribute('viewBox', `0 0 ${viewBox[0]} ${viewBox[1]}`)
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.style.width = '100%'
  svg.style.height = '100%'
  svg.style.overflow = 'visible'
  const path = svgElement(context.container.ownerDocument, 'path')
  path.setAttribute('d', element.path || '')
  path.setAttribute('fill', appendSvgFill(svg, renderElement))
  path.setAttribute('stroke', element.outline?.color || 'transparent')
  path.setAttribute('stroke-width', String(element.outline?.width || 0))
  if (element.outline?.style === 'dashed') path.setAttribute('stroke-dasharray', '5 2.5')
  if (element.outline?.style === 'dotted') path.setAttribute('stroke-dasharray', '1.8 1.6')
  path.setAttribute('vector-effect', 'non-scaling-stroke')
  svg.appendChild(path)
  wrapper.appendChild(svg)

  if (element.text?.content) {
    const text = context.container.ownerDocument.createElement('div')
    const inset = element.text.inset || [10, 10, 10, 10]
    text.className = 'pptist-player-shape-text ProseMirror-static'
    text.style.position = 'absolute'
    text.style.inset = '0'
    text.style.boxSizing = 'border-box'
    text.style.padding = `${inset[0]}px ${inset[1]}px ${inset[2]}px ${inset[3]}px`
    text.style.display = 'flex'
    text.style.flexDirection = 'column'
    text.style.justifyContent = element.text.align === 'top'
      ? 'flex-start'
      : element.text.align === 'bottom' ? 'flex-end' : 'center'
    text.style.color = element.text.defaultColor || context.presentation.theme?.fontColor || '#333'
    text.style.fontFamily = element.text.defaultFontName || context.presentation.theme?.fontName || 'sans-serif'
    text.style.lineHeight = String(element.text.lineHeight || 1.5)
    text.style.letterSpacing = `${element.text.wordSpace || 0}px`
    text.style.setProperty('--pptist-paragraph-space', `${element.text.paragraphSpace ?? 5}px`)
    text.innerHTML = context.sanitizeHtml(element.text.content)
    wrapper.appendChild(text)
  }
  return wrapper
}

type LineElementData = PlayerElement & {
  start?: [number, number]
  end?: [number, number]
  style?: 'solid' | 'dashed' | 'dotted'
  color?: string
  points?: ['', ''] | ['arrow' | 'dot' | '', 'arrow' | 'dot' | '']
  broken?: [number, number]
  broken2?: [number, number]
  broken2Direction?: 'horizontal' | 'vertical'
  curve?: [number, number]
  cubic?: [[number, number], [number, number]]
  shadow?: PlayerShadow
}

const renderLine = (context: ElementRendererContext) => {
  const element = context.element as LineElementData
  const start = element.start || [0, 0]
  const end = element.end || [0, 0]
  const line = { ...element, start, end, points: element.points || ['', ''] } as Required<Pick<LineElementData, 'start' | 'end' | 'width' | 'points'>> & LineElementData
  const width = Math.max(24, Math.abs(start[0] - end[0]))
  const height = Math.max(24, Math.abs(start[1] - end[1]))
  const svg = svgElement(context.container.ownerDocument, 'svg')
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.style.overflow = 'visible'
  svg.style.filter = element.shadow ? `drop-shadow(${shadowStyle(element.shadow)})` : ''
  const defs = svgElement(svg.ownerDocument, 'defs')
  const markerIds: string[] = []
  for (const [index, pointType] of (element.points || ['', '']).entries()) {
    if (!pointType) continue
    const marker = svgElement(svg.ownerDocument, 'marker')
    const markerId = `pptist-line-${element.id.replace(/[^a-zA-Z0-9_-]/g, '')}-${index}`
    markerIds[index] = markerId
    marker.id = markerId
    const size = Math.max(2, element.width)
    marker.setAttribute('markerUnits', 'userSpaceOnUse')
    marker.setAttribute('orient', 'auto')
    marker.setAttribute('markerWidth', String(size * 3))
    marker.setAttribute('markerHeight', String(size * 3))
    marker.setAttribute('refX', index === 0 ? '0' : String(size * 3))
    marker.setAttribute('refY', String(size * 1.5))
    const markerPath = svgElement(svg.ownerDocument, 'path')
    markerPath.setAttribute('d', pointType === 'dot' ? 'm0 5a5 5 0 1 0 10 0a5 5 0 1 0 -10 0z' : 'M0,0 L10,5 0,10 Z')
    markerPath.setAttribute('fill', element.color || '#000')
    markerPath.setAttribute('transform', `scale(${size * 0.3}, ${size * 0.3}) rotate(${index === 0 && pointType === 'arrow' ? 180 : 0}, 5, 5)`)
    marker.appendChild(markerPath)
    defs.appendChild(marker)
  }
  svg.appendChild(defs)
  const path = svgElement(svg.ownerDocument, 'path')
  path.setAttribute('d', getPresentationLineRenderPath(line))
  path.setAttribute('stroke', element.color || '#000')
  path.setAttribute('stroke-width', String(element.width))
  path.setAttribute('fill', 'none')
  if (element.style === 'dashed') path.setAttribute('stroke-dasharray', `${element.width * 5} ${element.width * 2.5}`)
  if (element.style === 'dotted') path.setAttribute('stroke-dasharray', `${element.width * 1.8} ${element.width * 1.6}`)
  svg.appendChild(path)
  const markerPath = svgElement(svg.ownerDocument, 'path')
  markerPath.setAttribute('d', getPresentationLinePath(line))
  markerPath.setAttribute('stroke', 'transparent')
  markerPath.setAttribute('stroke-width', String(element.width))
  markerPath.setAttribute('fill', 'none')
  if (markerIds[0]) markerPath.setAttribute('marker-start', `url(#${markerIds[0]})`)
  if (markerIds[1]) markerPath.setAttribute('marker-end', `url(#${markerIds[1]})`)
  svg.appendChild(markerPath)
  return svg
}

type TableElementData = PlayerElement & {
  data?: Array<Array<{
    text?: string
    colspan?: number
    rowspan?: number
    style?: Record<string, string | number | boolean>
  }>>
  colWidths?: number[]
  cellMinHeight?: number
  outline?: PlayerOutline
  theme?: {
    color: string
    rowHeader: boolean
    rowFooter: boolean
    colHeader: boolean
    colFooter: boolean
  }
}

const renderTable = (context: ElementRendererContext) => {
  const element = context.element as TableElementData
  const table = context.container.ownerDocument.createElement('table')
  table.className = 'pptist-player-table'
  table.style.width = '100%'
  table.style.borderCollapse = 'collapse'
  const colgroup = context.container.ownerDocument.createElement('colgroup')
  for (const width of element.colWidths || []) {
    const col = context.container.ownerDocument.createElement('col')
    col.style.width = `${width * 100}%`
    colgroup.appendChild(col)
  }
  table.appendChild(colgroup)
  const rows = element.data || []
  const hiddenCells = new Set<string>()
  rows.forEach((row, rowIndex) => row.forEach((cell, colIndex) => {
    const colspan = cell.colspan || 1
    const rowspan = cell.rowspan || 1
    for (let targetRow = rowIndex; targetRow < rowIndex + rowspan; targetRow++) {
      for (let targetCol = targetRow === rowIndex ? colIndex + 1 : colIndex; targetCol < colIndex + colspan; targetCol++) {
        hiddenCells.add(`${targetRow}:${targetCol}`)
      }
    }
  }))
  const themeColor = element.theme?.color || ''
  const themeBase = themeColor ? tinycolor(themeColor) : null
  const themeRows = themeBase
    ? [themeBase.clone().setAlpha(0.1).toRgbString(), themeBase.clone().setAlpha(0.3).toRgbString()]
    : ['', '']
  for (const [rowIndex, row] of rows.entries()) {
    const tr = context.container.ownerDocument.createElement('tr')
    tr.style.height = `${element.cellMinHeight || 20}px`
    for (const [colIndex, cell] of row.entries()) {
      if (hiddenCells.has(`${rowIndex}:${colIndex}`)) continue
      const td = context.container.ownerDocument.createElement('td')
      td.colSpan = cell.colspan || 1
      td.rowSpan = cell.rowspan || 1
      td.style.border = outlineStyle(element.outline) || '1px solid #666'
      const style = cell.style || {}
      const isRowAccent = element.theme?.rowHeader && rowIndex === 0 || element.theme?.rowFooter && rowIndex === rows.length - 1
      const isColAccent = element.theme?.colHeader && colIndex === 0 || element.theme?.colFooter && colIndex === row.length - 1
      if (themeColor) td.style.background = isRowAccent || isColAccent ? themeColor : themeRows[rowIndex % 2]
      if (style.backcolor) td.style.background = String(style.backcolor)
      const text = context.container.ownerDocument.createElement('div')
      text.className = 'pptist-player-cell-text'
      text.textContent = cell.text || ''
      text.style.minHeight = `${Math.max(0, (element.cellMinHeight || 20) - 4)}px`
      text.style.justifyContent = style.vAlign === 'middle' ? 'center' : style.vAlign === 'bottom' ? 'flex-end' : 'flex-start'
      text.style.color = style.color ? String(style.color) : '#000'
      text.style.fontSize = style.fontsize ? String(style.fontsize) : '14px'
      if (style.fontname) text.style.fontFamily = String(style.fontname)
      text.style.textAlign = style.align ? String(style.align) : 'left'
      text.style.fontWeight = style.bold ? 'bold' : 'normal'
      text.style.fontStyle = style.em ? 'italic' : 'normal'
      text.style.textDecoration = `${style.underline ? 'underline' : ''} ${style.strikethrough ? 'line-through' : ''}`.trim() || 'none'
      td.appendChild(text)
      tr.appendChild(td)
    }
    table.appendChild(tr)
  }
  return table
}

const renderLatex = (context: ElementRendererContext) => {
  const element = context.element as PlayerElement & { path?: string; color?: string; strokeWidth?: number; viewBox?: [number, number] }
  const svg = svgElement(context.container.ownerDocument, 'svg')
  const viewBox = element.viewBox || [element.width, element.height || 1]
  svg.setAttribute('viewBox', `0 0 ${viewBox[0]} ${viewBox[1]}`)
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.style.width = '100%'
  svg.style.height = '100%'
  const path = svgElement(svg.ownerDocument, 'path')
  path.setAttribute('d', element.path || '')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', element.color || 'currentColor')
  path.setAttribute('stroke-width', String(element.strokeWidth || 0))
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(path)
  return svg
}

const renderMedia = (context: ElementRendererContext) => {
  const element = context.element as PlayerElement & { src?: string; poster?: string; autoplay?: boolean; loop?: boolean; color?: string }
  if (element.type === 'video') {
    const video = context.container.ownerDocument.createElement('video')
    video.src = context.resolveResourceUrl(element.src || '', 'media') || ''
    video.controls = true
    video.autoplay = !!element.autoplay
    video.poster = context.resolveResourceUrl(element.poster || '', 'poster') || ''
    video.style.width = '100%'
    video.style.height = '100%'
    context.onCleanup(() => video.pause())
    return video
  }

  const wrapper = context.container.ownerDocument.createElement('div')
  wrapper.className = 'pptist-player-audio'
  const button = context.container.ownerDocument.createElement('button')
  button.type = 'button'
  button.setAttribute('aria-label', '播放或暂停音频')
  const icon = svgElement(context.container.ownerDocument, 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('aria-hidden', 'true')
  const path = svgElement(context.container.ownerDocument, 'path')
  path.setAttribute('d', 'M4 9v6h4l5 4V5L8 9H4zm11.5 3a3.5 3.5 0 0 0-1.5-2.87v5.74A3.5 3.5 0 0 0 15.5 12zm0-7.1v2.06a6 6 0 0 1 0 10.08v2.06a8 8 0 0 0 0-14.2z')
  path.setAttribute('fill', element.color || 'currentColor')
  icon.appendChild(path)
  button.appendChild(icon)
  const audio = context.container.ownerDocument.createElement('audio')
  audio.src = context.resolveResourceUrl(element.src || '', 'media') || ''
  audio.controls = true
  audio.autoplay = !!element.autoplay
  audio.loop = !!element.loop
  button.addEventListener('click', () => {
    if (audio.paused) void audio.play().catch(() => undefined)
    else audio.pause()
  })
  wrapper.append(button, audio)
  context.onCleanup(() => audio.pause())
  return wrapper
}

type ChartElementData = PlayerElement & {
  fill?: string
  chartType?: PlayerChartType
  data?: PlayerChartData
  options?: { lineSmooth?: boolean; stack?: boolean }
  outline?: PlayerOutline
  themeColors?: string[]
  textColor?: string
  lineColor?: string
}

const renderChart = (context: ElementRendererContext) => {
  const element = context.element as ChartElementData
  const host = context.container.ownerDocument.createElement('div')
  host.className = 'pptist-player-chart'
  host.style.width = '100%'
  host.style.height = '100%'
  host.style.background = element.fill || 'transparent'
  host.style.border = outlineStyle(element.outline)
  const handle = renderPresentationChart(host, {
    type: element.chartType || 'bar',
    data: element.data || { labels: [], legends: [], series: [] },
    themeColors: element.themeColors || context.presentation.theme?.themeColors as string[] || [],
    textColor: element.textColor,
    lineColor: element.lineColor,
    lineSmooth: element.options?.lineSmooth,
    stack: element.options?.stack,
  }, {
    width: element.width,
    height: element.height || 1,
  })
  context.onCleanup(handle.destroy)
  return host
}

const builtInRenderers: Record<string, PlayerElementRenderer> = {
  text: renderText,
  image: renderImage,
  shape: renderShape,
  line: renderLine,
  table: renderTable,
  latex: renderLatex,
  video: renderMedia,
  audio: renderMedia,
  chart: renderChart,
}

export interface RenderElementResult {
  root: HTMLElement
  supported: boolean
}

export const renderElement = (
  ownerDocument: Document,
  element: PlayerElement,
  index: number,
  slide: PlayerSlide,
  presentation: PlayerDocument,
  options: PlayerOptions,
  onSlideLink: (slideId: string) => void,
  onCleanup: (cleanup: () => void) => void = () => {},
) : RenderElementResult => {
  const root = ownerDocument.createElement('div')
  root.className = 'pptist-player-element'
  root.dataset.pptistElementId = element.id
  root.style.left = `${element.left}px`
  root.style.top = `${element.top}px`
  root.style.zIndex = String(index + 1)
  root.style.transform = `rotate(${element.rotate || 0}deg)`
  if (element.type !== 'line') {
    root.style.width = `${element.width}px`
    root.style.height = `${element.height || 0}px`
  }

  const sanitizeHtml = options.sanitizeHtml || ((html: string) => html)
  const resolveResourceUrl = (url: string, kind: Parameters<NonNullable<PlayerOptions['resolveResourceUrl']>>[1]) => {
    if (!url) return null
    return options.resolveResourceUrl ? options.resolveResourceUrl(url, kind) : url
  }
  const context: ElementRendererContext = {
    element,
    slide,
    presentation,
    container: root,
    sanitizeHtml,
    resolveResourceUrl,
    onCleanup,
  }
  const renderer = options.renderers?.[element.type] || builtInRenderers[element.type]
  const content = renderer?.(context)
  if (content) root.appendChild(content)
  const supported = !!renderer
  if (!supported) {
    options.onUnsupportedElement?.(element)
    if (options.showUnsupported !== false) {
      const placeholder = ownerDocument.createElement('div')
      placeholder.className = 'pptist-player-unsupported'
      placeholder.textContent = `暂不支持：${element.type}`
      root.appendChild(placeholder)
    }
  }

  if (element.link) {
    root.classList.add('pptist-player-link')
    root.addEventListener('click', event => {
      event.stopPropagation()
      if (element.link?.type === 'slide') onSlideLink(element.link.target)
      else if (element.link?.target) {
        const target = resolveResourceUrl(element.link.target, 'link')
        if (target) ownerDocument.defaultView?.open(target, '_blank', 'noopener,noreferrer')
      }
    })
  }
  return { root, supported }
}

export interface ElementRange {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const elementRange = (elements: PlayerElement[]): ElementRange => {
  const ranges = elements.map(element => {
    if (element.type !== 'line') {
      return {
        minX: element.left,
        minY: element.top,
        maxX: element.left + element.width,
        maxY: element.top + (element.height || 0),
      }
    }
    const line = element as LineElementData
    const points = [line.start, line.end, line.broken, line.broken2, line.curve, ...(line.cubic || [])]
      .filter((point): point is [number, number] => !!point)
    return {
      minX: element.left + Math.min(...points.map(point => point[0]), 0),
      minY: element.top + Math.min(...points.map(point => point[1]), 0),
      maxX: element.left + Math.max(...points.map(point => point[0]), 0),
      maxY: element.top + Math.max(...points.map(point => point[1]), 0),
    }
  })
  return {
    minX: Math.min(...ranges.map(range => range.minX)),
    minY: Math.min(...ranges.map(range => range.minY)),
    maxX: Math.max(...ranges.map(range => range.maxX)),
    maxY: Math.max(...ranges.map(range => range.maxY)),
  }
}
