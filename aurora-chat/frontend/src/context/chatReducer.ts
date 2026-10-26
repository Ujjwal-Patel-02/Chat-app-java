import type { Conversation, Message, Presence, Reaction, ReplyPreview, TypingPayload } from '../lib/types'
import { truncate } from '../lib/format'

export interface MessagesState {
  items: Message[]
  hasMore: boolean
  loading: boolean
  loaded: boolean
}

export interface TypingEntry {
  name: string
  expiresAt: number
}

export type ConnectionStatus = 'connecting' | 'online' | 'offline'

export interface ChatState {
  conversations: Record<number, Conversation>
  conversationsLoaded: boolean
  messages: Record<number, MessagesState>
  activeId: number | null
  presence: Record<number, { online: boolean; lastSeenAt: string | null }>
  typing: Record<number, Record<number, TypingEntry>>
  connection: ConnectionStatus
}

export type ChatAction =
  | { type: 'conversations/loaded'; conversations: Conversation[] }
  | { type: 'conversation/upsert'; conversation: Conversation }
  | { type: 'active/set'; id: number | null }
  | { type: 'messages/loading'; conversationId: number }
  | { type: 'messages/loaded'; conversationId: number; items: Message[]; hasMore: boolean; mode: 'replace' | 'prepend' }
  | { type: 'messages/loadFailed'; conversationId: number }
  | { type: 'message/pending'; message: Message }
  | { type: 'message/received'; message: Message; myId: number; viewing: boolean }
  | { type: 'message/failed'; conversationId: number; clientId: string }
  | { type: 'message/discard'; conversationId: number; clientId: string }
  | { type: 'message/updated'; message: Message }
  | { type: 'reactions/updated'; conversationId: number; messageId: number; reactions: Reaction[] }
  | { type: 'read'; conversationId: number; userId: number; lastReadMessageId: number; myId: number }
  | { type: 'presence'; presence: Presence }
  | { type: 'typing'; payload: TypingPayload }
  | { type: 'typing/prune'; now: number }
  | { type: 'connection'; status: ConnectionStatus }
  | { type: 'conversation/muted'; conversationId: number; muted: boolean }

export const initialChatState: ChatState = {
  conversations: {},
  conversationsLoaded: false,
  messages: {},
  activeId: null,
  presence: {},
  typing: {},
  connection: 'connecting',
}

const EMPTY_MESSAGES: MessagesState = { items: [], hasMore: true, loading: false, loaded: false }
const TYPING_TTL_MS = 6000

/** Confirmed messages ordered by id; optimistic (negative id) messages stay at the end. */
function normalize(items: Message[]): Message[] {
  const confirmed = items.filter((m) => m.id > 0).sort((a, b) => a.id - b.id)
  const local = items.filter((m) => m.id < 0)
  return [...confirmed, ...local]
}

function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map<number, Message>()
  for (const message of existing) if (message.id > 0) byId.set(message.id, message)
  for (const message of incoming) {
    const previous = byId.get(message.id)
    // Keep the optimistic clientId so React keys stay stable across a resync.
    byId.set(message.id, previous?.clientId && !message.clientId ? { ...message, clientId: previous.clientId } : message)
  }
  const confirmedClientIds = new Set(incoming.map((m) => m.clientId).filter(Boolean))
  const local = existing.filter((m) => m.id < 0 && !confirmedClientIds.has(m.clientId))
  return normalize([...byId.values(), ...local])
}

function seedPresence(state: ChatState, conversations: Conversation[]): ChatState['presence'] {
  const presence = { ...state.presence }
  for (const conversation of conversations) {
    for (const member of conversation.members) {
      presence[member.id] = { online: member.online, lastSeenAt: member.lastSeenAt }
    }
  }
  return presence
}

function updateConversation(state: ChatState, id: number, update: (c: Conversation) => Conversation): ChatState {
  const conversation = state.conversations[id]
  if (!conversation) return state
  return { ...state, conversations: { ...state.conversations, [id]: update(conversation) } }
}

