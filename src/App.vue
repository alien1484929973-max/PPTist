<template>
  <LoginView v-if="!isAudienceMode && authStatus === 'unauthenticated'" />
  <template v-else-if="slides.length">
    <Screen v-if="screening" />
    <Editor v-else-if="_isPC" />
    <Mobile v-else />
  </template>
  <FullscreenSpin tip="正在加载云文稿 ..." v-else loading :mask="false" />
</template>

<script lang="ts" setup>
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { nanoid } from 'nanoid'
import { useScreenStore, useMainStore, useSlidesStore, useDocumentsStore } from '@/store'
import { LOCALSTORAGE_KEY_DISCARDED_DB } from '@/configs/storage'
import { deleteDiscardedDB } from '@/utils/database'
import { isPC } from '@/utils/common'

import Editor from './views/Editor/index.vue'
import Screen from './views/Screen/index.vue'
import Mobile from './views/Mobile/index.vue'
import LoginView from './views/Cloud/LoginView.vue'
import FullscreenSpin from '@/components/FullscreenSpin.vue'

const _isPC = isPC()

const mainStore = useMainStore()
const slidesStore = useSlidesStore()
const screenStore = useScreenStore()
const documentsStore = useDocumentsStore()
const { databaseId } = storeToRefs(mainStore)
const { slides } = storeToRefs(slidesStore)
const { screening } = storeToRefs(screenStore)
const { authStatus, dirty, saveStatus } = storeToRefs(documentsStore)

const isAudienceMode = new URLSearchParams(window.location.search).get('mode') === 'audience'

onMounted(async () => {
  if (isAudienceMode) {
    slidesStore.setSlides([{
      id: nanoid(10),
      elements: [],
    }])
    screenStore.setScreening(true)
  }
  else {
    await deleteDiscardedDB()
    await documentsStore.initialize()
  }
})

window.addEventListener('beforeunload', event => {
  if (!isAudienceMode && (dirty.value || saveStatus.value === 'saving')) {
    event.preventDefault()
    event.returnValue = ''
  }
})

// 应用注销时向 localStorage 中记录下本次 indexedDB 的数据库ID，用于之后清除数据库
window.addEventListener('beforeunload', () => {
  const discardedDB = localStorage.getItem(LOCALSTORAGE_KEY_DISCARDED_DB)
  const discardedDBList: string[] = discardedDB ? JSON.parse(discardedDB) : []

  discardedDBList.push(databaseId.value)

  const newDiscardedDB = JSON.stringify(discardedDBList)
  localStorage.setItem(LOCALSTORAGE_KEY_DISCARDED_DB, newDiscardedDB)
})
</script>

<style lang="scss">
#app {
  height: 100%;
}
</style>
