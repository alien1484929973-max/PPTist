export type TextMorphMode = 'byWord' | 'byChar'

export interface TextMorphTokenMatch {
  fromIndex: number
  toIndex: number
}

interface TextSegmentRecord {
  token: string
  rect: DOMRect
  style: TextStyleSnapshot
}

interface TextStyleSnapshot {
  color: string
  backgroundColor: string
  fontFamily: string
  fontSize: string
  fontStyle: string
  fontWeight: string
  letterSpacing: string
  lineHeight: string
  opacity: string
  textDecorationColor: string
  textDecorationLine: string
  textShadow: string
  visibility: string
}

export interface TextMorphAnimationRequest {
  node: HTMLElement
  keyframes: Keyframe[]
  timing: KeyframeAnimationOptions
}

export interface PreparedTextMorph {
  animations: TextMorphAnimationRequest[]
  start?: () => void
  cleanup: () => void
}

type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: 'grapheme' | 'word' },
) => { segment: (value: string) => Iterable<{ segment: string }> }

const segmenterConstructor = () => (
  Intl as unknown as { Segmenter?: SegmenterConstructor }
).Segmenter

/**
 * Split text the same way a presentation author perceives it. In particular,
 * emoji sequences and combined accents stay together instead of being split
 * into UTF-16 code units.
 */
export const segmentMorphText = (value: string, mode: TextMorphMode) => {
  const Segmenter = segmenterConstructor()
  if (Segmenter) {
    const segmenter = new Segmenter(undefined, {
      granularity: mode === 'byChar' ? 'grapheme' : 'word',
    })
    return Array.from(segmenter.segment(value), item => item.segment)
  }
  if (mode === 'byChar') return Array.from(value)
  return value.split(/(\s+|[，。！？、,.!?;；:：])/u).filter(Boolean)
}

/**
 * Stable LCS matching prevents repeated characters from jumping between
 * occurrences. Large text blocks use the same occurrence-order rule without
 * allocating an unbounded dynamic-programming matrix.
 */
export const matchTextMorphTokens = (from: string[], to: string[]): TextMorphTokenMatch[] => {
  if (!from.length || !to.length) return []
  if (from.length * to.length > 160_000) {
    const available = new Map<string, number[]>()
    from.forEach((token, index) => {
      const indexes = available.get(token) || []
      indexes.push(index)
      available.set(token, indexes)
    })
    const cursors = new Map<string, number>()
    let lastFromIndex = -1
    return to.flatMap((token, toIndex) => {
      const indexes = available.get(token)
      let cursor = cursors.get(token) || 0
      while (indexes && cursor < indexes.length && indexes[cursor] <= lastFromIndex) cursor += 1
      if (!indexes || cursor >= indexes.length) return []
      cursors.set(token, cursor + 1)
      lastFromIndex = indexes[cursor]
      return [{ fromIndex: lastFromIndex, toIndex }]
    })
  }

  const width = to.length + 1
  const scores = new Uint16Array((from.length + 1) * width)
  for (let fromIndex = from.length - 1; fromIndex >= 0; fromIndex--) {
    for (let toIndex = to.length - 1; toIndex >= 0; toIndex--) {
      const offset = fromIndex * width + toIndex
      scores[offset] = from[fromIndex] === to[toIndex]
        ? scores[(fromIndex + 1) * width + toIndex + 1] + 1
        : Math.max(scores[(fromIndex + 1) * width + toIndex], scores[offset + 1])
    }
  }

  const matches: TextMorphTokenMatch[] = []
  let fromIndex = 0
  let toIndex = 0
  while (fromIndex < from.length && toIndex < to.length) {
    if (from[fromIndex] === to[toIndex]) {
      matches.push({ fromIndex, toIndex })
      fromIndex += 1
      toIndex += 1
    }
    else if (scores[(fromIndex + 1) * width + toIndex] >= scores[fromIndex * width + toIndex + 1]) fromIndex += 1
    else toIndex += 1
  }
  return matches
}

const textStyleSnapshot = (view: Window, element: Element): TextStyleSnapshot => {
  const style = view.getComputedStyle(element)
  return {
    color: style.color,
    backgroundColor: style.backgroundColor,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontStyle: style.fontStyle,
    fontWeight: style.fontWeight,
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight,
    opacity: style.opacity,
    textDecorationColor: style.textDecorationColor,
    textDecorationLine: style.textDecorationLine,
    textShadow: style.textShadow,
    visibility: style.visibility,
  }
}

