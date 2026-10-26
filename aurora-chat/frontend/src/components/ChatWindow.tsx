import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { ArrowLeft, BellOff, ImagePlus, Info } from 'lucide-react'
import { useChat } from '../context/ChatContext'
import { conversationTitle, firstName, lastSeenLabel, leadingEmoji, otherMember } from '../lib/format'
import type { Conversation, Message } from '../lib/types'
import { Avatar } from './Avatar'
import { Composer, type ComposerHandle } from './Composer'
import { ConversationInfo } from './ConversationInfo'
import { MessageList } from './MessageList'
import { ThemeToggle } from './ThemeToggle'

export function ChatWindow({ conversation }: { conversation: Conversation }) {
  const { me, state, selectConversation } = useChat()
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editing, setEditing] = useState<Message | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const composerRef = useRef<ComposerHandle>(null)
  const onReply = useCallback((message: Message) => {
    setEditing(null)
    setReplyTo(message)
  }, [])
  const onEdit = useCallback((message: Message) => {
    setReplyTo(null)
    setEditing(message)
  }, [])
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files')
  const [, setClock] = useState(0)

  // Refresh "last seen" labels every minute.
  useEffect(() => {
    const timer = window.setInterval(() => setClock((tick) => tick + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const isGroup = conversation.type === 'GROUP'
  const title = conversationTitle(conversation, me.id)
  const other = isGroup ? undefined : otherMember(conversation, me.id)
  const presenceOf = (userId: number, fallbackOnline: boolean, fallbackSeen: string | null) =>
    state.presence[userId] ?? { online: fallbackOnline, lastSeenAt: fallbackSeen }

  const typingNames = Object.values(state.typing[conversation.id] ?? {}).map((t) => firstName(t.name))
  const onlineCount = conversation.members.filter((m) => m.id !== me.id && presenceOf(m.id, m.online, m.lastSeenAt).online).length

  let subtitle: string
  let subtitleClass = ''
  if (typingNames.length > 0) {
    subtitle = isGroup ? `${typingNames.join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…` : 'typing…'
    subtitleClass = 'typing'
  } else if (isGroup) {
    subtitle = `${conversation.members.length} members${onlineCount > 0 ? ` · ${onlineCount} online` : ''}`
  } else if (other) {
    const presence = presenceOf(other.id, other.online, other.lastSeenAt)
    subtitle = presence.online ? 'Online' : lastSeenLabel(presence.lastSeenAt)
    subtitleClass = presence.online ? 'online' : ''
  } else {
    subtitle = ''
  }

  const items = state.messages[conversation.id]?.items ?? []
  const editLast = () => {
    const lastMine = [...items].reverse().find((m) => m.sender.id === me.id && m.id > 0 && !m.deleted)
    if (lastMine) {
      setReplyTo(null)
      setEditing(lastMine)
    }
  }

  return (
    <section
      className="chat-window"
      onDragEnter={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(event) => hasFiles(event) && event.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        composerRef.current?.addFiles(Array.from(event.dataTransfer.files))
      }}
    >
      {dragging && (
        <div className="drop-overlay">
          <ImagePlus size={34} />
          <strong>Drop photos or videos to share</strong>
        </div>
      )}
      <header className="chat-header">
        <button className="icon-btn ghost back-btn" onClick={() => window.history.length > 1 && window.location.pathname !== '/' ? window.history.back() : selectConversation(null)} aria-label="Back to conversations">
          <ArrowLeft size={20} />
        </button>
        <button type="button" className="chat-header-main" onClick={() => setShowInfo(true)} aria-label="Conversation info">
          <Avatar
            name={title}
            seed={isGroup ? `group-${conversation.id}` : (other?.username ?? title)}
            size={44}
            online={other ? presenceOf(other.id, other.online, other.lastSeenAt).online : false}
            label={isGroup ? leadingEmoji(title) : undefined}
          />
          <span className="chat-header-info">
            <span className="chat-header-title">
              <h2>{isGroup ? title.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '') : title}</h2>
              {conversation.muted && <BellOff size={14} className="muted-icon" aria-label="Muted" />}
            </span>
            <span className={`chat-header-status ${subtitleClass}`}>{subtitle}</span>
          </span>
        </button>
        <div className="chat-header-actions">
          <span className="header-theme">
            <ThemeToggle compact />
          </span>
          <button className={`icon-btn ghost${showInfo ? ' on' : ''}`} onClick={() => setShowInfo(true)} aria-label="Conversation info" title="Info">
            <Info size={20} />
          </button>
        </div>
      </header>

      {showInfo && <ConversationInfo conversation={conversation} onClose={() => setShowInfo(false)} />}

      <MessageList conversation={conversation} onReply={onReply} onEdit={onEdit} />

      <Composer
        ref={composerRef}
        conversation={conversation}
        replyTo={replyTo}
        editing={editing}
        onCancelReply={() => setReplyTo(null)}
        onCancelEdit={() => setEditing(null)}
        onEditLast={editLast}
      />
    </section>
  )
}
