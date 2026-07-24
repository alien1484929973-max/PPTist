import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { throttle } from 'lodash'
import { storeToRefs } from 'pinia'
import { useSlidesStore } from '@/store'
import { KEYS } from '@/configs/hotkey'
import message from '@/utils/message'
import type { PPTAnimation, Slide } from '@/types/slides'
import {
  resetElementAnimation,
  runElementAnimation,
  setElementAnimationInitialState,
  setElementAnimationFinalState,
  type ElementAnimationHandle,
} from '@/utils/elementAnimation'
import type { DomAnimationTargets } from '@pptist/presentation-core'

const AUDIENCE_SYNC_CHANNEL = 'pptist-audience-sync'

type SyncMessage =
  | { type: 'EXEC_NEXT' }
  | { type: 'EXEC_PREV' }
  | { type: 'TURN_TO_INDEX'; index: number }
  | { type: 'TURN_TO_ID'; id: string }
  | { type: 'REQUEST_STATE' }
  | { type: 'INIT_STATE'; slideIndex: number; animationIndex: number; slides: Slide[]; viewportSize: number; viewportRatio: number }
  | { type: 'REQUEST_WRITING_BOARD' }
  | { type: 'WRITING_BOARD_UPDATE'; dataURL: string; blackboard: boolean }
  | { type: 'WRITING_BOARD_CLOSE' }
  | { type: 'LASER_PEN_MOVE'; x: number; y: number }
  | { type: 'LASER_PEN_OFF' }
  | { type: 'EXIT' }

