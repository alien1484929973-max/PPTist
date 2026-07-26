<template>
  <div class="screen-slide-list presentation-player-canvas" ref="hostRef"></div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, watch, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useSlidesStore } from '@/store'
import {
  createPresentationPlayer,
  type PlayerDocument,
  type PlayerState,
  type PresentationPlayer,
} from 'pptist-presentation-player'
import { serializePresentation } from '@/utils/presentation'

const emit = defineEmits<{
  ready: [player: PresentationPlayer | null]
  stateChange: [state: PlayerState]
  error: [error: Error]
}>()

const slidesStore = useSlidesStore()
const { slides, slideIndex, theme, viewportSize, viewportRatio } = storeToRefs(slidesStore)
const hostRef = useTemplateRef<HTMLElement>('hostRef')
let player: PresentationPlayer | null = null
let failed = false

// The editor preview consumes the same serialized schema and installed package
// entry as an external npm consumer. This prevents source/dist drift.
const presentation = (): PlayerDocument => serializePresentation()

const reload = () => {
  if (!player || failed) return
  try {
    const state = player.state
    player.load(presentation(), state.slideIndex)
    player.goToStep(state.slideIndex, state.stepIndex)
  }
  catch (error) {
    fail(error)
  }
}

const fail = (cause: unknown) => {
  if (failed) return
  failed = true
  player?.destroy()
  player = null
  emit('ready', null)
  emit('error', cause instanceof Error ? cause : new Error(String(cause)))
}

onMounted(() => {
  if (!hostRef.value) return
  try {
    player = createPresentationPlayer(hostRef.value, presentation(), {
      startIndex: slideIndex.value,
      fit: 'contain',
      keyboard: false,
      clickToAdvance: false,
      showUnsupported: false,
      onStateChange: state => emit('stateChange', state),
    })
    emit('ready', player)
  }
  catch (error) {
    fail(error)
  }
})

watch([slides, theme, viewportSize, viewportRatio], reload, { deep: true })

onUnmounted(() => {
  emit('ready', null)
  player?.destroy()
  player = null
})
</script>

<style lang="scss" scoped>
.presentation-player-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  background: #1d1d1d;
}
</style>
