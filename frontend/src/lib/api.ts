import { API_URL } from './config'
import type { AuthResponse, Conversation, Message, ReactionsUpdate, User } from './types'

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
  health: (signal?: AbortSignal) => request<{ status: string }>('/api/health', { signal }),

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

  send: (conversationId: number, content: string, replyToId: number | null, clientId: string) =>
    request<Message>(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { content, replyToId, clientId },
    }),

  markRead: (conversationId: number, messageId: number) =>
    request<void>(`/api/conversations/${conversationId}/read`, { method: 'POST', body: { messageId } }),

  edit: (messageId: number, content: string) =>
    request<Message>(`/api/messages/${messageId}`, { method: 'PATCH', body: { content } }),

  remove: (messageId: number) => request<Message>(`/api/messages/${messageId}`, { method: 'DELETE' }),

  react: (messageId: number, emoji: string) =>
    request<ReactionsUpdate>(`/api/messages/${messageId}/reactions`, { method: 'POST', body: { emoji } }),
}
