export interface User {
  id: number
  username: string
  displayName: string
  online: boolean
  lastSeenAt: string | null
  createdAt: string
}

export interface UserSummary {
  id: number
  username: string
  displayName: string
}

export interface ReplyPreview {
  id: number
  sender: UserSummary
  content: string | null
  deleted: boolean
}

export interface Reaction {
  emoji: string
  count: number
  users: UserSummary[]
}

export interface Message {
  id: number
  conversationId: number
  sender: UserSummary
  content: string | null
  createdAt: string
  editedAt: string | null
  deleted: boolean
  replyTo: ReplyPreview | null
  reactions: Reaction[]
  clientId: string | null
  /** Client-only: optimistic message waiting for the server. */
  pending?: boolean
  /** Client-only: the send request failed. */
  failed?: boolean
}

export interface ReadState {
  userId: number
  lastReadMessageId: number | null
}

export type ConversationType = 'DIRECT' | 'GROUP'

export interface Conversation {
  id: number
  type: ConversationType
  name: string | null
  members: User[]
  lastMessage: Message | null
  unreadCount: number
  readStates: ReadState[]
  createdAt: string
  updatedAt: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface Presence {
  userId: number
  online: boolean
  lastSeenAt: string | null
}

export interface TypingPayload {
  conversationId: number
  user: UserSummary
  typing: boolean
}

export interface ReactionsUpdate {
  messageId: number
  reactions: Reaction[]
}

export type ChatEvent =
  | { type: 'MESSAGE_CREATED'; conversationId: number; payload: Message }
  | { type: 'MESSAGE_UPDATED'; conversationId: number; payload: Message }
  | { type: 'REACTIONS_UPDATED'; conversationId: number; payload: ReactionsUpdate }
  | { type: 'CONVERSATION_UPSERTED'; conversationId: number; payload: Conversation }
  | { type: 'TYPING'; conversationId: number; payload: TypingPayload }
  | { type: 'READ'; conversationId: number; payload: ReadState }