const applyTextStyle = (element: HTMLElement, style: TextStyleSnapshot) => {
  Object.assign(element.style, style)
}

const animationTextStyle = (style: TextStyleSnapshot): Keyframe => ({
  color: style.color,
  backgroundColor: style.backgroundColor,
  fontSize: style.fontSize,
  fontStyle: style.fontStyle,
  fontWeight: style.fontWeight,
  letterSpacing: style.letterSpacing,
  lineHeight: style.lineHeight,
  opacity: style.opacity,
  textDecorationColor: style.textDecorationColor,
  textShadow: style.textShadow,
})

const collectTextSegments = (container: HTMLElement, mode: TextMorphMode, view: Window) => {
  const document = container.ownerDocument
  const walker = document.createTreeWalker(container, 4)
  const textNodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(node as Text)

  const records: TextSegmentRecord[] = []
  for (const textNode of textNodes) {
    const segments = segmentMorphText(textNode.data, mode)
    if (!segments.length) continue
    let offset = 0
    for (const segment of segments) {
      const start = offset
      offset += segment.length
      if (!segment.trim() || !textNode.parentElement) continue
      const style = textStyleSnapshot(view, textNode.parentElement)
      if (style.visibility === 'hidden') continue
      const range = document.createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, offset)
      const rect = range.getBoundingClientRect()
      range.detach()
      if (!rect.width && !rect.height) continue
      records.push({ token: segment, rect, style })
    }
  }
  return records
}

const rootRotation = (root: HTMLElement) => {
  const match = root.style.transform.match(/rotate\((-?[\d.]+)deg\)/)
  return match ? Number(match[1]) : 0
}

const localRect = (rect: DOMRect, layer: HTMLElement) => {
  const layerRect = layer.getBoundingClientRect()
  const width = layer.clientWidth || Number.parseFloat(layer.ownerDocument.defaultView?.getComputedStyle(layer).width || '')
  const height = layer.clientHeight || Number.parseFloat(layer.ownerDocument.defaultView?.getComputedStyle(layer).height || '')
  if (!layerRect.width || !layerRect.height || !width || !height) return undefined
  const scaleX = layerRect.width / width
  const scaleY = layerRect.height / height
  return {
    left: (rect.left - layerRect.left) / scaleX,
    top: (rect.top - layerRect.top) / scaleY,
    width: rect.width / scaleX,
    height: rect.height / scaleY,
  }
}

const createGlyph = (
  overlay: HTMLElement,
  token: string,
  rect: NonNullable<ReturnType<typeof localRect>>,
  style: TextStyleSnapshot,
) => {
  const glyph = overlay.ownerDocument.createElement('span')
  glyph.dataset.pptistMorphGlyph = 'true'
  glyph.setAttribute('aria-hidden', 'true')
  glyph.textContent = token
  Object.assign(glyph.style, {
    position: 'absolute',
    display: 'block',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    margin: '0',
    padding: '0',
    border: '0',
    whiteSpace: 'pre',
    transformOrigin: 'left top',
    willChange: 'transform, opacity, color, font-size',
  })
  applyTextStyle(glyph, style)
  overlay.appendChild(glyph)
  return glyph
}

const createOverlay = (layer: HTMLElement, targetRoot: HTMLElement) => {
  const overlay = layer.ownerDocument.createElement('div')
  overlay.dataset.pptistTextMorphOverlay = 'true'
  overlay.setAttribute('aria-hidden', 'true')
  Object.assign(overlay.style, {
    position: 'absolute',
    inset: '0',
    overflow: 'visible',
    pointerEvents: 'none',
    zIndex: targetRoot.style.zIndex || '1',
  })
  layer.appendChild(overlay)
  return overlay
}

interface FlowControlPoint {
  x: number
  y: number
  dx: number
  dy: number
}

