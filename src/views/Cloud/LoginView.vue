<template>
  <div class="cloud-login">
    <div class="login-card">
      <img class="logo" src="/logo.png" alt="PPTist" />
      <h1>云文稿</h1>
      <p>登录后管理和保存你的演示文稿</p>

      <form @submit.prevent="submit()">
        <label>
          <span>用户名</span>
          <input v-model.trim="username" autocomplete="username" :disabled="submitting" />
        </label>
        <label>
          <span>密码</span>
          <input v-model="password" type="password" autocomplete="current-password" :disabled="submitting" />
        </label>
        <div class="error" v-if="error">{{ error }}</div>
        <button type="submit" :disabled="submitting || !username || !password">
          {{ submitting ? '登录中…' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useDocumentsStore } from '@/store'

const documentsStore = useDocumentsStore()
const { error } = storeToRefs(documentsStore)

const username = ref('alien')
const password = ref('')
const submitting = ref(false)

const submit = async () => {
  if (!username.value || !password.value || submitting.value) return
  submitting.value = true
  await documentsStore.login(username.value, password.value)
  submitting.value = false
}
</script>

<style lang="scss" scoped>
.cloud-login {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at 20% 15%, rgba(76, 120, 255, .15), transparent 35%),
    radial-gradient(circle at 80% 85%, rgba(139, 92, 246, .12), transparent 32%),
    #f5f7fb;
}
.login-card {
  width: min(380px, 100%);
  padding: 36px;
  border: 1px solid #e7eaf0;
  border-radius: 14px;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 18px 50px rgba(31, 41, 55, .12);

  .logo {
    width: 54px;
    height: 54px;
    object-fit: contain;
  }
  h1 {
    margin: 18px 0 6px;
    font-size: 26px;
    color: #1f2937;
  }
  p {
    margin: 0 0 28px;
    color: #6b7280;
    font-size: 14px;
  }
}
label {
  display: block;
  margin-bottom: 16px;

  span {
    display: block;
    margin-bottom: 7px;
    color: #4b5563;
    font-size: 13px;
  }
  input {
    width: 100%;
    height: 42px;
    padding: 0 12px;
    border: 1px solid #d7dce5;
    border-radius: 7px;
    outline: none;
    font-size: 15px;

    &:focus {
      border-color: $themeColor;
      box-shadow: 0 0 0 3px rgba(65, 105, 225, .12);
    }
  }
}
.error {
  min-height: 20px;
  margin: -4px 0 10px;
  color: #dc2626;
  font-size: 13px;
}
button {
  width: 100%;
  height: 42px;
  border: 0;
  border-radius: 7px;
  color: #fff;
  background: $themeColor;
  font-size: 15px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: $themeHoverColor;
  }
  &:disabled {
    opacity: .55;
    cursor: default;
  }
}
</style>
