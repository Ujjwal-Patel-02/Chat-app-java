import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Client } from '@stomp/stompjs'
import { ApiError, api } from '../lib/api'
import { WS_URL } from '../lib/config'
import { conversationIdFromPath, haptic } from '../lib/device'
import { conversationTitle, firstName, truncate } from '../lib/format'
import { describeAttachments, rememberLocalPreview } from '../lib/media'
import { pushActive, showLocalNotification, syncPush } from '../lib/push'
import { setAppBadge } from '../lib/pwa'
import { playMessageSound } from '../lib/sound'
import type { ChatEvent, Conversation, Message, Presence, Reaction, ReplyPreview, User } from '../lib/types'
import { awaitUpload, getUpload, pendingAttachment, removeUpload } from '../lib/uploads'
import { emitBanner } from '../components/InAppNotifications'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { chatReducer, initialChatState, type ChatState, type MessagesState } from './chatReducer'

const PAGE_SIZE = 40

type HistoryMode = 'push' | 'replace' | 'none'

/** Stable functions (identity never changes) so memoized message rows don't re-render on every event. */
export interface ChatActions {
  me: User
  selectConversation: (id: number | null, history?: HistoryMode) => void
  loadOlder: (conversationId: number) => Promise<void>
  getMessagesState: (conversationId: number) => MessagesState | undefined
  getConversation: (conversationId: number) => Conversation | undefined
  sendMessage: (conversationId: number, content: string, replyTo: ReplyPreview | null, uploadIds?: string[]) => Promise<void>
  retryMessage: (message: Message) => void
  discardMessage: (message: Message) => void
  editMessage: (messageId: number, content: string) => Promise<void>
  deleteMessage: (messageId: number) => Promise<void>
  toggleReaction: (message: Message, emoji: string) => Promise<void>
  openDirect: (userId: number) => Promise<void>
  createGroup: (name: string, memberIds: number[]) => Promise<void>
  sendTyping: (conversationId: number, typing: boolean) => void
  setMuted: (conversationId: number, muted: boolean) => Promise<void>
}

interface ChatStateValue {
  state: ChatState
  conversations: Conversation[]
  activeConversation: Conversation | null
  totalUnread: number
}

const ChatActionsContext = createContext<ChatActions | null>(null)
const ChatStateContext = createContext<ChatStateValue | null>(null)

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

/** Applies the current user's reaction toggle locally for an instant response. */
function toggleLocally(reactions: Reaction[], emoji: string, me: User): Reaction[] {
  const existing = reactions.find((r) => r.emoji === emoji)
  const mine = existing?.users.some((u) => u.id === me.id)
  if (existing && mine) {
    const users = existing.users.filter((u) => u.id !== me.id)
    return users.length === 0
      ? reactions.filter((r) => r.emoji !== emoji)
      : reactions.map((r) => (r.emoji === emoji ? { ...r, users, count: users.length } : r))
  }
  const summary = { id: me.id, username: me.username, displayName: me.displayName }
  if (existing) {
    return reactions.map((r) => (r.emoji === emoji ? { ...r, users: [...r.users, summary], count: r.count + 1 } : r))
  }
  return [...reactions, { emoji, count: 1, users: [summary] }]
}

