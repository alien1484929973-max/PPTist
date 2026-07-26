<template>
  <Modal
    :visible="visible"
    :width="width"
    closeButton
    :closeOnClickMask="!loading"
    @update:visible="value => emit('update:visible', value)"
  >
    <div class="document-manager">
      <div class="manager-header">
        <div>
          <h2>我的文稿</h2>
          <p>共 {{ documents.length }} 个云端文稿</p>
        </div>
        <div class="manager-header-actions">
          <Button @click="mediaSettingsVisible = true"><i-icon-park-outline:setting-two /> 媒体中心</Button>
          <Button type="primary" @click="create()"><i-icon-park-outline:plus /> 新建文稿</Button>
        </div>
      </div>

      <div class="manager-error" v-if="error">{{ error }}</div>

      <div class="document-list" :class="{ loading }">
        <div
          class="document-item"
          :class="{ active: document.id === activeDocumentId }"
          v-for="document in documents"
          :key="document.id"
          @dblclick="open(document.id)"
        >
          <div class="document-icon"><i-icon-park-outline:file-ppt /></div>
          <div class="document-info" @click="open(document.id)">
            <div class="document-title">
              {{ document.title }}
              <span v-if="document.id === activeDocumentId">当前</span>
            </div>
            <div class="document-meta">
              <span>{{ document.slideCount }} 页 · {{ formatTime(document.updatedAt) }}</span>
              <button
                class="media-space-id"
                title="点击复制，可在媒体中心搜索此 ID"
                @click.stop="copyMediaSpaceId(document.id)"
              >
                媒体 ID：{{ getMediaSpaceId(document.id) }}
              </button>
            </div>
          </div>
          <div class="document-actions">
            <button @click.stop="rename(document.id, document.title)">重命名</button>
            <button @click.stop="duplicate(document.id)">复制</button>
            <button class="danger" @click.stop="remove(document.id, document.title)">删除</button>
          </div>
        </div>

        <div class="empty" v-if="!documents.length && !loading">
          暂无文稿，点击右上角新建
        </div>
      </div>

      <div class="manager-footer">
        <span>已登录：{{ user?.username }}</span>
        <button @click="logout()"><i-icon-park-outline:logout /> 退出登录</button>
      </div>
    </div>
  </Modal>

  <Modal v-model:visible="mediaSettingsVisible" :width="520" closeButton>
    <MediaSettingsPanel v-if="mediaSettingsVisible" />
  </Modal>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useDocumentsStore } from '@/store'
import message from '@/utils/message'
import Modal from '@/components/Modal.vue'
import Button from '@/components/Button.vue'
import MediaSettingsPanel from './MediaSettingsPanel.vue'

withDefaults(defineProps<{ visible: boolean, width?: number }>(), { width: 760 })
const emit = defineEmits<{ (event: 'update:visible', value: boolean): void }>()

const documentsStore = useDocumentsStore()
const { documents, activeDocumentId, loading, user, error } = storeToRefs(documentsStore)
const mediaSettingsVisible = ref(false)

const formatTime = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
}).format(new Date(value))

const getMediaSpaceId = (documentId: string) => documentId.slice(0, 8)

const copyMediaSpaceId = async (documentId: string) => {
  const mediaSpaceId = getMediaSpaceId(documentId)
  try {
    await navigator.clipboard.writeText(mediaSpaceId)
    message.success(`媒体 ID ${mediaSpaceId} 已复制`)
  }
  catch {
    window.prompt('请复制媒体 ID', mediaSpaceId)
  }
}

const create = async () => {
  if (await documentsStore.createDocument()) {
    emit('update:visible', false)
    message.success('文稿已创建')
  }
  else message.error(documentsStore.error || '创建失败')
}

const open = async (id: string) => {
  if (id === activeDocumentId.value) {
    emit('update:visible', false)
    return
  }
  if (await documentsStore.openDocument(id)) emit('update:visible', false)
  else message.error(documentsStore.error || '无法打开文稿')
}

const rename = async (id: string, oldTitle: string) => {
  const title = window.prompt('请输入新的文稿名称', oldTitle)?.trim()
  if (!title || title === oldTitle) return
  if (await documentsStore.renameDocument(id, title)) message.success('文稿已重命名')
  else message.error(documentsStore.error || '重命名失败')
}

const duplicate = async (id: string) => {
  if (await documentsStore.duplicateDocument(id)) message.success('文稿副本已创建')
  else message.error(documentsStore.error || '复制失败')
}

const remove = async (id: string, title: string) => {
  if (!window.confirm(`确定删除“${title}”吗？此操作暂时无法撤销。`)) return
  if (await documentsStore.deleteDocument(id)) message.success('文稿已删除')
  else message.error(documentsStore.error || '删除失败')
}

const logout = async () => {
  if (!window.confirm('确定退出登录吗？')) return
  if (await documentsStore.logout()) emit('update:visible', false)
  else message.error(documentsStore.error || '存在尚未保存的修改，暂时无法退出')
}
</script>

<style lang="scss" scoped>
.document-manager {
  height: min(620px, 78vh);
  display: flex;
  flex-direction: column;
}
.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 34px;

  h2 {
    margin: 0;
    font-size: 20px;
  }
  p {
    margin: 5px 0 0;
    color: #8a8f99;
    font-size: 12px;
  }
}
.manager-header-actions {
  display: flex;
  gap: 8px;
}
.manager-error {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  color: #b42318;
  background: #fff1f0;
  font-size: 12px;
}
.document-list {
  flex: 1;
  min-height: 0;
  margin-top: 18px;
  overflow: auto;
  opacity: 1;

  &.loading {
    pointer-events: none;
    opacity: .55;
  }
}
.document-item {
  min-height: 68px;
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid #eceef2;
  border-radius: 8px;
  cursor: default;

  & + & {
    margin-top: 8px;
  }
  &:hover {
    border-color: #cbd5e1;
    background: #fafbfc;
  }
  &.active {
    border-color: rgba(65, 105, 225, .45);
    background: rgba(65, 105, 225, .055);
  }
}
.document-icon {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 8px;
  color: #d3543c;
  background: #fff1ee;
  font-size: 23px;
}
.document-info {
  flex: 1;
  min-width: 0;
  padding: 0 12px;
  cursor: pointer;
}
.document-title {
  overflow: hidden;
  color: #292d33;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;

  span {
    margin-left: 6px;
    padding: 2px 6px;
    border-radius: 10px;
    color: $themeColor;
    background: rgba(65, 105, 225, .1);
    font-size: 10px;
    font-weight: 400;
  }
}
.document-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  color: #9096a0;
  font-size: 11px;
}
.media-space-id {
  padding: 2px 6px;
  border: 0;
  border-radius: 4px;
  color: #687386;
  background: #f0f2f5;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  cursor: copy;

  &:hover {
    color: $themeColor;
    background: rgba(65, 105, 225, .1);
  }
}
.document-actions {
  display: flex;
  gap: 6px;

  button {
    padding: 5px 7px;
    border: 0;
    color: #606773;
    background: transparent;
    font-size: 11px;
    cursor: pointer;

    &:hover {
      color: $themeColor;
    }
    &.danger:hover {
      color: #dc2626;
    }
  }
}
.empty {
  padding: 100px 0;
  color: #9ca3af;
  text-align: center;
}
.manager-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  border-top: 1px solid #eef0f3;
  color: #8a8f99;
  font-size: 11px;

  button {
    border: 0;
    color: #6b7280;
    background: transparent;
    cursor: pointer;

    &:hover {
      color: #dc2626;
    }
  }
}
</style>
