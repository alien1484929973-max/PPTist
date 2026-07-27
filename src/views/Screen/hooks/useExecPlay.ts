import { onUnmounted, ref, shallowRef, watch } from 'vue'
import { throttle } from 'lodash'
import { storeToRefs } from 'pinia'
import { useSlidesStore } from '@/store'
import message from '@/utils/message'
import type { Slide } from '@/types/slides'
import type { PlayerState, PresentationPlayer } from 'pptist-presentation-player'

const AUDIENCE_SYNC_CHANNEL = 'pptist-audience-sync'

type SyncMessage =
  | { type: 'PLAYER_STATE'; slideIndex: number; stepIndex: number }
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
  const { slides, slideIndex, viewportSize, viewportRatio } = storeToRefs(slidesStore)
  const isAudienceMode = new URLSearchParams(window.location.search).get('mode') === 'audience'

  const animationIndex = ref(0)
  const dependencyPlayer = shallowRef<PresentationPlayer | null>(null)
  const autoPlayTimer = ref(0)
  const autoPlayInterval = ref(2500)
  const loopPlay = ref(false)

  let syncChannel: BroadcastChannel | null = null
  if (!isAudienceMode) {
    syncChannel = new BroadcastChannel(AUDIENCE_SYNC_CHANNEL)
    syncChannel.onmessage = ({ data }: MessageEvent<SyncMessage>) => {
      if (data.type !== 'REQUEST_STATE') return
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

  const closeAutoPlay = () => {
    if (!autoPlayTimer.value) return
    clearInterval(autoPlayTimer.value)
    autoPlayTimer.value = 0
  }

  const syncPresentationPlayerState = (state: PlayerState) => {
    if (slideIndex.value !== state.slideIndex) slidesStore.updateSlideIndex(state.slideIndex)
    animationIndex.value = state.stepIndex
    if (!isAudienceMode) {
      syncChannel?.postMessage({
        type: 'PLAYER_STATE',
        slideIndex: state.slideIndex,
        stepIndex: state.stepIndex,
      } as SyncMessage)
    }
    if (!state.ended) return
    if (loopPlay.value && dependencyPlayer.value) {
      queueMicrotask(() => {
        const player = dependencyPlayer.value
        if (player?.state.ended) player.goTo(0)
      })
    }
    else closeAutoPlay()
  }

  const attachPresentationPlayer = (player: PresentationPlayer | null) => {
    dependencyPlayer.value = player
    if (!player) return
    player.goToStep(slideIndex.value, animationIndex.value)
    syncPresentationPlayerState(player.state)
  }

  watch(slideIndex, index => {
    if (dependencyPlayer.value && dependencyPlayer.value.state.slideIndex !== index) {
      dependencyPlayer.value.goTo(index)
    }
  })

  const atStart = (state: PlayerState) => state.slideIndex === 0 && state.stepIndex === 0

  const execPrev = async () => {
    const player = dependencyPlayer.value
    if (!player) return
    const before = player.state
    const state = await player.previous()
    if (atStart(before) && atStart(state)) message.success('已经是第一页了')
  }

  const execNext = async () => {
    const player = dependencyPlayer.value
    if (!player) return
    const state = await player.next()
    if (!state.ended) return
    if (!loopPlay.value) message.success('已经是最后一页了')
  }

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

  const setLoopPlay = (loop: boolean) => {
    loopPlay.value = loop
  }

  const touchInfo = ref<{ x: number; y: number } | null>(null)
  const touchStartListener = (event: TouchEvent) => {
    touchInfo.value = {
      x: event.changedTouches[0].pageX,
      y: event.changedTouches[0].pageY,
    }
  }
  const touchEndListener = (event: TouchEvent) => {
    if (!touchInfo.value) return
    const offsetX = Math.abs(touchInfo.value.x - event.changedTouches[0].pageX)
    const offsetY = event.changedTouches[0].pageY - touchInfo.value.y
    touchInfo.value = null
    if (Math.abs(offsetY) <= offsetX || Math.abs(offsetY) <= 50) return
    if (offsetY > 0) void execPrev()
    else void execNext()
  }

  const turnSlideToIndex = (index: number) => {
    const boundedIndex = Math.min(Math.max(index, 0), Math.max(0, slides.value.length - 1))
    if (dependencyPlayer.value) {
      const state = dependencyPlayer.value.goTo(boundedIndex)
      animationIndex.value = state.stepIndex
    }
    else {
      slidesStore.updateSlideIndex(boundedIndex)
      animationIndex.value = 0
    }
  }

  const turnSlideToId = (id: string) => {
    const index = slides.value.findIndex(slide => slide.id === id)
    if (index !== -1) turnSlideToIndex(index)
  }

  const turnPrevSlide = () => turnSlideToIndex(slideIndex.value - 1)
  const turnNextSlide = () => turnSlideToIndex(slideIndex.value + 1)

  const syncPresentationPlayerCursor = (targetSlideIndex: number, targetStepIndex: number) => {
    const boundedSlideIndex = Math.min(Math.max(targetSlideIndex, 0), Math.max(0, slides.value.length - 1))
    const boundedStepIndex = Math.max(0, targetStepIndex)
    if (slideIndex.value !== boundedSlideIndex) slidesStore.updateSlideIndex(boundedSlideIndex)
    animationIndex.value = boundedStepIndex
    dependencyPlayer.value?.goToStep(boundedSlideIndex, boundedStepIndex)
  }

  const restoreAnimationState = (targetIndex: number) => {
    syncPresentationPlayerCursor(slideIndex.value, targetIndex)
  }

  const laserPen = ref(false)
  const handleLaserMove = (event: MouseEvent) => {
    const slideElement = document.querySelector<HTMLElement>('.screen-slide-list .pptist-player-canvas')
    if (!slideElement) return
    const rect = slideElement.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    syncChannel?.postMessage({
      type: 'LASER_PEN_MOVE',
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    } as SyncMessage)
  }
  const throttledHandleLaserMove = throttle(handleLaserMove, 30, { leading: true, trailing: true })

  watch(laserPen, active => {
    if (active) document.addEventListener('mousemove', throttledHandleLaserMove)
    else {
      document.removeEventListener('mousemove', throttledHandleLaserMove)
      syncChannel?.postMessage({ type: 'LASER_PEN_OFF' } as SyncMessage)
    }
  })

  const broadcastExit = () => syncChannel?.postMessage({ type: 'EXIT' } as SyncMessage)

  onUnmounted(() => {
    closeAutoPlay()
    document.removeEventListener('mousemove', throttledHandleLaserMove)
    syncChannel?.close()
  })

  return {
    autoPlayTimer,
    autoPlayInterval,
    setAutoPlayInterval,
    autoPlay,
    closeAutoPlay,
    loopPlay,
    setLoopPlay,
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
    syncPresentationPlayerCursor,
    laserPen,
    broadcastExit,
    attachPresentationPlayer,
    syncPresentationPlayerState,
  }
}
