<template>
  <div class="media-settings">
    <div class="settings-header">
      <h2>媒体中心</h2>
      <p>API Key将与当前登录账号绑定，并由后端加密保存。</p>
    </div>

    <div class="status" :class="{ configured: settings?.configured }">
      <span class="dot"></span>
      <div>
        <strong>{{ settings?.configured ? '已绑定' : '尚未绑定' }}</strong>
        <div v-if="settings?.configured">
          {{ settings.maskedKey }} · {{ settings.publicBaseUrl }}
        </div>
        <div v-else>绑定后，本地媒体和PPTX内嵌媒体将自动上传并转换为公开外链。</div>
      </div>
    </div>

    <form @submit.prevent="save()">
      <label for="media-api-key">{{ settings?.configured ? '输入新Key以替换当前绑定' : '媒体中心API Key' }}</label>
      <input
        id="media-api-key"
        v-model="apiKey"
        type="password"
        autocomplete="new-password"
        :disabled="loading"
        placeholder="粘贴新生成的API Key"
      />
      <p class="hint">Key不会返回给浏览器，也不会写入文稿JSON或前端构建文件。</p>

      <div class="error" v-if="error">{{ error }}</div>
      <div class="actions">
        <Button v-if="settings?.configured" :disabled="loading" @click="remove()">解除绑定</Button>
        <Button type="primary" nativeType="submit" :disabled="loading || !apiKey.trim()">
          {{ loading ? '验证中…' : settings?.configured ? '验证并替换' : '验证并绑定' }}
        </Button>
      </div>
    </form>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import type { MediaSettings } from '@/types/cloud'
import { CloudApiError, cloudApi } from '@/services/cloud'
import message from '@/utils/message'
import Button from '@/components/Button.vue'

const settings = ref<MediaSettings | null>(null)
const apiKey = ref('')
const loading = ref(false)
const error = ref('')

const errorMessage = (cause: unknown) => {
  if (cause instanceof CloudApiError) {
    if (cause.code === 'media_api_key_invalid' || cause.code === 'invalid_media_api_key') return 'API Key无效，请在媒体中心重新生成后再试'
    if (cause.code === 'media_service_unavailable') return '暂时无法连接媒体中心，请稍后重试'
    if (cause.code === 'media_credential_secret_missing' || cause.code === 'media_credential_secret_invalid') return '服务器尚未配置媒体凭据加密密钥'
  }
  return '媒体中心设置读取或保存失败'
}

const load = async () => {
  loading.value = true
  error.value = ''
  try {
    const result = await cloudApi.getMediaSettings()
    settings.value = result.settings
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
  finally {
    loading.value = false
  }
}

const save = async () => {
  const value = apiKey.value.trim()
  if (!value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const result = await cloudApi.saveMediaSettings(value)
    settings.value = result.settings
    apiKey.value = ''
    message.success('媒体中心API Key已与当前账号绑定')
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
  finally {
    loading.value = false
  }
}

const remove = async () => {
  if (loading.value || !window.confirm('解除绑定后将无法上传新媒体，已有公开外链不受影响。确定继续吗？')) return
  loading.value = true
  error.value = ''
  try {
    await cloudApi.deleteMediaSettings()
    settings.value = { configured: false, maskedKey: '', publicBaseUrl: settings.value?.publicBaseUrl || '' }
    apiKey.value = ''
    message.success('媒体中心绑定已解除')
  }
  catch (cause) {
    error.value = errorMessage(cause)
  }
  finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style lang="scss" scoped>
.media-settings {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 4px 2px;
}
.settings-header {
  padding-right: 34px;

  h2 {
    margin: 0;
    color: #252a31;
    font-size: 20px;
  }
  p {
    margin: 6px 0 0;
    color: #737b87;
    font-size: 12px;
  }
}
.status {
  display: flex;
  gap: 10px;
  margin: 20px 0;
  padding: 14px;
  border: 1px solid #e8ebf0;
  border-radius: 8px;
  color: #6b7280;
  background: #fafbfc;
  font-size: 12px;

  > div {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  &.configured {
    border-color: #bfe5cf;
    color: #397554;
    background: #f2fbf6;
  }
  strong {
    display: block;
    margin-bottom: 4px;
    color: #303640;
    font-size: 13px;
  }
  .dot {
    width: 9px;
    height: 9px;
    flex-shrink: 0;
    margin-top: 4px;
    border-radius: 50%;
    background: #b5bbc4;
  }
  &.configured .dot {
    background: #2da867;
  }
}
form label {
  display: block;
  margin-bottom: 7px;
  color: #3f4650;
  font-size: 13px;
}
form input {
  display: block;
  width: 100%;
  height: 40px;
  box-sizing: border-box;
  padding: 0 11px;
  border: 1px solid #d7dce5;
  border-radius: 7px;
  outline: none;
  font-size: 14px;

  &:focus {
    border-color: $themeColor;
    box-shadow: 0 0 0 3px rgba(65, 105, 225, .1);
  }
}
.hint {
  margin: 7px 0 0;
  color: #8a9099;
  font-size: 11px;
}
.error {
  margin-top: 12px;
  color: #dc2626;
  font-size: 12px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}
</style>
