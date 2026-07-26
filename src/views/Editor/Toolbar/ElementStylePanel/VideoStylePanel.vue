<template>
  <div class="video-style-panel">
    <div class="title">视频预览封面</div>
    <div class="background-image-wrapper">
      <FileInput @change="files => setVideoPoster(files)">
        <div class="background-image">
          <div class="content" :style="{ backgroundImage: handleVideoElement.poster ? `url(${handleVideoElement.poster})` : '' }">
            <i-icon-park-outline:plus />
          </div>
        </div>
      </FileInput>
    </div>
    <div class="row">
      <Button style="flex: 1;" @click="setVideoPosterFromFirstFrame()"><i-icon-park-outline:screenshot-one /> 设置首帧为封面</Button>
    </div>
    <div class="row" v-if="handleVideoElement.poster">
      <Button style="flex: 1;" @click="updateVideo({ poster: '' })"><i-icon-park-outline:undo /> 重置封面</Button>
    </div>

    <Divider />

    <div class="row switch-row">
      <div style="width: 40%;">自动播放：</div>
      <div class="switch-wrapper" style="width: 60%;">
        <Switch 
          :value="handleVideoElement.autoplay" 
          @update:value="value => updateVideo({ autoplay: value })" 
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useMainStore, useSlidesStore } from '@/store'
import type { PPTVideoElement } from '@/types/slides'
import { mediaUploadErrorMessage } from '@/services/media'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useMediaUpload from '@/hooks/useMediaUpload'
import message from '@/utils/message'

import FileInput from '@/components/FileInput.vue'
import Button from '@/components/Button.vue'
import Switch from '@/components/Switch.vue'
import Divider from '@/components/Divider.vue'

const slidesStore = useSlidesStore()
const { handleElement } = storeToRefs(useMainStore())

const handleVideoElement = handleElement as Ref<PPTVideoElement>

const { addHistorySnapshot } = useHistorySnapshot()
const { upload, uploadImage } = useMediaUpload()

const updateVideo = (props: Partial<PPTVideoElement>) => {
  if (!handleElement.value) return
  slidesStore.updateElement({ id: handleElement.value.id, props })
  addHistorySnapshot()
}

// 设置视频预览封面
const setVideoPoster = async (files: FileList) => {
  const imageFile = files[0]
  if (!imageFile) return
  try {
    const asset = await uploadImage(imageFile)
    updateVideo({ poster: asset.publicUrl })
  }
  catch (error) {
    message.error(mediaUploadErrorMessage(error))
  }
}

// 获取视频首帧作为预览封面
const setVideoPosterFromFirstFrame = () => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true

  video.addEventListener('error', () => {
    updateVideo({ poster: '' })
  })

  video.addEventListener('loadedmetadata', () => {
    video!.requestVideoFrameCallback(() => {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx!.drawImage(video, 0, 0, canvas.width, canvas.height)

      canvas.toBlob(async blob => {
        video.remove()
        canvas.remove()
        if (!blob) return message.error('无法读取视频首帧')
        try {
          const asset = await upload(blob, 'poster', { filename: 'video-poster.jpg' })
          updateVideo({ poster: asset.publicUrl })
        }
        catch (error) {
          message.error(mediaUploadErrorMessage(error))
        }
      }, 'image/jpeg', 0.8)
    })
  }, { once: true })

  video.src = handleVideoElement.value.src
}
</script>

<style lang="scss" scoped>
.row {
  width: 100%;
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}
.title {
  margin-bottom: 10px;
}
.background-image-wrapper {
  margin-bottom: 10px;
}
.background-image {
  height: 0;
  padding-bottom: 56.25%;
  border: 1px dashed $borderColor;
  border-radius: $borderRadius;
  position: relative;
  transition: all $transitionDelay;

  &:hover {
    border-color: $themeColor;
    color: $themeColor;
  }

  .content {
    @include absolute-0();

    display: flex;
    justify-content: center;
    align-items: center;
    background-position: center;
    background-size: contain;
    background-repeat: no-repeat;
    cursor: pointer;
  }
}
.switch-row {
  height: 32px;
}
.switch-wrapper {
  text-align: right;
}
</style>
