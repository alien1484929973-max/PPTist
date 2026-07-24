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
    target.style.backgroundImage = `url("${background.image.src.replace(/"/g, '\\"')}")`
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
  content.style.width = '100%'
  content.style.height = '100%'
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

const clipPaths: Record<string, string> = {
  ellipse: 'ellipse(50% 50% at 50% 50%)',
  triangle: 'polygon(50% 0%, 0% 100%, 100% 100%)',
  rtTriangle: 'polygon(0% 0%, 0% 100%, 100% 100%)',
  triangleReverse: 'polygon(50% 100%, 0% 0%, 100% 0%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  pentagon: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
  hexagon: 'polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)',
  roundRect: 'inset(0 round 10px)',
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
  wrapper.style.clipPath = element.clip?.shape ? clipPaths[element.clip.shape] || '' : ''
  wrapper.style.filter = element.shadow ? `drop-shadow(${shadowStyle(element.shadow)})` : ''

  const image = context.container.ownerDocument.createElement('img')
  image.alt = element.name || ''
  image.draggable = false
  image.src = element.src || ''
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
  image.style.transform = `scale(${element.flipH ? -1 : 1}, ${element.flipV ? -1 : 1})`
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
  path.setAttribute('fill', appendSvgFill(svg, element))
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

const linePath = (element: LineElementData) => {
  const start = element.start || [0, 0]
  const end = element.end || [0, 0]
  if (element.broken) return `M${start.join(',')} L${element.broken.join(',')} L${end.join(',')}`
  if (element.broken2) {
    const direction = element.broken2Direction || (Math.abs(end[0] - start[0]) >= Math.abs(end[1] - start[1]) ? 'horizontal' : 'vertical')
    return direction === 'horizontal'
      ? `M${start.join(',')} L${element.broken2[0]},${start[1]} L${element.broken2[0]},${end[1]} L${end.join(',')}`
      : `M${start.join(',')} L${start[0]},${element.broken2[1]} L${end[0]},${element.broken2[1]} L${end.join(',')}`
  }
  if (element.curve) return `M${start.join(',')} Q${element.curve.join(',')} ${end.join(',')}`
  if (element.cubic) return `M${start.join(',')} C${element.cubic[0].join(',')} ${element.cubic[1].join(',')} ${end.join(',')}`
  return `M${start.join(',')} L${end.join(',')}`
}

const renderLine = (context: ElementRendererContext) => {
  const element = context.element as LineElementData
  const points = [element.start, element.end, element.broken, element.broken2, element.curve, ...(element.cubic || [])]
    .filter((point): point is [number, number] => !!point)
  const width = Math.max(24, ...points.map(point => point[0] + element.width * 3))
  const height = Math.max(24, ...points.map(point => point[1] + element.width * 3))
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
    marker.setAttribute('markerUnits', 'strokeWidth')
    marker.setAttribute('orient', 'auto')
    marker.setAttribute('markerWidth', '6')
    marker.setAttribute('markerHeight', '6')
    marker.setAttribute('refX', index === 0 ? '0' : '5')
    marker.setAttribute('refY', '3')
    const markerPath = svgElement(svg.ownerDocument, 'path')
    markerPath.setAttribute('d', pointType === 'dot' ? 'M0 3a3 3 0 1 0 6 0a3 3 0 1 0-6 0z' : 'M0,0 L6,3 0,6 Z')
    markerPath.setAttribute('fill', element.color || '#000')
    if (index === 0 && pointType === 'arrow') markerPath.setAttribute('transform', 'rotate(180 3 3)')
    marker.appendChild(markerPath)
    defs.appendChild(marker)
  }
  svg.appendChild(defs)
  const path = svgElement(svg.ownerDocument, 'path')
  path.setAttribute('d', linePath(element))
  path.setAttribute('stroke', element.color || '#000')
  path.setAttribute('stroke-width', String(element.width))
  path.setAttribute('fill', 'none')
  if (element.style === 'dashed') path.setAttribute('stroke-dasharray', `${element.width * 5} ${element.width * 2.5}`)
  if (element.style === 'dotted') path.setAttribute('stroke-dasharray', `${element.width * 1.8} ${element.width * 1.6}`)
  if (markerIds[0]) path.setAttribute('marker-start', `url(#${markerIds[0]})`)
  if (markerIds[1]) path.setAttribute('marker-end', `url(#${markerIds[1]})`)
  svg.appendChild(path)
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
}

const renderTable = (context: ElementRendererContext) => {
  const element = context.element as TableElementData
  const table = context.container.ownerDocument.createElement('table')
  table.className = 'pptist-player-table'
  table.style.width = '100%'
  table.style.height = '100%'
  table.style.borderCollapse = 'collapse'
  const colgroup = context.container.ownerDocument.createElement('colgroup')
  for (const width of element.colWidths || []) {
    const col = context.container.ownerDocument.createElement('col')
    col.style.width = `${width * 100}%`
    colgroup.appendChild(col)
  }
  table.appendChild(colgroup)
  for (const row of element.data || []) {
    const tr = context.container.ownerDocument.createElement('tr')
    for (const cell of row) {
      const td = context.container.ownerDocument.createElement('td')
      td.colSpan = cell.colspan || 1
      td.rowSpan = cell.rowspan || 1
      td.textContent = cell.text || ''
      td.style.minHeight = `${element.cellMinHeight || 20}px`
      td.style.border = outlineStyle(element.outline) || '1px solid #666'
      const style = cell.style || {}
      if (style.color) td.style.color = String(style.color)
      if (style.backcolor) td.style.background = String(style.backcolor)
      if (style.fontsize) td.style.fontSize = String(style.fontsize)
      if (style.fontname) td.style.fontFamily = String(style.fontname)
      if (style.align) td.style.textAlign = String(style.align)
      if (style.vAlign) td.style.verticalAlign = style.vAlign === 'middle' ? 'middle' : style.vAlign === 'bottom' ? 'bottom' : 'top'
      td.style.fontWeight = style.bold ? 'bold' : ''
      td.style.fontStyle = style.em ? 'italic' : ''
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
  svg.style.width = '100%'
  svg.style.height = '100%'
  const path = svgElement(svg.ownerDocument, 'path')
  path.setAttribute('d', element.path || '')
  path.setAttribute('fill', element.color || 'currentColor')
  path.setAttribute('stroke', element.color || 'currentColor')
  path.setAttribute('stroke-width', String(element.strokeWidth || 0))
  svg.appendChild(path)
  return svg
}

const renderMedia = (context: ElementRendererContext) => {
  const element = context.element as PlayerElement & { src?: string; poster?: string; autoplay?: boolean; loop?: boolean }
  const media = context.container.ownerDocument.createElement(element.type === 'video' ? 'video' : 'audio')
  media.src = element.src || ''
  media.controls = true
  media.autoplay = !!element.autoplay
  media.loop = !!element.loop
  if (element.type === 'video') {
    const video = media as HTMLVideoElement
    video.poster = element.poster || ''
    video.style.width = '100%'
    video.style.height = '100%'
  }
  return media
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
  const context: ElementRendererContext = {
    element,
    slide,
    presentation,
    container: root,
    sanitizeHtml,
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
      else if (element.link?.target) ownerDocument.defaultView?.open(element.link.target, '_blank', 'noopener,noreferrer')
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