function withReadState(conversation: Conversation, userId: number, messageId: number): Conversation {
  const existing = conversation.readStates.find((r) => r.userId === userId)
  if (existing && (existing.lastReadMessageId ?? 0) >= messageId) return conversation
  const readStates = existing
    ? conversation.readStates.map((r) => (r.userId === userId ? { ...r, lastReadMessageId: messageId } : r))
    : [...conversation.readStates, { userId, lastReadMessageId: messageId }]
  return { ...conversation, readStates }
}

function updateMessages(state: ChatState, conversationId: number, update: (items: Message[]) => Message[]): ChatState {
  const current = state.messages[conversationId]
  if (!current) return state
  return { ...state, messages: { ...state.messages, [conversationId]: { ...current, items: update(current.items) } } }
}

function replyPreviewOf(message: Message): Partial<ReplyPreview> {
  const first = message.deleted ? undefined : message.attachments[0]
  return {
    content: message.deleted || !message.content ? null : truncate(message.content, 160),
    deleted: message.deleted,
    attachmentKind: first?.kind ?? null,
    attachmentCount: message.deleted ? 0 : message.attachments.length,
    thumbnailUrl: first ? (first.thumbnailUrl ?? (first.kind === 'IMAGE' ? first.url : null)) : null,
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'conversations/loaded': {
      const conversations: Record<number, Conversation> = {}
      for (const conversation of action.conversations) {
        conversations[conversation.id] =
          state.activeId === conversation.id ? { ...conversation, unreadCount: 0 } : conversation
      }
      return { ...state, conversations, conversationsLoaded: true, presence: seedPresence(state, action.conversations) }
    }

    case 'conversation/upsert': {
      const existing = state.conversations[action.conversation.id]
      const merged: Conversation = {
        ...existing,
        ...action.conversation,
        lastMessage: action.conversation.lastMessage ?? existing?.lastMessage ?? null,
        unreadCount: existing ? existing.unreadCount : action.conversation.unreadCount,
      }
      return {
        ...state,
        conversations: { ...state.conversations, [merged.id]: merged },
        presence: seedPresence(state, [action.conversation]),
      }
    }

    case 'active/set': {
      const next = { ...state, activeId: action.id }
      return action.id === null ? next : updateConversation(next, action.id, (c) => ({ ...c, unreadCount: 0 }))
    }

    case 'messages/loading': {
      const current = state.messages[action.conversationId] ?? EMPTY_MESSAGES
      return { ...state, messages: { ...state.messages, [action.conversationId]: { ...current, loading: true } } }
    }

    case 'messages/loaded': {
      const current = state.messages[action.conversationId] ?? EMPTY_MESSAGES
      const items =
        action.mode === 'prepend'
          ? mergeMessages(current.items, action.items)
          : mergeMessages(current.loaded ? current.items : current.items.filter((m) => m.id < 0), action.items)
      const hasMore = action.mode === 'prepend' || !current.loaded ? action.hasMore : current.hasMore
      return {
        ...state,
        messages: { ...state.messages, [action.conversationId]: { items, hasMore, loading: false, loaded: true } },
      }
    }

    case 'messages/loadFailed': {
      const current = state.messages[action.conversationId] ?? EMPTY_MESSAGES
      return { ...state, messages: { ...state.messages, [action.conversationId]: { ...current, loading: false } } }
    }

    case 'message/pending': {
      const { message } = action
      const current = state.messages[message.conversationId] ?? { ...EMPTY_MESSAGES, loaded: true }
      const next: ChatState = {
        ...state,
        messages: { ...state.messages, [message.conversationId]: { ...current, items: [...current.items, message] } },
      }
      return updateConversation(next, message.conversationId, (c) => ({ ...c, lastMessage: message, updatedAt: message.createdAt }))
    }

    case 'message/received': {
      const { message, myId } = action
      const conversationId = message.conversationId
      const current = state.messages[conversationId]
      let isNew = true
      let next = state
      if (current) {
        const items = [...current.items]
        const existingIndex = items.findIndex((m) => m.id === message.id)
        const pendingIndex = message.clientId ? items.findIndex((m) => m.id < 0 && m.clientId === message.clientId) : -1
        if (existingIndex >= 0) {
          isNew = false
          items[existingIndex] = { ...message, clientId: items[existingIndex].clientId ?? message.clientId }
          if (pendingIndex >= 0) items.splice(pendingIndex, 1)
        } else if (pendingIndex >= 0) {
          isNew = false
          items[pendingIndex] = message
        } else {
          items.push(message)
        }
        next = { ...state, messages: { ...state.messages, [conversationId]: { ...current, items: normalize(items) } } }
      } else if (message.sender.id === myId) {
        isNew = false
      }

      next = updateConversation(next, conversationId, (c) => {
        const last = c.lastMessage
        const lastMessage = !last || last.id < 0 || message.id >= last.id ? message : last
        const unread = isNew && message.sender.id !== myId && !action.viewing ? c.unreadCount + 1 : c.unreadCount
        const updatedAt = message.createdAt > c.updatedAt ? message.createdAt : c.updatedAt
        return withReadState({ ...c, lastMessage, unreadCount: unread, updatedAt }, message.sender.id, message.id)
      })

      // The sender just sent a message, so they're no longer typing.
      const typingInConversation = next.typing[conversationId]
      if (typingInConversation?.[message.sender.id]) {
        const rest = { ...typingInConversation }
        delete rest[message.sender.id]
        next = { ...next, typing: { ...next.typing, [conversationId]: rest } }
      }
      return next
    }

    case 'message/failed':
      return updateMessages(state, action.conversationId, (items) =>
        items.map((m) => (m.clientId === action.clientId && m.id < 0 ? { ...m, pending: false, failed: true } : m)),
      )

    case 'message/discard':
      return updateMessages(state, action.conversationId, (items) =>
        items.filter((m) => !(m.clientId === action.clientId && m.id < 0)),
      )

    case 'message/updated': {
      const { message } = action
      const preview = replyPreviewOf(message)
      let next = updateMessages(state, message.conversationId, (items) =>
        items.map((m) => {
          if (m.id === message.id) return { ...message, clientId: m.clientId ?? message.clientId }
          if (m.replyTo?.id === message.id) return { ...m, replyTo: { ...m.replyTo, ...preview } }
          return m
        }),
      )
      next = updateConversation(next, message.conversationId, (c) =>
        c.lastMessage?.id === message.id ? { ...c, lastMessage: message } : c,
      )
      return next
    }

    case 'reactions/updated':
      return updateMessages(state, action.conversationId, (items) =>
        items.map((m) => (m.id === action.messageId ? { ...m, reactions: action.reactions } : m)),
      )

    case 'read':
      return updateConversation(state, action.conversationId, (c) => {
        const updated = withReadState(c, action.userId, action.lastReadMessageId)
        return action.userId === action.myId ? { ...updated, unreadCount: 0 } : updated
      })

    case 'presence': {
      const { userId, online, lastSeenAt } = action.presence
      const previous = state.presence[userId]
      return {
        ...state,
        presence: { ...state.presence, [userId]: { online, lastSeenAt: lastSeenAt ?? previous?.lastSeenAt ?? null } },
      }
    }

    case 'typing': {
      const { conversationId, user, typing } = action.payload
      const entries = { ...(state.typing[conversationId] ?? {}) }
      if (typing) entries[user.id] = { name: user.displayName, expiresAt: Date.now() + TYPING_TTL_MS }
      else delete entries[user.id]
      return { ...state, typing: { ...state.typing, [conversationId]: entries } }
    }

    case 'typing/prune': {
      let changed = false
      const typing: ChatState['typing'] = {}
      for (const [conversationId, entries] of Object.entries(state.typing)) {
        const kept: Record<number, TypingEntry> = {}
        for (const [userId, entry] of Object.entries(entries)) {
          if (entry.expiresAt > action.now) kept[Number(userId)] = entry
          else changed = true
        }
        typing[Number(conversationId)] = kept
      }
      return changed ? { ...state, typing } : state
    }

    case 'connection':
      return state.connection === action.status ? state : { ...state, connection: action.status }

    case 'conversation/muted':
      return updateConversation(state, action.conversationId, (c) => ({ ...c, muted: action.muted }))
  }
}
