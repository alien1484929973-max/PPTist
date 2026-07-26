import { PRESENTATION_IMAGE_CLIP_PATHS } from 'pptist-presentation-player'

export const enum ClipPathTypes {
  RECT = 'rect',
  ELLIPSE = 'ellipse',
  POLYGON = 'polygon',
}

export const enum ClipPaths {
  RECT = 'rect',
  ROUNDRECT = 'roundRect',
  ELLIPSE = 'ellipse',
  TRIANGLE = 'triangle',
  PENTAGON = 'pentagon',
  RHOMBUS = 'rhombus',
  STAR = 'star',
}

interface ClipPath {
  [key: string]: {
    name: string
    type: ClipPathTypes
    style: string
    radius?: string
    createPath?: (width: number, height: number) => string
  }
}

export const CLIPPATHS: ClipPath = {
  rect: {
    name: '矩形',
    type: ClipPathTypes.RECT,
    radius: '0',
    style: PRESENTATION_IMAGE_CLIP_PATHS.rect,
  },
  snip1Rect: {
    name: '矩形2',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.snip1Rect,
    createPath: (width: number, height: number) => {
      return `M 0 0 L ${width * 0.8} 0 L ${width} ${height * 0.2} L ${width} ${height} L 0 ${height} Z`
    },
  },
  snip2DiagRect: {
    name: '矩形3',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.snip2DiagRect,
    createPath: (width: number, height: number) => {
      return `M 0 0 L ${width * 0.8} 0 L ${width} ${height * 0.2} L ${width} ${height} L ${width * 0.2} ${height} L 0 ${height * 0.8} Z`
    },
  },
  roundRect: {
    name: '圆角矩形',
    type: ClipPathTypes.RECT,
    radius: '10px',
    style: PRESENTATION_IMAGE_CLIP_PATHS.roundRect,
  },
  ellipse: {
    name: '圆形',
    type: ClipPathTypes.ELLIPSE,
    style: PRESENTATION_IMAGE_CLIP_PATHS.ellipse,
  },
  triangle: {
    name: '三角形',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.triangle,
    createPath: (width: number, height: number) => {
      return `M ${width * 0.5} 0 L 0 ${height} L ${width} ${height} Z`
    },
  },
  rtTriangle: {
    name: '直角三角形',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.rtTriangle,
    createPath: (width: number, height: number) => {
      return `M 0 0 L 0 ${height} L ${width} ${height} Z`
    },
  },
  triangleReverse: {
    name: '倒三角形',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.triangleReverse,
    createPath: (width: number, height: number) => {
      return `M ${width * 0.5} ${height} L 0 0 L ${width} 0 Z`
    },
  },
  diamond: {
    name: '菱形',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.diamond,
    createPath: (width: number, height: number) => {
      return `M ${width * 0.5} 0 L ${width} ${height * 0.5} L ${width * 0.5} ${height} L 0 ${height * 0.5} Z`
    },
  },
  pentagon: {
    name: '五边形',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.pentagon,
    createPath: (width: number, height: number) => {
      return `M ${width * 0.5} 0 L ${width} ${0.38 * height} L ${0.82 * width} ${height} L ${0.18 * width} ${height} L 0 ${0.38 * height} Z`
    },
  },
  hexagon: {
    name: '六边形',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.hexagon,
    createPath: (width: number, height: number) => {
      return `M ${width * 0.2} 0 L ${width * 0.8} 0 L ${width} ${height * 0.5} L ${width * 0.8} ${height} L ${width * 0.2} ${height} L 0 ${height * 0.5} Z`
    },
  },
  heptagon: {
    name: '七边形',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.heptagon,
    createPath: (width: number, height: number) => {
      return `M ${width * 0.5} 0 L ${width * 0.9} ${height * 0.2} L ${width} ${height * 0.6} L ${width * 0.75} ${height} L ${width * 0.25} ${height} L 0 ${height * 0.6} L ${width * 0.1} ${height * 0.2} Z`
    },
  },
  octagon: {
    name: '八边形',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.octagon,
    createPath: (width: number, height: number) => {
      return `M ${width * 0.3} 0 L ${width * 0.7} 0 L ${width} ${height * 0.3} L ${width} ${height * 0.7} L ${width * 0.7} ${height} L ${width * 0.3} ${height} L 0 ${height * 0.7} L 0 ${height * 0.3} Z`
    },
  },
  chevron: {
    name: '人字形',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.chevron,
    createPath: (width: number, height: number) => {
      return `M ${width * 0.75} 0 L ${width} ${height * 0.5} L ${width * 0.75} ${height} L 0 ${height} L ${width * 0.25} ${height * 0.5} L 0 0 Z`
    },
  },
  homePlate: {
    name: '点',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.homePlate,
    createPath: (width: number, height: number) => {
      return `M 0 0 L ${width * 0.75} 0 L ${width} ${height * 0.5} L ${width * 0.75} ${height} L 0 ${height} Z`
    },
  },
  rightArrow: {
    name: '箭头',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.rightArrow,
    createPath: (width: number, height: number) => {
      return `M 0 ${height * 0.2} L ${width * 0.6} ${height * 0.2} L ${width * 0.6} 0 L ${width} ${height * 0.5} L ${width * 0.6} ${height} L ${width * 0.6} ${height * 0.8} L 0 ${height * 0.8} Z`
    },
  },
  parallelogram: {
    name: '平行四边形',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.parallelogram,
    createPath: (width: number, height: number) => {
      return `M ${width * 0.3} 0 L ${width} 0 L ${width * 0.7} ${height} L 0 ${height} Z`
    },
  },
  parallelogramReverse: {
    name: '反平行四边形',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.parallelogramReverse,
    createPath: (width: number, height: number) => {
      return `M ${width * 0.3} ${height} L ${width} ${height} L ${width * 0.7} 0 L 0 0 Z`
    },
  },
  trapezoid: {
    name: '梯形',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.trapezoid,
    createPath: (width: number, height: number) => {
      return `M ${width * 0.25} 0 L ${width * 0.75} 0 L ${width} ${height} L 0 ${height} Z`
    },
  },
  trapezoidReverse: {
    name: '倒梯形',
    type: ClipPathTypes.POLYGON,
    style: PRESENTATION_IMAGE_CLIP_PATHS.trapezoidReverse,
    createPath: (width: number, height: number) => {
      return `M 0 0 L ${width} 0 L ${width * 0.75} ${height} L ${width * 0.25} ${height} Z`
    },
  },
}
