import { defineStore } from 'pinia'
import type { CloudAuthStatus, CloudDocument, CloudDocumentSummary, CloudSaveStatus, CloudUser } from '@/types/cloud'
import { CloudApiError, cloudApi } from '@/services/cloud'
import { applyPresentation, createBlankPresentation, serializePresentation } from '@/utils/presentation'
import { useMainStore } from './main'
import { useSlidesStore } from './slides'
import { useSnapshotStore } from './snapshot'

interface DocumentsState {
  authStatus: CloudAuthStatus
  user: CloudUser | null
  documents: CloudDocumentSummary[]
  activeDocumentId: string
  activeRevision: number
  saveStatus: CloudSaveStatus
  dirty: boolean
  loading: boolean
  lastSavedAt: string
  error: string
  suspendTracking: boolean
}

let changeTrackingStarted = false
let savePromise: Promise<boolean> | null = null

const NON_CONTENT_SLIDE_ACTIONS = new Set(['updateSlideIndex', 'setTemplates'])

export const useDocumentsStore = defineStore('documents', {
  state: (): DocumentsState => ({
    authStatus: 'checking',
    user: null,
    documents: [],
    activeDocumentId: '',
    activeRevision: 0,
    saveStatus: 'idle',
    dirty: false,
    loading: false,
    lastSavedAt: '',
    error: '',
    suspendTracking: false,
  }),

  getters: {
    activeDocument(state) {
      return state.documents.find(document => document.id === state.activeDocumentId) || null
    },

    saveLabel(state) {
      if (state.saveStatus === 'saving') return '保存中…'
      if (state.saveStatus === 'dirty') return '未保存'
      if (state.saveStatus === 'error') return '保存失败'
      if (state.saveStatus === 'conflict') return '版本冲突'
      if (state.saveStatus === 'saved') return '已保存'
      return ''
    },
  },

  actions: {
    async initialize() {
      this.authStatus = 'checking'
      this.error = ''
      try {
        const { user } = await cloudApi.me()
        this.user = user
        this.authStatus = 'authenticated'
        await this.initializeLibrary()
      }
      catch (error) {
        if (error instanceof CloudApiError && error.status === 401) {
          this.user = null
          this.authStatus = 'unauthenticated'
          return
        }
        this.authStatus = 'unauthenticated'
        this.error = '无法连接云文稿服务'
      }
    },

    async login(username: string, password: string) {
      this.error = ''
      try {
        const { user } = await cloudApi.login(username, password)
        this.user = user
        this.authStatus = 'authenticated'
        await this.initializeLibrary()
        return true
      }
      catch (error) {
        if (error instanceof CloudApiError && error.status === 429) this.error = '登录失败次数过多，请稍后再试'
        else if (error instanceof CloudApiError && error.status === 401) this.error = '用户名或密码错误'
        else this.error = '登录服务暂时不可用'
        return false
      }
    },

    async logout() {
      if (!this.canLeaveCurrentDocument()) return false
      await cloudApi.logout().catch(() => undefined)
      this.$reset()
      this.authStatus = 'unauthenticated'
      useSlidesStore().setSlides([])
      return true
    },

    async initializeLibrary() {
      this.startChangeTracking()
      await this.refreshDocuments()

      const queryId = new URLSearchParams(window.location.search).get('doc') || ''
      const rememberedId = localStorage.getItem('pptist_active_document') || ''
      const preferredId = [queryId, rememberedId].find(id => this.documents.some(document => document.id === id))

      if (preferredId) await this.openDocument(preferredId, { skipSave: true })
      else if (this.documents.length) await this.openDocument(this.documents[0].id, { skipSave: true })
      else await this.createDocument('未命名演示文稿')
    },

    startChangeTracking() {
      if (changeTrackingStarted) return
      changeTrackingStarted = true
      const slidesStore = useSlidesStore()

      // Track explicit presentation actions instead of deeply subscribing to
      // the complete store. A slide switch must stay O(1), even when slides
      // contain large base64 images.
      slidesStore.$onAction(({ name, after }) => {
        if (NON_CONTENT_SLIDE_ACTIONS.has(name)) return
        after(() => {
          if (this.suspendTracking || !this.activeDocumentId || this.authStatus !== 'authenticated') return
          this.markDirty()
        })
      }, true)
    },

    markDirty() {
      this.dirty = true
      if (this.saveStatus === 'conflict') return
      if (this.saveStatus !== 'saving') this.saveStatus = 'dirty'
    },

    canLeaveCurrentDocument() {
      if (savePromise || this.saveStatus === 'saving') {
        this.error = '文稿正在保存，请等待保存完成后再切换'
        return false
      }
      if (this.dirty || this.saveStatus === 'error' || this.saveStatus === 'conflict') {
        this.error = '当前文稿有未保存修改，请先点击“保存”再继续操作'
        return false
      }
      return true
    },

    async refreshDocuments() {
      const { documents } = await cloudApi.listDocuments()
      this.documents = documents
    },

    updateSummary(summary: Partial<CloudDocumentSummary> & { id: string }) {
      const index = this.documents.findIndex(document => document.id === summary.id)
      if (index >= 0) this.documents[index] = { ...this.documents[index], ...summary }
      else if ('title' in summary && 'slideCount' in summary && 'revision' in summary && 'createdAt' in summary && 'updatedAt' in summary) {
        this.documents.unshift(summary as CloudDocumentSummary)
      }
      this.documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },

    async applyCloudDocument(document: CloudDocument) {
      this.suspendTracking = true
      const mainStore = useMainStore()
      try {
        applyPresentation(document.content)
        mainStore.setActiveElementIdList([])
        mainStore.updateSelectedSlidesIndex([])
        await useSnapshotStore().resetSnapshotDatabase()

        this.activeDocumentId = document.id
        this.activeRevision = document.revision
        this.dirty = false
        this.saveStatus = 'saved'
        this.lastSavedAt = document.updatedAt
        this.error = ''
        this.updateSummary(document)
        localStorage.setItem('pptist_active_document', document.id)

        const url = new URL(window.location.href)
        url.searchParams.set('doc', document.id)
        window.history.replaceState(null, '', url)
      }
      finally {
        this.suspendTracking = false
      }
    },

    async openDocument(id: string, options: { skipSave?: boolean } = {}) {
      if (id === this.activeDocumentId && !options.skipSave) return true
      if (!options.skipSave && !this.canLeaveCurrentDocument()) return false

      this.loading = true
      this.error = ''
      try {
        const { document } = await cloudApi.getDocument(id)
        await this.applyCloudDocument(document)
        return true
      }
      catch (error) {
        this.error = error instanceof CloudApiError && error.status === 404 ? '文稿不存在或已被删除' : '文稿加载失败'
        return false
      }
      finally {
        this.loading = false
      }
    },

    async createDocument(title = '未命名演示文稿') {
      if (!this.canLeaveCurrentDocument()) return false
      this.loading = true
      try {
        const content = createBlankPresentation(title)
        const { document } = await cloudApi.createDocument(title, content)
        await this.applyCloudDocument(document)
        return true
      }
      catch {
        this.error = '创建文稿失败'
        return false
      }
      finally {
        this.loading = false
      }
    },

    saveNow() {
      if (savePromise) return savePromise
      if (!this.activeDocumentId || !this.dirty) return true
      if (this.saveStatus === 'conflict') return false

      const documentId = this.activeDocumentId
      const revision = this.activeRevision
      let content: ReturnType<typeof serializePresentation>
      try {
        content = serializePresentation()
      }
      catch {
        this.dirty = true
        this.saveStatus = 'error'
        this.error = '文稿数据暂时无法序列化，请先导出 JSON 备份后刷新页面'
        return false
      }
      this.dirty = false
      this.saveStatus = 'saving'

      savePromise = (async () => {
        try {
          const { document } = await cloudApi.saveDocument(documentId, content.title, content, revision)
          if (this.activeDocumentId === documentId) {
            this.activeRevision = document.revision
            this.lastSavedAt = document.updatedAt
            this.updateSummary(document)
            this.error = ''
            this.saveStatus = this.dirty ? 'dirty' : 'saved'
            if (this.dirty) this.markDirty()
          }
          return true
        }
        catch (error) {
          this.dirty = true
          if (error instanceof CloudApiError && error.status === 409) {
            this.saveStatus = 'conflict'
            this.error = '该文稿已在其他页面更新，请重新加载后继续'
          }
          else {
            this.saveStatus = 'error'
            this.error = '云端保存失败，修改仍保留在当前页面'
            if (error instanceof CloudApiError && error.status === 401) this.authStatus = 'unauthenticated'
          }
          return false
        }
        finally {
          savePromise = null
        }
      })()

      return savePromise
    },

    retrySave() {
      if (this.saveStatus === 'conflict') return false
      this.saveStatus = 'dirty'
      return this.saveNow()
    },

    reloadActiveDocument() {
      if (!this.activeDocumentId) return false
      this.dirty = false
      this.saveStatus = 'idle'
      return this.openDocument(this.activeDocumentId, { skipSave: true })
    },

    async renameDocument(id: string, title: string) {
      const normalized = title.trim()
      if (!normalized) return false
      if (id === this.activeDocumentId && !this.canLeaveCurrentDocument()) return false

      try {
        const revision = id === this.activeDocumentId
          ? this.activeRevision
          : this.documents.find(document => document.id === id)?.revision
        if (!revision) return false
        const { document } = await cloudApi.renameDocument(id, normalized, revision)
        this.updateSummary(document)
        if (id === this.activeDocumentId) {
          this.suspendTracking = true
          useSlidesStore().setTitle(document.title)
          this.activeRevision = document.revision
          this.lastSavedAt = document.updatedAt
          this.suspendTracking = false
        }
        return true
      }
      catch (error) {
        this.error = error instanceof CloudApiError && error.status === 409
          ? '文稿已在其他页面更新，请重新打开后再重命名'
          : '重命名失败'
        return false
      }
    },

    async duplicateDocument(id: string) {
      if (id === this.activeDocumentId && !this.canLeaveCurrentDocument()) return false
      try {
        const { document } = await cloudApi.duplicateDocument(id)
        this.updateSummary(document)
        return true
      }
      catch {
        this.error = '复制文稿失败'
        return false
      }
    },

    async deleteDocument(id: string) {
      try {
        await cloudApi.deleteDocument(id)
        this.documents = this.documents.filter(document => document.id !== id)
        if (id === this.activeDocumentId) {
          this.activeDocumentId = ''
          this.activeRevision = 0
          this.dirty = false
          this.saveStatus = 'idle'
          if (this.documents.length) await this.openDocument(this.documents[0].id, { skipSave: true })
          else await this.createDocument('未命名演示文稿')
        }
        return true
      }
      catch {
        this.error = '删除文稿失败'
        return false
      }
    },
  },
})
