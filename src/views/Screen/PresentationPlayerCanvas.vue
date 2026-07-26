<template>
  <div class="screen-slide-list presentation-player-canvas" ref="hostRef">
    <div class="presentation-player-error" data-pptist-no-advance v-if="errorMessage">
      <strong>播放器加载失败</strong>
      <span>{{ errorMessage }}</span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, watch, useTemplateRef } from 'vue'
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

const props = withDefaults(defineProps<{
  keyboard?: boolean
  keyboardScope?: 'host' | 'document'
  wheel?: boolean
  clickToAdvance?: boolean
}>(), {
  keyboard: true,
  keyboardScope: 'document',
  wheel: true,
  clickToAdvance: true,
})

const slidesStore = useSlidesStore()
const { slides, slideIndex, theme, viewportSize, viewportRatio } = storeToRefs(slidesStore)
const hostRef = useTemplateRef<HTMLElement>('hostRef')
let player: PresentationPlayer | null = null
let failed = false
const errorMessage = ref('')

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
  errorMessage.value = cause instanceof Error ? cause.message : String(cause)
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
      keyboard: props.keyboard,
      keyboardScope: props.keyboardScope,
      wheel: props.wheel,
      clickToAdvance: props.clickToAdvance,
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
.presentation-player-error {
  position: absolute;
  z-index: 20;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: #fecaca;
  background: #1d1d1d;
  text-align: center;
}
</style>