const numericStyle = (value: string, fallback = 0) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const drawTextRaster = (
  document: Document,
  records: TextSegmentRecord[],
  rects: Array<NonNullable<ReturnType<typeof localRect>>>,
  bounds: { left: number; top: number },
  width: number,
  height: number,
  scale: number,
) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return undefined
  context.clearRect(0, 0, width, height)
  context.textBaseline = 'alphabetic'
  context.textAlign = 'left'

  records.forEach((record, index) => {
    const rect = rects[index]
    const fontSize = Math.max(1, numericStyle(record.style.fontSize, 16) * scale)
    context.font = `${record.style.fontStyle} ${record.style.fontWeight} ${fontSize}px ${record.style.fontFamily}`
    context.fillStyle = record.style.color
    context.globalAlpha = Math.min(1, Math.max(0, numericStyle(record.style.opacity, 1)))
    const letterSpacing = record.style.letterSpacing === 'normal'
      ? '0px'
      : `${numericStyle(record.style.letterSpacing) * scale}px`
    ;(context as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = letterSpacing
    const metrics = context.measureText(record.token)
    const ascent = metrics.actualBoundingBoxAscent || fontSize * .8
    const descent = metrics.actualBoundingBoxDescent || fontSize * .2
    const inkHeight = ascent + descent
    const x = (rect.left - bounds.left) * scale
    const y = (rect.top - bounds.top) * scale + Math.max(0, (rect.height * scale - inkHeight) / 2) + ascent
    context.fillText(record.token, x, y)
    if (record.style.textDecorationLine.includes('underline')) {
      context.beginPath()
      context.strokeStyle = record.style.textDecorationColor || record.style.color
      context.lineWidth = Math.max(1, fontSize / 16)
      context.moveTo(x, y + Math.max(1, descent * .45))
      context.lineTo(x + metrics.width, y + Math.max(1, descent * .45))
      context.stroke()
    }
  })
  context.globalAlpha = 1
  return context.getImageData(0, 0, width, height)
}

const buildIntermediateFlowGrid = (
  width: number,
  height: number,
  points: FlowControlPoint[],
  progress: number,
) => {
  const step = 12
  const columns = Math.ceil(width / step) + 1
  const rows = Math.ceil(height / step) + 1
  const xFlow = new Float32Array(columns * rows)
  const yFlow = new Float32Array(columns * rows)
  if (!points.length) return { xFlow, yFlow, step, columns, rows }
  const averageX = points.reduce((sum, point) => sum + point.dx, 0) / points.length
  const averageY = points.reduce((sum, point) => sum + point.dy, 0) / points.length
  const sigma = Math.max(24, Math.min(180, Math.max(width, height) * .32))
  const denominator = 2 * sigma * sigma
  const globalWeight = .1

  for (let row = 0; row < rows; row++) {
    const y = Math.min(height - 1, row * step)
    for (let column = 0; column < columns; column++) {
      const x = Math.min(width - 1, column * step)
      let totalWeight = globalWeight
      let dx = averageX * globalWeight
      let dy = averageY * globalWeight
      for (const point of points) {
        const offsetX = x - (point.x + point.dx * progress)
        const offsetY = y - (point.y + point.dy * progress)
        const weight = Math.exp(-(offsetX * offsetX + offsetY * offsetY) / denominator)
        totalWeight += weight
        dx += point.dx * weight
        dy += point.dy * weight
      }
      const index = row * columns + column
      xFlow[index] = dx / totalWeight
      yFlow[index] = dy / totalWeight
    }
  }
  return { xFlow, yFlow, step, columns, rows }
}

