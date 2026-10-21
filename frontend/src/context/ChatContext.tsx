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
import type { ChatEvent, Conversation, Message, Presence, Reaction, ReplyPreview, User } from '../lib/types'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import { chatReducer, initialChatState, type ChatState, type MessagesState } from './chatReducer'

const PAGE_SIZE = 40

interface ChatContextValue {
  me: User
  state: ChatState
  conversations: Conversation[]
  activeConversation: Conversation | null
  totalUnread: number
  selectConversation: (id: number | null) => void
  loadOlder: (conversationId: number) => Promise<void>
  getMessagesState: (conversationId: number) => MessagesState | undefined
  sendMessage: (conversationId: number, content: string, replyTo: ReplyPreview | null) => Promise<void>
  retryMessage: (message: Message) => void
  discardMessage: (message: Message) => void
  editMessage: (messageId: number, content: string) => Promise<void>
  deleteMessage: (messageId: number) => Promise<void>
  toggleReaction: (message: Message, emoji: string) => Promise<void>
  openDirect: (userId: number) => Promise<void>
  createGroup: (name: string, memberIds: number[]) => Promise<void>
  sendTyping: (conversationId: number, typing: boolean) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

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
  const clientRef = useRef<Client | null>(null)
  const inFlight = useRef(new Set<string>())
  const tempId = useRef(0)

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

  // Initial data.
  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  // Real-time connection (STOMP over WebSocket) with automatic reconnects.
  useEffect(() => {
    if (!token) return
    const myId = me.id

    const handleEvent = (event: ChatEvent) => {
      switch (event.type) {
        case 'MESSAGE_CREATED': {
          const known = Boolean(stateRef.current.conversations[event.conversationId])
          const viewing = stateRef.current.activeId === event.conversationId && document.visibilityState === 'visible'
          dispatch({ type: 'message/received', message: event.payload, myId, viewing })
          if (!known) void loadConversations()
          break
        }
        case 'MESSAGE_UPDATED':
          dispatch({ type: 'message/updated', message: event.payload })
          break
        case 'REACTIONS_UPDATED':
          dispatch({
            type: 'reactions/updated',
            conversationId: event.conversationId,
            messageId: event.payload.messageId,
            reactions: event.payload.reactions,
          })
          break
        case 'CONVERSATION_UPSERTED':
          dispatch({ type: 'conversation/upsert', conversation: event.payload })
          break
        case 'TYPING':
          dispatch({ type: 'typing', payload: event.payload })
          break
        case 'READ':
          dispatch({
            type: 'read',
            conversationId: event.conversationId,
            userId: event.payload.userId,
            lastReadMessageId: event.payload.lastReadMessageId ?? 0,
            myId,
          })
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
      client.subscribe('/topic/presence', (frame) =>
        dispatch({ type: 'presence', presence: JSON.parse(frame.body) as Presence }),
      )
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
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('offline', onOffline)
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
  }, [totalUnread])

  const selectConversation = useCallback(
    (id: number | null) => {
      dispatch({ type: 'active/set', id })
      if (id !== null && !stateRef.current.messages[id]?.loaded) void loadMessages(id, 'replace')
    },
    [loadMessages],
  )

  const loadOlder = useCallback((conversationId: number) => loadMessages(conversationId, 'prepend'), [loadMessages])

  const getMessagesState = useCallback((conversationId: number) => stateRef.current.messages[conversationId], [])

  const deliver = useCallback(
    async (conversationId: number, content: string, replyTo: ReplyPreview | null) => {
      tempId.current -= 1
      const clientId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
      const optimistic: Message = {
        id: tempId.current,
        conversationId,
        sender: { id: me.id, username: me.username, displayName: me.displayName },
        content,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deleted: false,
        replyTo,
        reactions: [],
        clientId,
        pending: true,
      }
      dispatch({ type: 'message/pending', message: optimistic })
      try {
        const saved = await api.send(conversationId, content, replyTo?.id ?? null, clientId)
        dispatch({ type: 'message/received', message: saved, myId: me.id, viewing: true })
      } catch (error) {
        dispatch({ type: 'message/failed', conversationId, clientId })
        notify(errorMessage(error), 'error')
      }
    },
    [me, notify],
  )

  const sendMessage = useCallback(
    (conversationId: number, content: string, replyTo: ReplyPreview | null) => deliver(conversationId, content, replyTo),
    [deliver],
  )

  const discardMessage = useCallback((message: Message) => {
    if (message.clientId) dispatch({ type: 'message/discard', conversationId: message.conversationId, clientId: message.clientId })
  }, [])

  const retryMessage = useCallback(
    (message: Message) => {
      discardMessage(message)
      if (message.content) void deliver(message.conversationId, message.content, message.replyTo)
    },
    [deliver, discardMessage],
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
      const previous = message.reactions
      dispatch({
        type: 'reactions/updated',
        conversationId: message.conversationId,
        messageId: message.id,
        reactions: toggleLocally(previous, emoji, me),
      })
      try {
        const result = await api.react(message.id, emoji)
        dispatch({ type: 'reactions/updated', conversationId: message.conversationId, messageId: message.id, reactions: result.reactions })
      } catch (error) {
        dispatch({ type: 'reactions/updated', conversationId: message.conversationId, messageId: message.id, reactions: previous })
        notify(errorMessage(error), 'error')
      }
    },
    [me, notify],
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

  const activeConversation = activeId ? (state.conversations[activeId] ?? null) : null

  const value = useMemo<ChatContextValue>(
    () => ({
      me,
      state,
      conversations,
      activeConversation,
      totalUnread,
      selectConversation,
      loadOlder,
      getMessagesState,
      sendMessage,
      retryMessage,
      discardMessage,
      editMessage,
      deleteMessage,
      toggleReaction,
      openDirect,
      createGroup,
      sendTyping,
    }),
    [
      me, state, conversations, activeConversation, totalUnread, selectConversation, loadOlder, getMessagesState,
      sendMessage, retryMessage, discardMessage, editMessage, deleteMessage, toggleReaction, openDirect, createGroup,
      sendTyping,
    ],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): ChatContextValue {
  const context = useContext(ChatContext)
  if (!context) throw new Error('useChat must be used inside <ChatProvider>')
  return context
}