export default () => {
  const slidesStore = useSlidesStore()
  const { slides, slideIndex, formatedAnimations, viewportSize, viewportRatio } = storeToRefs(slidesStore)

  const isAudienceMode = new URLSearchParams(window.location.search).get('mode') === 'audience'

  // 非观众模式：创建广播频道，向观众视图发送指令并响应状态请求
  let syncChannel: BroadcastChannel | null = null
  if (!isAudienceMode) {
    syncChannel = new BroadcastChannel(AUDIENCE_SYNC_CHANNEL)
    syncChannel.onmessage = ({ data }: MessageEvent<SyncMessage>) => {
      if (data.type === 'REQUEST_STATE') {
        syncChannel!.postMessage({
          type: 'INIT_STATE',
          slideIndex: slideIndex.value,
          animationIndex: animationIndex.value,
          viewportSize: viewportSize.value,
          viewportRatio: viewportRatio.value,
          slides: JSON.parse(JSON.stringify(slides.value)),
        } as SyncMessage)
      }
    }
  }

  // 当前页的元素动画执行到的位置
  const animationIndex = ref(0)

  // 动画执行状态
  const inAnimation = ref(false)
  const runningAnimations = new Set<ElementAnimationHandle>()
  const completedAnimations = new Map<string, ElementAnimationHandle>()
  const preparedTargets = new Map<string, DomAnimationTargets>()
  let executionGeneration = 0

  const animationElement = (animation: PPTAnimation) => {
    const slideRoot = document.querySelector<HTMLElement>('.screen-slide-list .slide-item.current')
    if (!slideRoot) return null
    if (animation.target?.groupId) {
      return Array.from(slideRoot.querySelectorAll<HTMLElement>('[data-group-id]'))
        .find(element => element.dataset.groupId === animation.target?.groupId) || null
    }
    const element = Array.from(slideRoot.querySelectorAll<HTMLElement>('[data-element-id]'))
      .find(candidate => candidate.dataset.elementId === animation.elId)
    return element?.querySelector<HTMLElement>('[class^=base-element-]') || null
  }

  const hasScopedTextTarget = (animation: PPTAnimation) => {
    return !!(animation.target?.paragraphRange || animation.target?.characterRange || animation.target?.paragraphIndex !== undefined)
  }

  const cleanupPreparedTargets = () => {
    for (const targets of preparedTargets.values()) targets.cleanup()
    preparedTargets.clear()
  }

  const initializePendingTargetStates = () => {
    cleanupPreparedTargets()
    for (let index = animationIndex.value; index < formatedAnimations.value.length; index++) {
      for (const animation of formatedAnimations.value[index].animations) {
        if (animation.type !== 'in' || !hasScopedTextTarget(animation)) continue
        const element = animationElement(animation)
        if (!element) continue
        preparedTargets.set(animation.id, setElementAnimationInitialState(element, animation))
      }
    }
  }

  const cancelElementAnimations = () => {
    executionGeneration += 1
    for (const handle of runningAnimations) handle.cancel()
    for (const handle of completedAnimations.values()) handle.restore()
    cleanupPreparedTargets()
    runningAnimations.clear()
    completedAnimations.clear()
    inAnimation.value = false
  }

  // 最小已播放页面索引
  const playedSlidesMinIndex = ref(slideIndex.value)

  // 执行元素动画
  const runAnimation = () => {
    // 正在执行动画时，禁止其他新的动画开始
    if (inAnimation.value) return

    const step = formatedAnimations.value[animationIndex.value]
    if (!step) return
    const { animations, autoNext } = step
    animationIndex.value += 1

    // 标记开始执行动画
    inAnimation.value = true

    let endAnimationCount = 0
    const generation = executionGeneration

    const completeOne = () => {
      if (generation !== executionGeneration) return
      endAnimationCount += 1
      if (endAnimationCount !== animations.length) return
      inAnimation.value = false
      if (autoNext) runAnimation()
    }

    // 依次执行该位置中的全部动画
    for (const animation of animations) {
      const elRef = animationElement(animation)
      if (!elRef) {
        completeOne()
        continue
      }
      completedAnimations.get(animation.id)?.restore()
      const targets = preparedTargets.get(animation.id)
      if (targets) preparedTargets.delete(animation.id)
      const handle = runElementAnimation(elRef, animation, {
        viewportWidth: viewportSize.value,
        viewportHeight: viewportSize.value * viewportRatio.value,
        targets,
      })
      runningAnimations.add(handle)
      handle.finished.then(() => {
        runningAnimations.delete(handle)
        if (generation !== executionGeneration) return
        completedAnimations.set(animation.id, handle)
        completeOne()
      })
    }

  }

  onMounted(() => {
    initializePendingTargetStates()
    const firstAnimations = formatedAnimations.value[0]
    if (firstAnimations && firstAnimations.animations.length) {
      const autoExecFirstAnimations = firstAnimations.animations.every(item => item.trigger === 'auto' || item.trigger === 'meantime')
      if (autoExecFirstAnimations) runAnimation()
    }
  })

  // 恢复已执行过的退场动画的 DOM 终态（用于观众视图初始化同步）
  // 入场动画的可见性由 animationIndex + needWaitAnimation 计算属性控制，无须额外处理
  // 强调动画无持久效果，也无须处理
  const restoreAnimationState = (targetIndex: number) => {
    for (let i = 0; i < targetIndex && i < formatedAnimations.value.length; i++) {
      const { animations } = formatedAnimations.value[i]
      for (const animation of animations) {
        if (animation.type !== 'out') continue
        const elRef = animationElement(animation)
        if (!elRef) continue
        completedAnimations.get(animation.id)?.restore()
        completedAnimations.set(animation.id, setElementAnimationFinalState(elRef, animation))
      }
    }
    initializePendingTargetStates()
  }

  // 撤销元素动画，除了将索引前移外，还需要清除动画状态
  const revokeAnimation = () => {
    executionGeneration += 1
    for (const handle of runningAnimations) handle.cancel()
    runningAnimations.clear()
    inAnimation.value = false
    animationIndex.value -= 1
    const { animations } = formatedAnimations.value[animationIndex.value]

    for (const animation of animations) {
      const elRef = animationElement(animation)
      if (!elRef) continue
      const handle = completedAnimations.get(animation.id)
      if (handle) {
        handle.restore()
        completedAnimations.delete(animation.id)
      }
      else resetElementAnimation(elRef)
    }

    initializePendingTargetStates()

    // 如果撤销时该位置有且仅有强调动画，则继续执行一次撤销
    if (animations.every(item => item.type === 'attention')) execPrev(false)
  }

  // 关闭自动播放
  const autoPlayTimer = ref(0)
  const closeAutoPlay = () => {
    if (autoPlayTimer.value) {
      clearInterval(autoPlayTimer.value)
      autoPlayTimer.value = 0
    }
  }
  onUnmounted(closeAutoPlay)
  onUnmounted(cancelElementAnimations)

  watch(slideIndex, () => {
    cancelElementAnimations()
    nextTick(initializePendingTargetStates)
  })

  // 循环放映
  const loopPlay = ref(false)
  const setLoopPlay = (loop: boolean) => {
    loopPlay.value = loop
  }

  const throttleMassage = throttle(function(msg) {
    message.success(msg)
  }, 1000, { leading: true, trailing: false })

  // 向上/向下播放
  // 遇到元素动画时，优先执行动画播放，无动画则执行翻页
  // 向上播放遇到动画时，仅撤销到动画执行前的状态，不需要反向播放动画
  // 撤回到上一页时，若该页从未播放过（意味着不存在动画状态），需要将动画索引置为最小值（初始状态），否则置为最大值（最终状态）
  const execPrev = (broadcast = true) => {
    if (broadcast) syncChannel?.postMessage({ type: 'EXEC_PREV' } as SyncMessage)
    if (formatedAnimations.value.length && animationIndex.value > 0) {
      revokeAnimation()
    }
    else if (slideIndex.value > 0) {
      slidesStore.updateSlideIndex(slideIndex.value - 1)
      if (slideIndex.value < playedSlidesMinIndex.value) {
        animationIndex.value = 0
        playedSlidesMinIndex.value = slideIndex.value
      }
      else animationIndex.value = formatedAnimations.value.length
    }
    else {
      if (loopPlay.value) turnSlideToIndex(slides.value.length - 1)
      else throttleMassage('已经是第一页了')
    }
    inAnimation.value = false
  }
  const execNext = () => {
    syncChannel?.postMessage({ type: 'EXEC_NEXT' } as SyncMessage)
    if (formatedAnimations.value.length && animationIndex.value < formatedAnimations.value.length) {
      runAnimation()
    }
    else if (slideIndex.value < slides.value.length - 1) {
      slidesStore.updateSlideIndex(slideIndex.value + 1)
      animationIndex.value = 0
      inAnimation.value = false
    }
    else {
      if (loopPlay.value) turnSlideToIndex(0)
      else {
        throttleMassage('已经是最后一页了')
        closeAutoPlay()
      }
      inAnimation.value = false
    }
  }

  // 自动播放
  const autoPlayInterval = ref(2500)
  const autoPlay = () => {
    closeAutoPlay()
    message.success('开始自动放映')
    autoPlayTimer.value = window.setInterval(execNext, autoPlayInterval.value)
  }

  const setAutoPlayInterval = (interval: number) => {
    closeAutoPlay()
    autoPlayInterval.value = interval
    autoPlay()
  }

  // 鼠标滚动翻页
  const mousewheelListener = throttle(function(e: WheelEvent) {
    if (e.deltaY < 0) execPrev()
    else if (e.deltaY > 0) execNext()
  }, 500, { leading: true, trailing: false })

  // 触摸屏上下滑动翻页
  const touchInfo = ref<{ x: number; y: number; } | null>(null)

  const touchStartListener = (e: TouchEvent) => {
    touchInfo.value = {
      x: e.changedTouches[0].pageX,
      y: e.changedTouches[0].pageY,
    }
  }
  const touchEndListener = (e: TouchEvent) => {
    if (!touchInfo.value) return

    const offsetX = Math.abs(touchInfo.value.x - e.changedTouches[0].pageX)
    const offsetY = e.changedTouches[0].pageY - touchInfo.value.y

    if ( Math.abs(offsetY) > offsetX && Math.abs(offsetY) > 50 ) {
      touchInfo.value = null

      if (offsetY > 0) execPrev()
      else execNext()
    }
  }

  // 快捷键翻页
  const keydownListener = throttle(function(e: KeyboardEvent) {
    const key = e.key.toUpperCase()

    if (key === KEYS.UP || key === KEYS.LEFT || key === KEYS.PAGEUP) execPrev()
    else if (
      key === KEYS.DOWN || 
      key === KEYS.RIGHT ||
      key === KEYS.SPACE || 
      key === KEYS.ENTER ||
      key === KEYS.PAGEDOWN
    ) execNext()
  }, 500, { leading: true, trailing: false })

  onMounted(() => {
    if (!isAudienceMode) document.addEventListener('keydown', keydownListener)
  })
  onUnmounted(() => {
    if (!isAudienceMode) document.removeEventListener('keydown', keydownListener)
    syncChannel?.close()
  })

  // 切换到上一张/上一张幻灯片（无视元素的入场动画）
  const turnPrevSlide = () => {
    slidesStore.updateSlideIndex(slideIndex.value - 1)
    animationIndex.value = 0
  }
  const turnNextSlide = () => {
    slidesStore.updateSlideIndex(slideIndex.value + 1)
    animationIndex.value = 0
  }

  // 切换幻灯片到指定的页面
  const turnSlideToIndex = (index: number) => {
    syncChannel?.postMessage({ type: 'TURN_TO_INDEX', index } as SyncMessage)
    slidesStore.updateSlideIndex(index)
    animationIndex.value = 0
  }
  const turnSlideToId = (id: string) => {
    const index = slides.value.findIndex(slide => slide.id === id)
    if (index !== -1) {
      syncChannel?.postMessage({ type: 'TURN_TO_ID', id } as SyncMessage)
      slidesStore.updateSlideIndex(index)
      animationIndex.value = 0
    }
  }

  // 激光笔状态与位置广播
  const laserPen = ref(false)

  const handleLaserMove = (e: MouseEvent) => {
    const slideEl = document.querySelector('.screen-slide-list .slide-item.current .slide-content') as HTMLElement | null
    if (!slideEl) return
    const rect = slideEl.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    syncChannel?.postMessage({ type: 'LASER_PEN_MOVE', x, y } as SyncMessage)
  }

  // 节流版本的 handleLaserMove
  const throttledHandleLaserMove = throttle(handleLaserMove, 30, { leading: true, trailing: true })

  watch(laserPen, active => {
    if (active) {
      document.addEventListener('mousemove', throttledHandleLaserMove)
    }
    else {
      document.removeEventListener('mousemove', throttledHandleLaserMove)
      syncChannel?.postMessage({ type: 'LASER_PEN_OFF' } as SyncMessage)
    }
  })

  const broadcastExit = () => {
    syncChannel?.postMessage({ type: 'EXIT' } as SyncMessage)
  }

  return {
    autoPlayTimer,
    autoPlayInterval,
    setAutoPlayInterval,
    autoPlay,
    closeAutoPlay,
    loopPlay,
    setLoopPlay,
    mousewheelListener,
    touchStartListener,
    touchEndListener,
    turnPrevSlide,
    turnNextSlide,
    turnSlideToIndex,
    turnSlideToId,
    execPrev,
    execNext,
    animationIndex,
    restoreAnimationState,
    laserPen,
    broadcastExit,
  }
}
