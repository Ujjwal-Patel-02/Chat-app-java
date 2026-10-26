import { API_URL } from './config'
import type { Attachment, AuthResponse, Conversation, MediaItem, Message, MuteState, ReactionsUpdate, User } from './types'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

let authToken: string | null = null
let unauthorizedHandler: (() => void) | null = null

export function setAuthToken(token: string | null) {
  authToken = token
}

export function getAuthToken(): string | null {
  return authToken
}

/** Called when an authenticated request comes back 401 (expired token, deleted account...). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

interface RequestOptions {
  method?: string
  body?: unknown
  signal?: AbortSignal
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (authToken) headers.Authorization = `Bearer ${authToken}`

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, "Can't reach the server. It may be waking up — please try again in a moment.")
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  const data = text ? parseJson(text) : null

  if (!response.ok) {
    if (response.status === 401 && authToken && unauthorizedHandler) unauthorizedHandler()
    const message =
      data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
        ? data.message
        : `Request failed (${response.status})`
    throw new ApiError(response.status, message)
  }
  return data as T
}

/** Retries transient failures (network errors, 502/503/504 while a free instance boots). */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 20, delayMs = 3000): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const transient = error instanceof ApiError && (error.status === 0 || error.status >= 502)
      if (!transient) throw error
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastError
}

export const api = {
  health: (signal?: AbortSignal) =>
    request<{ status: string; version?: string; uptime?: string; keepAlive?: string }>('/api/health', { signal }),

  register: (username: string, displayName: string, password: string) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body: { username, displayName, password } }),

  login: (username: string, password: string) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: { username, password } }),

  me: () => request<User>('/api/auth/me'),

  users: (query = '') =>
    request<User[]>(`/api/users${query ? `?query=${encodeURIComponent(query)}` : ''}`),

  conversations: () => request<Conversation[]>('/api/conversations'),

  openDirect: (userId: number) =>
    request<Conversation>('/api/conversations/direct', { method: 'POST', body: { userId } }),

  createGroup: (name: string, memberIds: number[]) =>
    request<Conversation>('/api/conversations/group', { method: 'POST', body: { name, memberIds } }),

  messages: (conversationId: number, before?: number, limit = 40) =>
    request<Message[]>(
      `/api/conversations/${conversationId}/messages?limit=${limit}${before ? `&before=${before}` : ''}`,
    ),

  send: (conversationId: number, content: string, replyToId: number | null, clientId: string, attachmentIds: string[] = []) =>
    request<Message>(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { content, replyToId, clientId, attachmentIds },
    }),

  media: (conversationId: number, before?: number) =>
    request<MediaItem[]>(`/api/conversations/${conversationId}/media?limit=60${before ? `&before=${before}` : ''}`),

  mute: (conversationId: number, muted: boolean) =>
    request<MuteState>(`/api/conversations/${conversationId}/mute`, { method: 'PUT', body: { muted } }),

  pushConfig: () => request<{ enabled: boolean; publicKey: string | null }>('/api/push/config'),

  pushSubscribe: (subscription: PushSubscriptionJSON) =>
    request<void>('/api/push/subscriptions', { method: 'POST', body: subscription }),

  pushUnsubscribe: (endpoint: string) => request<void>('/api/push/subscriptions', { method: 'DELETE', body: { endpoint } }),

  pushTest: () => request<{ devices: number }>('/api/push/test', { method: 'POST', body: {} }),

  markRead: (conversationId: number, messageId: number) =>
    request<void>(`/api/conversations/${conversationId}/read`, { method: 'POST', body: { messageId } }),

  edit: (messageId: number, content: string) =>
    request<Message>(`/api/messages/${messageId}`, { method: 'PATCH', body: { content } }),

  remove: (messageId: number) => request<Message>(`/api/messages/${messageId}`, { method: 'DELETE' }),

  react: (messageId: number, emoji: string) =>
    request<ReactionsUpdate>(`/api/messages/${messageId}/reactions`, { method: 'POST', body: { emoji } }),
}

/** Multipart upload with progress events (fetch can't report upload progress). */
export function uploadFile(form: FormData, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_URL}/api/media`)
    if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      let data: unknown = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1)
        resolve(data as Attachment)
      } else {
        if (xhr.status === 401 && unauthorizedHandler) unauthorizedHandler()
        const message =
          data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
            ? data.message
            : xhr.status === 413
              ? 'That file is too large.'
              : `Upload failed (${xhr.status})`
        reject(new ApiError(xhr.status, message))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, "Can't reach the server. Check your connection and try again."))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(form)
  })
}
