<template>
  <div class="media-input">
    <Tabs 
      :tabs="tabs" 
      v-model:value="type" 
      :tabsStyle="{ marginBottom: '15px' }" 
    />

    <template v-if="type === 'video'">
      <Input v-model:value="videoSrc" placeholder="请输入视频地址，e.g. https://xxx.mp4"></Input>
      <div class="btns">
        <FileInput accept="video/*" @change="files => uploadVideo(files)">
          <Button :disabled="uploading"><i-icon-park-outline:upload /> {{ uploadLabel }}</Button>
        </FileInput>
        <div class="group">
          <Button @click="emit('close')" style="margin-right: 10px;">取消</Button>
          <Button type="primary" @click="insertVideo()">确认</Button>
        </div>
      </div>
    </template>

    <template v-if="type === 'audio'">
      <Input v-model:value="audioSrc" placeholder="请输入音频地址，e.g. https://xxx.mp3"></Input>
      <div class="btns">
        <FileInput accept="audio/*" @change="files => uploadAudio(files)">
          <Button :disabled="uploading"><i-icon-park-outline:upload /> {{ uploadLabel }}</Button>
        </FileInput>
        <div class="group">
          <Button @click="emit('close')" style="margin-right: 10px;">取消</Button>
          <Button type="primary" @click="insertAudio()">确认</Button>
        </div>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import message from '@/utils/message'
import { mediaUploadErrorMessage } from '@/services/media'
import useMediaUpload from '@/hooks/useMediaUpload'
import Tabs from '@/components/Tabs.vue'
import Input from '@/components/Input.vue'
import Button from '@/components/Button.vue'
import FileInput from '@/components/FileInput.vue'

type TypeKey = 'video' | 'audio'
interface TabItem {
  key: TypeKey
  label: string
}

const emit = defineEmits<{
  (event: 'insertVideo', payload: { src: string, ext?: string }): void
  (event: 'insertAudio', payload: { src: string, ext?: string }): void
  (event: 'close'): void
}>()

const type = ref<TypeKey>('video')
const uploading = ref(false)
const uploadProgress = ref(0)
const uploadLabel = computed(() => uploading.value ? `上传中 ${uploadProgress.value}%` : `上传本地${type.value === 'video' ? '视频' : '音频'}`)
const { upload } = useMediaUpload()

const videoSrc = ref('https://videos.pexels.com/video-files/29261597/12623866_640_360_24fps.mp4')
const audioSrc = ref('https://freesound.org/data/previews/614/614107_11861866-lq.mp3')

const tabs: TabItem[] = [
  { key: 'video', label: '视频' },
  { key: 'audio', label: '音频' },
]

const insertVideo = () => {
  if (!videoSrc.value) return message.error('请先输入正确的视频地址')
  emit('insertVideo', { src: videoSrc.value })
}

const insertAudio = () => {
  if (!audioSrc.value) return message.error('请先输入正确的音频地址')
  emit('insertAudio', { src: audioSrc.value })
}

const uploadVideo = async (files: FileList) => {
  const file = files[0]
  if (!file || uploading.value) return
  uploading.value = true
  uploadProgress.value = 0
  try {
    const asset = await upload(file, 'video', { onProgress: progress => uploadProgress.value = progress.percentage })
    emit('insertVideo', { src: asset.publicUrl, ext: asset.extension })
  }
  catch (error) {
    message.error(mediaUploadErrorMessage(error))
  }
  finally {
    uploading.value = false
  }
}

const uploadAudio = async (files: FileList) => {
  const file = files[0]
  if (!file || uploading.value) return
  uploading.value = true
  uploadProgress.value = 0
  try {
    const asset = await upload(file, 'audio', { onProgress: progress => uploadProgress.value = progress.percentage })
    emit('insertAudio', { src: asset.publicUrl, ext: asset.extension })
  }
  catch (error) {
    message.error(mediaUploadErrorMessage(error))
  }
  finally {
    uploading.value = false
  }
}
</script>

<style lang="scss" scoped>
.media-input {
  width: 480px;
}
.btns {
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
}
</style>
