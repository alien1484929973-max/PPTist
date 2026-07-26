import type { CloudDocument, CloudDocumentSummary, CloudUser, MediaSettings, PresentationContent } from '@/types/cloud'

const API_BASE = '/api/cloud'

export class CloudApiError extends Error {
  status: number
  code: string
  data: Record<string, unknown>

  constructor(status: number, data: Record<string, unknown>) {
    super(String(data.error || 'request_failed'))
    this.status = status
    this.code = String(data.error || 'request_failed')
    this.data = data
  }
}

const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  const data = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new CloudApiError(response.status, data)
  return data as T
}

export const cloudApi = {
  login(username: string, password: string) {
    return request<{ user: CloudUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },

  logout() {
    return request<{ ok: true }>('/auth/logout', { method: 'POST' })
  },

  me() {
    return request<{ user: CloudUser }>('/auth/me')
  },

  getMediaSettings() {
    return request<{ settings: MediaSettings }>('/media/settings')
  },

  saveMediaSettings(apiKey: string) {
    return request<{ settings: MediaSettings }>('/media/settings', {
      method: 'PUT',
      body: JSON.stringify({ apiKey }),
    })
  },

  deleteMediaSettings() {
    return request<{ ok: true }>('/media/settings', { method: 'DELETE' })
  },

  listDocuments() {
    return request<{ documents: CloudDocumentSummary[] }>('/documents')
  },

  getDocument(id: string) {
    return request<{ document: CloudDocument }>(`/documents/${id}`)
  },

  createDocument(title: string, content: PresentationContent) {
    return request<{ document: CloudDocument }>('/documents', {
      method: 'POST',
      body: JSON.stringify({ title, content }),
    })
  },

  saveDocument(id: string, title: string, content: PresentationContent, revision: number) {
    return request<{ document: Pick<CloudDocumentSummary, 'id' | 'title' | 'slideCount' | 'revision' | 'updatedAt'> }>(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title, content, revision }),
    })
  },

  renameDocument(id: string, title: string, revision: number) {
    return request<{ document: Pick<CloudDocumentSummary, 'id' | 'title' | 'revision' | 'updatedAt'> }>(`/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title, revision }),
    })
  },

  duplicateDocument(id: string) {
    return request<{ document: CloudDocument }>(`/documents/${id}/duplicate`, { method: 'POST' })
  },

  deleteDocument(id: string) {
    return request<{ ok: true }>(`/documents/${id}`, { method: 'DELETE' })
  },
}