/** Notification text, mirroring what the server puts in push notifications. */
export function notificationText(message: Message, conversation: Conversation | undefined, meId: number) {
  const group = conversation?.type === 'GROUP'
  const media = describeAttachments(message.attachments)
  const caption = message.content?.trim() ?? ''
  const text = media && caption ? `${media} · ${caption}` : media || caption
  return {
    title: conversation ? conversationTitle(conversation, meId) : message.sender.displayName,
    body: truncate(group ? `${firstName(message.sender.displayName)}: ${text}` : text, 180),
  }
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  const me = user as User
  const { notify } = useToast()
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const [visibilityTick, setVisibilityTick] = useState(0)

  const stateRef = useRef(state)
  useLayoutEffect(() => {
    stateRef.current = state
  })
  const meRef = useRef(me)
  meRef.current = me
  const clientRef = useRef<Client | null>(null)
  const inFlight = useRef(new Set<string>())
  const tempId = useRef(0)
  const pendingUploads = useRef(new Map<string, string[]>()) // clientId -> upload ids
  const deepLinkHandled = useRef(false)

  const loadConversations = useCallback(async () => {
    try {
      dispatch({ type: 'conversations/loaded', conversations: await api.conversations() })
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) notify(errorMessage(error), 'error')
    }
  }, [notify])

  const loadMessages = useCallback(
    async (conversationId: number, mode: 'replace' | 'prepend') => {
      const key = `${conversationId}:${mode}`
      if (inFlight.current.has(key)) return
      const current = stateRef.current.messages[conversationId]
      const oldest = current?.items.find((m) => m.id > 0)?.id
      if (mode === 'prepend' && (!current?.hasMore || oldest === undefined)) return
      inFlight.current.add(key)
      dispatch({ type: 'messages/loading', conversationId })
      try {
        const items = await api.messages(conversationId, mode === 'prepend' ? oldest : undefined, PAGE_SIZE)
        dispatch({ type: 'messages/loaded', conversationId, items, hasMore: items.length === PAGE_SIZE, mode })
      } catch (error) {
        dispatch({ type: 'messages/loadFailed', conversationId })
        notify(errorMessage(error), 'error')
      } finally {
        inFlight.current.delete(key)
      }
    },
    [notify],
  )

  const selectConversation = useCallback(
    (id: number | null, history: HistoryMode = 'push') => {
      dispatch({ type: 'active/set', id })
      if (id !== null && !stateRef.current.messages[id]?.loaded) void loadMessages(id, 'replace')
      if (history !== 'none') {
        const path = id === null ? '/' : `/c/${id}`
        if (window.location.pathname !== path) {
          if (history === 'push') window.history.pushState({ conversationId: id }, '', path)
          else window.history.replaceState({ conversationId: id }, '', path)
        }
      }
    },
    [loadMessages],
  )

  // Initial data + register this device for push again (subscriptions rotate).
  useEffect(() => {
    void loadConversations()
    void syncPush()
  }, [loadConversations])

  // Deep link (/c/123, e.g. from a notification): open it once conversations are known, and make
  // "back" return to the list instead of leaving the app.
  useEffect(() => {
    if (!state.conversationsLoaded || deepLinkHandled.current) return
    deepLinkHandled.current = true
    const id = conversationIdFromPath()
    if (id !== null && state.conversations[id]) {
      window.history.replaceState(null, '', '/')
      selectConversation(id, 'push')
    } else if (id !== null) {
      window.history.replaceState(null, '', '/')
    }
  }, [state.conversationsLoaded, state.conversations, selectConversation])

  // Browser back/forward and notification clicks.
  useEffect(() => {
    const onPopState = () => selectConversation(conversationIdFromPath(), 'none')
    const onOpen = (event: Event) => {
      const id = (event as CustomEvent<number>).detail
      if (!id) return
      if (!stateRef.current.conversations[id]) void loadConversations()
      selectConversation(id, stateRef.current.activeId === null ? 'push' : 'replace')
    }
    window.addEventListener('popstate', onPopState)
    window.addEventListener('aurora:open-conversation', onOpen)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('aurora:open-conversation', onOpen)
    }
  }, [selectConversation, loadConversations])

  // Real-time connection (STOMP over WebSocket) with automatic reconnects.
  useEffect(() => {
    if (!token) return
    const myId = me.id

    const alertIncoming = (message: Message) => {
      const conversation = stateRef.current.conversations[message.conversationId]
      if (message.sender.id === myId || conversation?.muted) return
      const visible = document.visibilityState === 'visible'
      if (visible && stateRef.current.activeId === message.conversationId) return
      const { title, body } = notificationText(message, conversation, myId)
      if (visible) {
        emitBanner({ conversationId: message.conversationId, title, body, sender: message.sender, group: conversation?.type === 'GROUP' })
        playMessageSound()
        haptic([12, 40, 12])
      } else if (!pushActive()) {
        void showLocalNotification(title, { body, tag: `conversation-${message.conversationId}`, url: `/c/${message.conversationId}` })
      }
    }

    const handleEvent = (event: ChatEvent) => {
      switch (event.type) {
        case 'MESSAGE_CREATED': {
          const known = Boolean(stateRef.current.conversations[event.conversationId])
          const viewing = stateRef.current.activeId === event.conversationId && document.visibilityState === 'visible'
          dispatch({ type: 'message/received', message: event.payload, myId, viewing })
          if (!known) void loadConversations()
          alertIncoming(event.payload)
          break
        }
        case 'MESSAGE_UPDATED':
          dispatch({ type: 'message/updated', message: event.payload })
          break
        case 'REACTIONS_UPDATED':
          dispatch({ type: 'reactions/updated', conversationId: event.conversationId, messageId: event.payload.messageId, reactions: event.payload.reactions })
          break
        case 'CONVERSATION_UPSERTED':
          dispatch({ type: 'conversation/upsert', conversation: event.payload })
          break
        case 'TYPING':
          dispatch({ type: 'typing', payload: event.payload })
          break
        case 'READ':
          dispatch({ type: 'read', conversationId: event.conversationId, userId: event.payload.userId, lastReadMessageId: event.payload.lastReadMessageId ?? 0, myId })
          break
        case 'MUTE_UPDATED':
          dispatch({ type: 'conversation/muted', conversationId: event.conversationId, muted: event.payload.muted })
          break
      }
    }

    const client = new Client({
      brokerURL: WS_URL,
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 3000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      debug: () => {},
    })
    client.onConnect = () => {
      dispatch({ type: 'connection', status: 'online' })
      client.subscribe('/user/queue/events', (frame) => handleEvent(JSON.parse(frame.body) as ChatEvent))
      client.subscribe('/topic/presence', (frame) => dispatch({ type: 'presence', presence: JSON.parse(frame.body) as Presence }))
      // Catch up on anything that happened while we were disconnected.
      void loadConversations()
      const active = stateRef.current.activeId
      if (active) void loadMessages(active, 'replace')
    }
    client.onWebSocketClose = () => dispatch({ type: 'connection', status: 'connecting' })
    client.onStompError = (frame) => console.warn('STOMP error:', frame.headers.message)
    client.activate()
    clientRef.current = client

    const onOffline = () => dispatch({ type: 'connection', status: 'offline' })
    // Phones suspend background tabs: reconnect immediately when the app comes back.
    const onResume = () => {
      if (document.visibilityState === 'visible' && !client.connected) {
        void client.deactivate().then(() => client.activate())
      }
    }
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onResume)
    document.addEventListener('visibilitychange', onResume)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onResume)
      document.removeEventListener('visibilitychange', onResume)
      clientRef.current = null
      void client.deactivate()
    }
  }, [token, me.id, loadConversations, loadMessages])

  // Expire stale typing indicators.
  useEffect(() => {
    const timer = window.setInterval(() => dispatch({ type: 'typing/prune', now: Date.now() }), 1500)
    return () => window.clearInterval(timer)
  }, [])

  // Re-check read state when the tab becomes visible again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setVisibilityTick((tick) => tick + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  // Mark the open conversation as read up to its newest message.
  const activeId = state.activeId
  const activeItems = activeId ? state.messages[activeId]?.items : undefined
  const latestConfirmedId = activeItems ? [...activeItems].reverse().find((m) => m.id > 0)?.id : undefined
  useEffect(() => {
    if (!activeId || !latestConfirmedId || document.visibilityState !== 'visible') return
    const conversation = stateRef.current.conversations[activeId]
    const myRead = conversation?.readStates.find((r) => r.userId === me.id)?.lastReadMessageId ?? 0
    if (myRead >= latestConfirmedId) return
    dispatch({ type: 'read', conversationId: activeId, userId: me.id, lastReadMessageId: latestConfirmedId, myId: me.id })
    api.markRead(activeId, latestConfirmedId).catch(() => {})
  }, [activeId, latestConfirmedId, visibilityTick, me.id])

  const conversations = useMemo(
    () =>
      Object.values(state.conversations).sort((a, b) => {
        const at = a.lastMessage?.createdAt ?? a.updatedAt
        const bt = b.lastMessage?.createdAt ?? b.updatedAt
        return bt.localeCompare(at)
      }),
    [state.conversations],
  )

  const totalUnread = useMemo(() => conversations.reduce((sum, c) => sum + c.unreadCount, 0), [conversations])

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) Aurora Chat` : 'Aurora Chat'
    setAppBadge(totalUnread)
  }, [totalUnread])

  const loadOlder = useCallback((conversationId: number) => loadMessages(conversationId, 'prepend'), [loadMessages])
  const getMessagesState = useCallback((conversationId: number) => stateRef.current.messages[conversationId], [])
  const getConversation = useCallback((conversationId: number) => stateRef.current.conversations[conversationId], [])

  const deliver = useCallback(
    async (conversationId: number, content: string, replyTo: ReplyPreview | null, uploadIds: string[], clientId?: string) => {
      const current = meRef.current
      tempId.current -= 1
      const id = clientId ?? `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
      const optimistic: Message = {
        id: tempId.current,
        conversationId,
        sender: { id: current.id, username: current.username, displayName: current.displayName },
        content: content || null,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deleted: false,
        replyTo,
        reactions: [],
        attachments: uploadIds.map(pendingAttachment),
        clientId: id,
        pending: true,
      }
      if (uploadIds.length) pendingUploads.current.set(id, uploadIds)
      dispatch({ type: 'message/pending', message: optimistic })
      try {
        const attachments = await Promise.all(uploadIds.map(awaitUpload))
        const saved = await api.send(conversationId, content, replyTo?.id ?? null, id, attachments.map((a) => a.id))
        saved.attachments.forEach((attachment, index) => {
          const media = getUpload(uploadIds[index])?.media
          if (media) rememberLocalPreview(attachment.id, media.previewUrl, media.posterUrl ?? undefined)
        })
        uploadIds.forEach((uploadId) => removeUpload(uploadId, true))
        pendingUploads.current.delete(id)
        dispatch({ type: 'message/received', message: saved, myId: current.id, viewing: true })
      } catch (error) {
        dispatch({ type: 'message/failed', conversationId, clientId: id })
        notify(errorMessage(error), 'error')
      }
    },
    [notify],
  )

  const sendMessage = useCallback(
    (conversationId: number, content: string, replyTo: ReplyPreview | null, uploadIds: string[] = []) =>
      deliver(conversationId, content, replyTo, uploadIds),
    [deliver],
  )

  const discardMessage = useCallback((message: Message) => {
    if (!message.clientId) return
    pendingUploads.current.get(message.clientId)?.forEach((uploadId) => removeUpload(uploadId))
    pendingUploads.current.delete(message.clientId)
    dispatch({ type: 'message/discard', conversationId: message.conversationId, clientId: message.clientId })
  }, [])

  const retryMessage = useCallback(
    (message: Message) => {
      if (!message.clientId) return
      const uploadIds = pendingUploads.current.get(message.clientId) ?? []
      dispatch({ type: 'message/discard', conversationId: message.conversationId, clientId: message.clientId })
      void deliver(message.conversationId, message.content ?? '', message.replyTo, uploadIds, message.clientId)
    },
    [deliver],
  )

  const editMessage = useCallback(
    async (messageId: number, content: string) => {
      try {
        dispatch({ type: 'message/updated', message: await api.edit(messageId, content) })
      } catch (error) {
        notify(errorMessage(error), 'error')
      }
    },
    [notify],
  )

  const deleteMessage = useCallback(
    async (messageId: number) => {
      try {
        dispatch({ type: 'message/updated', message: await api.remove(messageId) })
      } catch (error) {
        notify(errorMessage(error), 'error')
      }
    },
    [notify],
  )

  const toggleReaction = useCallback(
    async (message: Message, emoji: string) => {
      if (message.id < 0 || message.deleted) return
      const live = stateRef.current.messages[message.conversationId]?.items.find((m) => m.id === message.id) ?? message
      const previous = live.reactions
      const update = (reactions: Reaction[]) =>
        dispatch({ type: 'reactions/updated', conversationId: message.conversationId, messageId: message.id, reactions })
      update(toggleLocally(previous, emoji, meRef.current))
      try {
        update((await api.react(message.id, emoji)).reactions)
      } catch (error) {
        update(previous)
        notify(errorMessage(error), 'error')
      }
    },
    [notify],
  )

  const openDirect = useCallback(
    async (userId: number) => {
      const conversation = await api.openDirect(userId)
      dispatch({ type: 'conversation/upsert', conversation })
      selectConversation(conversation.id)
    },
    [selectConversation],
  )

  const createGroup = useCallback(
    async (name: string, memberIds: number[]) => {
      const conversation = await api.createGroup(name, memberIds)
      dispatch({ type: 'conversation/upsert', conversation })
      selectConversation(conversation.id)
    },
    [selectConversation],
  )

  const sendTyping = useCallback((conversationId: number, typing: boolean) => {
    const client = clientRef.current
    if (!client?.connected) return
    client.publish({
      destination: `/app/conversations/${conversationId}/typing`,
      body: JSON.stringify({ typing }),
      headers: { 'content-type': 'application/json' },
    })
  }, [])

  const setMuted = useCallback(
    async (conversationId: number, muted: boolean) => {
      dispatch({ type: 'conversation/muted', conversationId, muted })
      try {
        await api.mute(conversationId, muted)
        notify(muted ? 'Notifications muted for this chat' : 'Notifications turned back on', 'success')
      } catch (error) {
        dispatch({ type: 'conversation/muted', conversationId, muted: !muted })
        notify(errorMessage(error), 'error')
      }
    },
    [notify],
  )

  const actions = useMemo<ChatActions>(
    () => ({
      me,
      selectConversation,
      loadOlder,
      getMessagesState,
      getConversation,
      sendMessage,
      retryMessage,
      discardMessage,
      editMessage,
      deleteMessage,
      toggleReaction,
      openDirect,
      createGroup,
      sendTyping,
      setMuted,
    }),
    [me, selectConversation, loadOlder, getMessagesState, getConversation, sendMessage, retryMessage, discardMessage,
      editMessage, deleteMessage, toggleReaction, openDirect, createGroup, sendTyping, setMuted],
  )

  const activeConversation = activeId ? (state.conversations[activeId] ?? null) : null
  const stateValue = useMemo<ChatStateValue>(
    () => ({ state, conversations, activeConversation, totalUnread }),
    [state, conversations, activeConversation, totalUnread],
  )

  return (
    <ChatActionsContext.Provider value={actions}>
      <ChatStateContext.Provider value={stateValue}>{children}</ChatStateContext.Provider>
    </ChatActionsContext.Provider>
  )
}

export function useChatActions(): ChatActions {
  const context = useContext(ChatActionsContext)
  if (!context) throw new Error('useChatActions must be used inside <ChatProvider>')
  return context
}

/** Everything (state + actions). Re-renders on every chat event — prefer useChatActions in list rows. */
export function useChat(): ChatStateValue & ChatActions {
  const actions = useChatActions()
  const value = useContext(ChatStateContext)
  if (!value) throw new Error('useChat must be used inside <ChatProvider>')
  return { ...value, ...actions }
}
