import type { PlayerDocument, PlayerElementType } from './types'
import { timelineForSlide } from './timeline'

export type CompatibilityStatus = 'supported' | 'partial' | 'adapter' | 'unsupported'

export interface CompatibilityMatrixEntry {
  id: string
  feature: string
  status: CompatibilityStatus
  baseline: string
  notes: string
}

/**
 * Executable compatibility contract. Tests assert required rows stay present;
 * releases update a row only when the related regression fixture passes.
 */
export const PRESENTATION_PLAYER_COMPATIBILITY: readonly CompatibilityMatrixEntry[] = [
  { id: 'text-rich-html', feature: '文本富文本与排版', status: 'supported', baseline: 'BaseTextElement', notes: 'HTML、列表、缩进、上下标、代码、引用、字距、行距、段距、竖排和垂直对齐。' },
  { id: 'fonts', feature: '字体与缺失回退', status: 'supported', baseline: 'BaseTextElement/theme', notes: '使用 CSS 字体栈；字体文件由宿主加载，缺失时由浏览器回退。' },
  { id: 'image-effects', feature: '图片裁剪/滤镜/蒙版/翻转/阴影', status: 'supported', baseline: 'BaseImageElement', notes: '全部编辑器裁剪形状共享同一映射，并支持裁剪范围、圆角、滤镜、翻转、蒙版和阴影。' },
  { id: 'shapes', feature: '形状渐变/图案/边框/文字', status: 'supported', baseline: 'BaseShapeElement', notes: 'SVG 路径、径向/线性渐变、图案、翻转、阴影和富文本。' },
  { id: 'lines', feature: '线条与端点', status: 'supported', baseline: 'BaseLineElement', notes: '直线、折线、二次/三次曲线、虚线、箭头和圆点。' },
  { id: 'tables', feature: '表格', status: 'supported', baseline: 'StaticTable', notes: '合并单元格、列宽、主题、边框和字符样式。' },
  { id: 'charts', feature: '图表', status: 'supported', baseline: 'Chart/ECharts SVG', notes: '内置 bar/column/line/area/pie/ring/radar/scatter；与编辑器共享选项生成器。' },
  { id: 'latex', feature: 'LaTeX', status: 'supported', baseline: 'BaseLatexElement', notes: '按保存的 SVG path 渲染，无需运行时公式引擎。' },
  { id: 'media', feature: '音频和视频', status: 'supported', baseline: 'ScreenVideo/AudioElement', notes: '原生媒体控件、poster、autoplay 与 loop；受浏览器自动播放策略约束。' },
  { id: 'groups', feature: '组合', status: 'supported', baseline: 'DOM player grouped render', notes: '同 groupId 共享动画目标并保持成员层级。' },
  { id: 'links', feature: '网页和页内链接', status: 'supported', baseline: 'DOM player element links', notes: '网页使用 noopener/noreferrer，新页链接按 slide id 跳转。' },
  { id: 'scoped-animation', feature: '段落/字符动画', status: 'supported', baseline: 'presentation-core DOM targets', notes: '目标拆分和清理由共享动画核心提供。' },
  { id: 'motion-path', feature: '运动路径', status: 'supported', baseline: 'presentation-core motionPath', notes: '共享 SVG 路径采样、重复、反向和 easing。' },
  { id: 'wipe-and-effects', feature: '擦除及元素动画', status: 'supported', baseline: 'presentation-core effects', notes: '规范化效果和 Web Animations 计划同源；无法映射的旧效果会安全落到最终状态并由审计报告标记。' },
  { id: 'slide-transitions', feature: '页面切换', status: 'supported', baseline: 'DOM player transition engine', notes: '支持 no/fade/slideX/slideY/3D/rotate/scale 系列及 PPTX transition 回退映射。' },
  { id: 'morph', feature: '平滑 Morph', status: 'supported', baseline: 'presentation-core morph', notes: 'DOM 播放器使用共享核心的候选生成、对象匹配及视觉交叉淡化规则。' },
  { id: 'sanitize-html', feature: '不可信 HTML 清理', status: 'adapter', baseline: 'PlayerOptions.sanitizeHtml', notes: '宿主必须提供清理函数；默认仅适用于可信编辑器数据。' },
] as const

const BUILT_IN_ELEMENTS = new Set<PlayerElementType>([
  'text', 'image', 'shape', 'line', 'table', 'latex', 'video', 'audio', 'chart',
])
const SUPPORTED_TRANSITIONS = new Set(['none', 'cut', 'fade', 'dissolve', 'push', 'wipe', 'cover', 'uncover', 'pull', 'morph'])

export interface CompatibilityIssue {
  featureId: string
  severity: 'warning' | 'blocking'
  slideId?: string
  elementId?: string
  message: string
}

export interface CompatibilityReport {
  compatible: boolean
  issues: CompatibilityIssue[]
}

/** Audit a real document before opting it into the dependency renderer. */
export const analyzePresentationCompatibility = (presentation: PlayerDocument): CompatibilityReport => {
  const issues: CompatibilityIssue[] = []
  for (const slide of presentation.slides) {
    for (const element of slide.elements) {
      if (!BUILT_IN_ELEMENTS.has(element.type)) {
        issues.push({
          featureId: 'custom-element',
          severity: 'blocking',
          slideId: slide.id,
          elementId: element.id,
          message: `Element type "${element.type}" requires a custom renderer.`,
        })
      }
    }
    const transition = slide.transition
    if (transition?.type && !SUPPORTED_TRANSITIONS.has(transition.type)) {
      issues.push({
        featureId: 'slide-transitions',
        severity: 'warning',
        slideId: slide.id,
        message: `Slide transition "${transition.type}" uses the reliable fade fallback.`,
      })
    }
    for (const animation of timelineForSlide(slide).animations) {
      if (animation.effect.compatibility === 'unsupported' || !animation.effect.canonical) {
        issues.push({
          featureId: 'wipe-and-effects',
          severity: 'warning',
          slideId: slide.id,
          message: `Animation "${animation.id}" uses a fallback final state.`,
        })
      }
    }
  }
  return { compatible: !issues.some(issue => issue.severity === 'blocking'), issues }
}