const prepareOpticalFlowCanvas = (
  overlay: HTMLElement,
  sourceRecords: TextSegmentRecord[],
  targetRecords: TextSegmentRecord[],
  sourceRects: Array<NonNullable<ReturnType<typeof localRect>>>,
  targetRects: Array<NonNullable<ReturnType<typeof localRect>>>,
  matches: TextMorphTokenMatch[],
  timing: KeyframeAnimationOptions,
) => {
  const allRects = [...sourceRects, ...targetRects]
  if (!allRects.length) return undefined
  const padding = 10
  const left = Math.min(...allRects.map(rect => rect.left)) - padding
  const top = Math.min(...allRects.map(rect => rect.top)) - padding
  const right = Math.max(...allRects.map(rect => rect.left + rect.width)) + padding
  const bottom = Math.max(...allRects.map(rect => rect.top + rect.height)) + padding
  const logicalWidth = Math.max(1, right - left)
  const logicalHeight = Math.max(1, bottom - top)
  const maxPixels = 220_000
  const scale = Math.max(.4, Math.min(1.5, Math.sqrt(maxPixels / (logicalWidth * logicalHeight))))
  const width = Math.max(1, Math.ceil(logicalWidth * scale))
  const height = Math.max(1, Math.ceil(logicalHeight * scale))
  if (width * height > maxPixels * 1.15) return undefined

  const bounds = { left, top }
  const matchedSourceIndexes = new Set(matches.map(match => match.fromIndex))
  const matchedTargetIndexes = new Set(matches.map(match => match.toIndex))
  const matchedSourceRecords = matches.map(match => sourceRecords[match.fromIndex])
  const matchedSourceRects = matches.map(match => sourceRects[match.fromIndex])
  const matchedTargetRecords = matches.map(match => targetRecords[match.toIndex])
  const matchedTargetRects = matches.map(match => targetRects[match.toIndex])
  const recoloredSourceRecords = matches.map(match => ({
    ...sourceRecords[match.fromIndex],
    style: {
      ...sourceRecords[match.fromIndex].style,
      color: targetRecords[match.toIndex].style.color,
      opacity: targetRecords[match.toIndex].style.opacity,
      textDecorationColor: targetRecords[match.toIndex].style.textDecorationColor,
    },
  }))
  const unmatchedSourceRecords = sourceRecords.filter((_, index) => !matchedSourceIndexes.has(index))
  const unmatchedSourceRects = sourceRects.filter((_, index) => !matchedSourceIndexes.has(index))
  const unmatchedTargetRecords = targetRecords.filter((_, index) => !matchedTargetIndexes.has(index))
  const unmatchedTargetRects = targetRects.filter((_, index) => !matchedTargetIndexes.has(index))
  const matchedSourceImage = drawTextRaster(overlay.ownerDocument, matchedSourceRecords, matchedSourceRects, bounds, width, height, scale)
  const recoloredSourceImage = drawTextRaster(overlay.ownerDocument, recoloredSourceRecords, matchedSourceRects, bounds, width, height, scale)
  const matchedTargetImage = drawTextRaster(overlay.ownerDocument, matchedTargetRecords, matchedTargetRects, bounds, width, height, scale)
  const unmatchedSourceImage = drawTextRaster(overlay.ownerDocument, unmatchedSourceRecords, unmatchedSourceRects, bounds, width, height, scale)
  const unmatchedTargetImage = drawTextRaster(overlay.ownerDocument, unmatchedTargetRecords, unmatchedTargetRects, bounds, width, height, scale)
  if (!matchedSourceImage || !recoloredSourceImage || !matchedTargetImage || !unmatchedSourceImage || !unmatchedTargetImage) return undefined

  const stride = Math.max(1, Math.ceil(matches.length / 32))
  const controls = matches.filter((_, index) => index % stride === 0).flatMap(match => {
    const from = sourceRects[match.fromIndex]
    const to = targetRects[match.toIndex]
    const fromLeft = (from.left - left) * scale
    const fromTop = (from.top - top) * scale
    const fromRight = fromLeft + from.width * scale
    const fromBottom = fromTop + from.height * scale
    const toLeft = (to.left - left) * scale
    const toTop = (to.top - top) * scale
    const toRight = toLeft + to.width * scale
    const toBottom = toTop + to.height * scale
    const point = (x: number, y: number, targetX: number, targetY: number): FlowControlPoint => ({
      x,
      y,
      dx: targetX - x,
      dy: targetY - y,
    })
    return [
      point((fromLeft + fromRight) / 2, (fromTop + fromBottom) / 2, (toLeft + toRight) / 2, (toTop + toBottom) / 2),
      point(fromLeft, fromTop, toLeft, toTop),
      point(fromRight, fromTop, toRight, toTop),
      point(fromLeft, fromBottom, toLeft, toBottom),
      point(fromRight, fromBottom, toRight, toBottom),
    ]
  })
  const canvas = overlay.ownerDocument.createElement('canvas')
  canvas.dataset.pptistMorphFlowCanvas = 'true'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.width = width
  canvas.height = height
  Object.assign(canvas.style, {
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    width: `${logicalWidth}px`,
    height: `${logicalHeight}px`,
    pointerEvents: 'none',
  })
  overlay.dataset.pptistTextMorphMode = 'optical-flow'
  overlay.appendChild(canvas)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    canvas.remove()
    return undefined
  }
  const output = context.createImageData(width, height)
  const matchedSourceData = matchedSourceImage.data
  const recoloredSourceData = recoloredSourceImage.data
  const matchedTargetData = matchedTargetImage.data
  const unmatchedSourceData = unmatchedSourceImage.data
  const unmatchedTargetData = unmatchedTargetImage.data
  const outputData = output.data

  const render = (linearProgress: number) => {
    const progress = linearProgress * linearProgress * linearProgress * (linearProgress * (linearProgress * 6 - 15) + 10)
    const flow = buildIntermediateFlowGrid(width, height, controls, progress)
    const lateLinear = Math.min(1, Math.max(0, (progress - .78) / .22))
    const lateTargetMix = lateLinear * lateLinear * (3 - 2 * lateLinear)
    const matchedSourceWeight = (1 - lateTargetMix) * (1 - progress)
    const matchedColorWeight = (1 - lateTargetMix) * progress
    const matchedTargetWeight = lateTargetMix
    const unmatchedSourceWeight = 1 - progress
    const unmatchedTargetWeight = progress
    for (let y = 0; y < height; y++) {
      const gridY = Math.min(flow.rows - 1, y / flow.step)
      const gridTop = Math.floor(gridY)
      const gridBottom = Math.min(flow.rows - 1, gridTop + 1)
      const yProgress = gridY - gridTop
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        const gridX = Math.min(flow.columns - 1, x / flow.step)
        const gridLeft = Math.floor(gridX)
        const gridRight = Math.min(flow.columns - 1, gridLeft + 1)
        const xProgress = gridX - gridLeft
        const topLeft = gridTop * flow.columns + gridLeft
        const topRight = gridTop * flow.columns + gridRight
        const bottomLeft = gridBottom * flow.columns + gridLeft
        const bottomRight = gridBottom * flow.columns + gridRight
        const topFlowX = flow.xFlow[topLeft] + (flow.xFlow[topRight] - flow.xFlow[topLeft]) * xProgress
        const bottomFlowX = flow.xFlow[bottomLeft] + (flow.xFlow[bottomRight] - flow.xFlow[bottomLeft]) * xProgress
        const topFlowY = flow.yFlow[topLeft] + (flow.yFlow[topRight] - flow.yFlow[topLeft]) * xProgress
        const bottomFlowY = flow.yFlow[bottomLeft] + (flow.yFlow[bottomRight] - flow.yFlow[bottomLeft]) * xProgress
        const flowX = topFlowX + (bottomFlowX - topFlowX) * yProgress
        const flowY = topFlowY + (bottomFlowY - topFlowY) * yProgress
        const sourceX = Math.round(x - progress * flowX)
        const sourceY = Math.round(y - progress * flowY)
        const targetX = Math.round(x + (1 - progress) * flowX)
        const targetY = Math.round(y + (1 - progress) * flowY)
        const sourceOffset = sourceX >= 0 && sourceX < width && sourceY >= 0 && sourceY < height
          ? (sourceY * width + sourceX) * 4
          : -1
        const targetOffset = targetX >= 0 && targetX < width && targetY >= 0 && targetY < height
          ? (targetY * width + targetX) * 4
          : -1
        const destination = index * 4
        const matchedSourceAlpha = sourceOffset >= 0 ? matchedSourceData[sourceOffset + 3] / 255 * matchedSourceWeight : 0
        const matchedColorAlpha = sourceOffset >= 0 ? recoloredSourceData[sourceOffset + 3] / 255 * matchedColorWeight : 0
        const matchedTargetAlpha = targetOffset >= 0 ? matchedTargetData[targetOffset + 3] / 255 * matchedTargetWeight : 0
        const unmatchedSourceAlpha = sourceOffset >= 0 ? unmatchedSourceData[sourceOffset + 3] / 255 * unmatchedSourceWeight : 0
        const unmatchedTargetAlpha = targetOffset >= 0 ? unmatchedTargetData[targetOffset + 3] / 255 * unmatchedTargetWeight : 0
        const alpha = matchedSourceAlpha + matchedColorAlpha + matchedTargetAlpha + unmatchedSourceAlpha + unmatchedTargetAlpha
        if (alpha <= .0001) {
          outputData[destination] = 0
          outputData[destination + 1] = 0
          outputData[destination + 2] = 0
          outputData[destination + 3] = 0
          continue
        }
        outputData[destination] = Math.round((
          (sourceOffset >= 0 ? matchedSourceData[sourceOffset] : 0) * matchedSourceAlpha +
          (sourceOffset >= 0 ? recoloredSourceData[sourceOffset] : 0) * matchedColorAlpha +
          (targetOffset >= 0 ? matchedTargetData[targetOffset] : 0) * matchedTargetAlpha +
          (sourceOffset >= 0 ? unmatchedSourceData[sourceOffset] : 0) * unmatchedSourceAlpha +
          (targetOffset >= 0 ? unmatchedTargetData[targetOffset] : 0) * unmatchedTargetAlpha
        ) / alpha)
        outputData[destination + 1] = Math.round((
          (sourceOffset >= 0 ? matchedSourceData[sourceOffset + 1] : 0) * matchedSourceAlpha +
          (sourceOffset >= 0 ? recoloredSourceData[sourceOffset + 1] : 0) * matchedColorAlpha +
          (targetOffset >= 0 ? matchedTargetData[targetOffset + 1] : 0) * matchedTargetAlpha +
          (sourceOffset >= 0 ? unmatchedSourceData[sourceOffset + 1] : 0) * unmatchedSourceAlpha +
          (targetOffset >= 0 ? unmatchedTargetData[targetOffset + 1] : 0) * unmatchedTargetAlpha
        ) / alpha)
        outputData[destination + 2] = Math.round((
          (sourceOffset >= 0 ? matchedSourceData[sourceOffset + 2] : 0) * matchedSourceAlpha +
          (sourceOffset >= 0 ? recoloredSourceData[sourceOffset + 2] : 0) * matchedColorAlpha +
          (targetOffset >= 0 ? matchedTargetData[targetOffset + 2] : 0) * matchedTargetAlpha +
          (sourceOffset >= 0 ? unmatchedSourceData[sourceOffset + 2] : 0) * unmatchedSourceAlpha +
          (targetOffset >= 0 ? unmatchedTargetData[targetOffset + 2] : 0) * unmatchedTargetAlpha
        ) / alpha)
        outputData[destination + 3] = Math.round(Math.min(1, alpha) * 255)
      }
    }
    context.putImageData(output, 0, 0)
  }

  render(0)
  const view = overlay.ownerDocument.defaultView
  let frame = 0
  let stopped = false
  const start = () => {
    if (!view || stopped) return
    const delay = Math.max(0, Number(timing.delay) || 0)
    const duration = Math.max(1, Number(timing.duration) || 700)
    const startedAt = view.performance.now() + delay
    const tick = (now: number) => {
      if (stopped) return
      const progress = Math.min(1, Math.max(0, (now - startedAt) / duration))
      render(progress)
      if (progress < 1) frame = view.requestAnimationFrame(tick)
    }
    frame = view.requestAnimationFrame(tick)
  }
  const cancel = () => {
    stopped = true
    if (view && frame) view.cancelAnimationFrame(frame)
  }
  return { canvas, start, cancel }
}

