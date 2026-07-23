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

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
let maxSaveTimer: ReturnType<typeof setTimeout> | null = null
let autoSaveStarted = false
let savePromise: Promise<boolean> | null = null

const clearSaveTimers = () => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  if (maxSaveTimer) clearTimeout(maxSaveTimer)
  autoSaveTimer = null
  maxSaveTimer = null
}

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
      if (!await this.flushSave()) return false
      await cloudApi.logout().catch(() => undefined)
      clearSaveTimers()
      this.$reset()
      this.authStatus = 'unauthenticated'
      useSlidesStore().setSlides([])
      return true
    },

    async initializeLibrary() {
      this.startAutoSave()
      await this.refreshDocuments()

      const queryId = new URLSearchParams(window.location.search).get('doc') || ''
      const rememberedId = localStorage.getItem('pptist_active_document') || ''
      const preferredId = [queryId, rememberedId].find(id => this.documents.some(document => document.id === id))

      if (preferredId) await this.openDocument(preferredId, { skipSave: true })
      else if (this.documents.length) await this.openDocument(this.documents[0].id, { skipSave: true })
      else await this.createDocument('未命名演示文稿')
    },

    startAutoSave() {
      if (autoSaveStarted) return
      autoSaveStarted = true
      const slidesStore = useSlidesStore()
      slidesStore.$subscribe(() => {
        if (this.suspendTracking || !this.activeDocumentId || this.authStatus !== 'authenticated') return
        this.markDirty()
      }, { detached: true, flush: 'sync' })
    },

    markDirty() {
      this.dirty = true
      if (this.saveStatus === 'conflict') return
      if (this.saveStatus !== 'saving') this.saveStatus = 'dirty'

      if (autoSaveTimer) clearTimeout(autoSaveTimer)
      autoSaveTimer = setTimeout(() => void this.saveNow(), 1200)
      if (!maxSaveTimer) maxSaveTimer = setTimeout(() => void this.saveNow(), 8000)
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
      if (!options.skipSave && !await this.flushSave()) return false

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
      if (!await this.flushSave()) return false
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
      clearSaveTimers()
      if (savePromise) return savePromise
      if (!this.activeDocumentId || !this.dirty) return true
      if (this.saveStatus === 'conflict') return false

      const documentId = this.activeDocumentId
      const revision = this.activeRevision
      const content = serializePresentation()
      this.dirty = false
      this.saveStatus = 'saving'

      savePromise = (async () => {
        try {
          const { document } = await cloudApi.saveDocument(documentId, content.title, content, revision)
          if (this.activeDocumentId === documentId) {
            this.activeRevision = document.revision
            this.lastSavedAt = document.updatedAt
            this.updateSummary(document)
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

    async flushSave() {
      clearSaveTimers()
      if (savePromise) await savePromise
      if (this.dirty) return this.saveNow()
      return this.saveStatus !== 'conflict' && this.saveStatus !== 'error'
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
      if (id === this.activeDocumentId && !await this.flushSave()) return false

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
      if (id === this.activeDocumentId && !await this.flushSave()) return false
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
