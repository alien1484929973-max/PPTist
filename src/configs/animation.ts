import {
  defaultDirectionForEffect,
  normalizeAnimationEffectId,
  resolveAnimationDirection,
  supportedDirectionsForEffect,
  type AnimationDirection,
} from '@pptist/presentation-core'
import type { AnimationType, PPTAnimation, TurningMode } from '@/types/slides'

export const ANIMATION_DEFAULT_DURATION = 1000
export const ANIMATION_DEFAULT_TRIGGER = 'click'
export const ANIMATION_CLASS_PREFIX = 'animate__'

interface ElementAnimationOption {
  name: string
  value: string
}

interface ElementAnimationGroup {
  type: string
  name: string
  children: ElementAnimationOption[]
}

// Effects are intentionally listed once. Direction belongs to Effect Options
// in the animation pane, matching PowerPoint instead of multiplying entries.
export const ENTER_ANIMATIONS: ElementAnimationGroup[] = [
  {
    type: 'basic',
    name: '基本型',
    children: [
      { name: '出现', value: 'appear' },
      { name: '淡入', value: 'fadeIn' },
    ],
  },
  {
    type: 'motion',
    name: '动作型',
    children: [
      { name: '飞入', value: 'flyIn' },
      { name: '浮入', value: 'floatIn' },
      { name: '实心擦除', value: 'wipeIn' },
    ],
  },
  {
    type: 'accent',
    name: '强调型',
    children: [
      { name: '缩放', value: 'zoomIn' },
      { name: '弹跳', value: 'bounceIn' },
    ],
  },
]

export const EXIT_ANIMATIONS: ElementAnimationGroup[] = [
  {
    type: 'basic',
    name: '基本型',
    children: [
      { name: '消失', value: 'disappear' },
      { name: '淡出', value: 'fadeOut' },
    ],
  },
  {
    type: 'motion',
    name: '动作型',
    children: [
      { name: '飞出', value: 'flyOut' },
      { name: '浮出', value: 'floatOut' },
      { name: '实心擦除', value: 'wipeOut' },
    ],
  },
  {
    type: 'accent',
    name: '强调型',
    children: [
      { name: '缩放', value: 'zoomOut' },
      { name: '弹跳', value: 'bounceOut' },
    ],
  },
]

export const ATTENTION_ANIMATIONS: ElementAnimationGroup[] = [
  {
    type: 'emphasis',
    name: '强调效果',
    children: [
      { name: '脉冲', value: 'pulse' },
      { name: '旋转', value: 'spin' },
      { name: '放大', value: 'grow' },
      { name: '缩小', value: 'shrink' },
      { name: '透明', value: 'transparency' },
      { name: '闪烁', value: 'blink' },
      { name: '跷跷板', value: 'teeter' },
    ],
  },
]

const EFFECT_LABELS: Record<string, string> = {
  motionPath: '运动路径',
  appear: '出现',
  disappear: '消失',
  fadeIn: '淡入',
  fadeOut: '淡出',
  flyIn: '飞入',
  flyOut: '飞出',
  floatIn: '浮入',
  floatOut: '浮出',
  wipeIn: '实心擦除',
  wipeOut: '实心擦除',
  zoomIn: '缩放',
  zoomOut: '缩放',
  bounceIn: '弹跳',
  bounceOut: '弹跳',
  bounce: '弹跳',
  pulse: '脉冲',
  spin: '旋转',
  grow: '放大',
  shrink: '缩小',
  transparency: '透明',
  blink: '闪烁',
  teeter: '跷跷板',
  flash: '闪烁',
  shakeX: '左右摇摆',
  shakeY: '上下摇摆',
  headShake: '摇头',
  swing: '摆动',
  wobble: '晃动',
  tada: '强调',
  jello: '果冻',
  rubberBand: '弹性',
  heartBeat: '心跳',
}

const LEGACY_EFFECT_LABELS: Array<[RegExp, string]> = [
  [/^rotate(In|Out)/, '旋转'],
  [/^slide(In|Out)/, '滑动'],
  [/^flip(In|Out)/, '翻转'],
  [/^back(In|Out)/, '缩放滑动'],
  [/^lightSpeed(In|Out)/, '快速飞行'],
  [/^(shake|headShake|swing|wobble|tada|jello)/, '摇摆'],
  [/^(flash|heartBeat|rubberBand)$/, '强调'],
]

export const getAnimationEffectLabel = (effect: string, type: AnimationType) => {
  const normalized = normalizeAnimationEffectId(effect, type)
  if (EFFECT_LABELS[normalized]) return EFFECT_LABELS[normalized]
  return LEGACY_EFFECT_LABELS.find(([pattern]) => pattern.test(effect))?.[1] || effect
}

const FROM_DIRECTION_LABELS: Record<AnimationDirection, string> = {
  left: '自左侧',
  right: '自右侧',
  up: '自顶部',
  down: '自底部',
  topLeft: '自左上方',
  topRight: '自右上方',
  bottomLeft: '自左下方',
  bottomRight: '自右下方',
}

const TO_DIRECTION_LABELS: Record<AnimationDirection, string> = {
  left: '向左侧',
  right: '向右侧',
  up: '向顶部',
  down: '向底部',
  topLeft: '向左上方',
  topRight: '向右上方',
  bottomLeft: '向左下方',
  bottomRight: '向右下方',
}

export const getAnimationDirection = (animation: Pick<PPTAnimation, 'effect' | 'type' | 'direction'>) => {
  const supported = supportedDirectionsForEffect(animation.effect, animation.type)
  const resolved = resolveAnimationDirection(animation.effect, animation.type, animation.direction)
  if (resolved && supported.includes(resolved)) return resolved
  const defaultDirection = defaultDirectionForEffect(animation.effect, animation.type)
  return defaultDirection && supported.includes(defaultDirection) ? defaultDirection : supported[0]
}

export const getAnimationDirectionOptions = (animation: Pick<PPTAnimation, 'effect' | 'type' | 'direction'>) => {
  const labels = animation.type === 'out' ? TO_DIRECTION_LABELS : FROM_DIRECTION_LABELS
  const supported = supportedDirectionsForEffect(animation.effect, animation.type)
  return supported.map(direction => ({
    label: labels[direction],
    value: direction,
  }))
}

export const getAnimationDirectionLabel = (animation: Pick<PPTAnimation, 'effect' | 'type' | 'direction'>) => {
  const direction = getAnimationDirection(animation)
  if (!direction || !supportedDirectionsForEffect(animation.effect, animation.type).length) return ''
  return (animation.type === 'out' ? TO_DIRECTION_LABELS : FROM_DIRECTION_LABELS)[direction]
}

interface SlideAnimation {
  label: string
  value: TurningMode
}

export const SLIDE_ANIMATIONS: SlideAnimation[] = [
  { label: '无', value: 'no' },
  { label: '平滑（对象）', value: 'morph' },
  { label: '随机', value: 'random' },
  { label: '左右推移', value: 'slideX' },
  { label: '上下推移', value: 'slideY' },
  { label: '左右推移（3D）', value: 'slideX3D' },
  { label: '上下推移（3D）', value: 'slideY3D' },
  { label: '淡入淡出', value: 'fade' },
  { label: '旋转', value: 'rotate' },
  { label: '上下展开', value: 'scaleY' },
  { label: '左右展开', value: 'scaleX' },
  { label: '放大', value: 'scale' },
  { label: '缩小', value: 'scaleReverse' },
]