/**
 * Build a character/word Morph overlay without modifying the rich-text DOM.
 * Range-based measurement preserves kerning and line layout, which avoids the
 * start/end jump caused by temporarily wrapping every character in a span.
 */
export const prepareTextMorph = (
  fromRoot: HTMLElement,
  toRoot: HTMLElement,
  layer: HTMLElement,
  mode: TextMorphMode,
  timing: KeyframeAnimationOptions,
): PreparedTextMorph | undefined => {
  const document = toRoot.ownerDocument
  const view = document.defaultView
  if (!view || /HappyDOM|jsdom/i.test(view.navigator.userAgent)) return undefined
  if (Math.abs(rootRotation(fromRoot)) > .01 || Math.abs(rootRotation(toRoot)) > .01) return undefined
  const fromText = fromRoot.querySelector<HTMLElement>('.pptist-player-text,.pptist-player-shape-text')
  const toText = toRoot.querySelector<HTMLElement>('.pptist-player-text,.pptist-player-shape-text')
  if (!fromText || !toText) return undefined

  const source = collectTextSegments(fromText, mode, view)
  const target = collectTextSegments(toText, mode, view)
  if (!source.length && !target.length) return undefined

  const sourceRects = source.map(record => localRect(record.rect, layer))
  const targetRects = target.map(record => localRect(record.rect, layer))
  if (sourceRects.some(rect => !rect) || targetRects.some(rect => !rect)) {
    return undefined
  }

  const overlay = createOverlay(layer, toRoot)
  const animations: TextMorphAnimationRequest[] = []
  const matches = matchTextMorphTokens(
    source.map(record => record.token),
    target.map(record => record.token),
  )
  const opticalFlow = source.map(record => record.token).join('') !== target.map(record => record.token).join('')
    ? prepareOpticalFlowCanvas(
      overlay,
      source,
      target,
      sourceRects as Array<NonNullable<ReturnType<typeof localRect>>>,
      targetRects as Array<NonNullable<ReturnType<typeof localRect>>>,
      matches,
      timing,
    )
    : undefined
  fromText.classList.add('pptist-morph-text-hidden')
  toText.classList.add('pptist-morph-text-hidden')
  if (opticalFlow) {
    animations.push({
      node: opticalFlow.canvas,
      keyframes: [{ opacity: 1 }, { opacity: 1 }],
      timing,
    })
    let cleaned = false
    return {
      animations,
      start: opticalFlow.start,
      cleanup: () => {
        if (cleaned) return
        cleaned = true
        opticalFlow.cancel()
        fromText.classList.remove('pptist-morph-text-hidden')
        toText.classList.remove('pptist-morph-text-hidden')
        overlay.remove()
      },
    }
  }

  const matchedFrom = new Set(matches.map(match => match.fromIndex))
  const matchedTo = new Set(matches.map(match => match.toIndex))
  const easing = timing.easing || 'cubic-bezier(0.33, 0, 0.15, 1)'

  for (const match of matches) {
    const from = source[match.fromIndex]
    const to = target[match.toIndex]
    const fromRect = sourceRects[match.fromIndex]!
    const toRect = targetRects[match.toIndex]!
    const translateFrom = `translate(${fromRect.left - toRect.left}px, ${fromRect.top - toRect.top}px)`
    if (from.style.fontFamily === to.style.fontFamily) {
      const glyph = createGlyph(overlay, to.token, toRect, to.style)
      animations.push({
        node: glyph,
        keyframes: [
          { ...animationTextStyle(from.style), transform: translateFrom },
          { ...animationTextStyle(to.style), transform: 'translate(0, 0)' },
        ],
        timing: { ...timing, easing },
      })
    }
    else {
      const sourceGlyph = createGlyph(overlay, from.token, fromRect, from.style)
      const targetGlyph = createGlyph(overlay, to.token, toRect, to.style)
      animations.push({
        node: sourceGlyph,
        keyframes: [
          { transform: 'translate(0, 0)', opacity: 1 },
          { transform: `translate(${toRect.left - fromRect.left}px, ${toRect.top - fromRect.top}px)`, opacity: 0 },
        ],
        timing: { ...timing, easing },
      }, {
        node: targetGlyph,
        keyframes: [
          { transform: translateFrom, opacity: 0 },
          { transform: 'translate(0, 0)', opacity: 1 },
        ],
        timing: { ...timing, easing },
      })
    }
  }

  source.forEach((record, index) => {
    if (matchedFrom.has(index)) return
    const rect = sourceRects[index]!
    const glyph = createGlyph(overlay, record.token, rect, record.style)
    animations.push({
      node: glyph,
      keyframes: [
        { opacity: 1, transform: 'translateY(0)', offset: 0 },
        { opacity: 0, transform: 'translateY(-.08em)', offset: .62 },
        { opacity: 0, transform: 'translateY(-.08em)', offset: 1 },
      ],
      timing: { ...timing, easing },
    })
  })
  target.forEach((record, index) => {
    if (matchedTo.has(index)) return
    const rect = targetRects[index]!
    const glyph = createGlyph(overlay, record.token, rect, record.style)
    animations.push({
      node: glyph,
      keyframes: [
        { opacity: 0, transform: 'translateY(.08em)', offset: 0 },
        { opacity: 0, transform: 'translateY(.08em)', offset: .25 },
        { opacity: 1, transform: 'translateY(0)', offset: 1 },
      ],
      timing: { ...timing, easing },
    })
  })

  let cleaned = false
  return {
    animations,
    cleanup: () => {
      if (cleaned) return
      cleaned = true
      fromText.classList.remove('pptist-morph-text-hidden')
      toText.classList.remove('pptist-morph-text-hidden')
      overlay.remove()
    },
  }
}
