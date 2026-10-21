import { useMemo, useState } from 'react'
import { LogOut, MessageSquarePlus, Search, WifiOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { conversationTitle, firstName, formatListTime, leadingEmoji, otherMember } from '../lib/format'
import type { Conversation } from '../lib/types'
import { Avatar } from './Avatar'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'

export function Sidebar({ onNewChat }: { onNewChat: () => void }) {
  const { logout } = useAuth()
  const { me, state, conversations, selectConversation } = useChat()
  const [filter, setFilter] = useState('')

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => {
      const title = conversationTitle(c, me.id).toLowerCase()
      return title.includes(q) || c.members.some((m) => m.username.includes(q) || m.displayName.toLowerCase().includes(q))
    })
  }, [conversations, filter, me.id])

  return (
    <aside className="sidebar glass">
      <header className="sidebar-header">
        <Logo />
        <div className="sidebar-actions">
          <ThemeToggle />
          <button className="icon-btn accent" onClick={onNewChat} aria-label="New conversation" title="New conversation">
            <MessageSquarePlus size={19} />
          </button>
        </div>
      </header>

      <div className="search-box">
        <Search size={16} />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" />
      </div>

      {state.connection !== 'online' && (
        <div className={`connection-pill ${state.connection}`}>
          {state.connection === 'offline' ? <WifiOff size={14} /> : <span className="pulse-dot" />}
          {state.connection === 'offline' ? 'You are offline' : 'Connecting…'}
        </div>
      )}

      <div className="conversation-list" role="list">
        {!state.conversationsLoaded &&
          Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="conversation-skeleton">
              <span className="skeleton circle" />
              <span className="skeleton-lines">
                <span className="skeleton line" />
                <span className="skeleton line short" />
              </span>
            </div>
          ))}

        {state.conversationsLoaded && conversations.length === 0 && (
          <div className="list-empty">
            <p>No conversations yet.</p>
            <button className="btn btn-primary btn-small" onClick={onNewChat}>
              Start chatting
            </button>
          </div>
        )}

        {state.conversationsLoaded && conversations.length > 0 && visible.length === 0 && (
          <div className="list-empty">
            <p>No matches for “{filter}”.</p>
          </div>
        )}

        {visible.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            conversation={conversation}
            active={state.activeId === conversation.id}
            onSelect={() => selectConversation(conversation.id)}
          />
        ))}
      </div>

      <footer className="sidebar-footer">
        <Avatar name={me.displayName} seed={me.username} size={40} online={state.connection === 'online'} />
        <div className="me-info">
          <strong>{me.displayName}</strong>
          <span>@{me.username}</span>
        </div>
        <button className="icon-btn ghost" onClick={logout} aria-label="Sign out" title="Sign out">
          <LogOut size={18} />
        </button>
      </footer>
    </aside>
  )
}

function ConversationItem({ conversation, active, onSelect }: { conversation: Conversation; active: boolean; onSelect: () => void }) {
  const { me, state } = useChat()
  const title = conversationTitle(conversation, me.id)
  const isGroup = conversation.type === 'GROUP'
  const other = isGroup ? undefined : otherMember(conversation, me.id)
  const online = other ? (state.presence[other.id]?.online ?? other.online) : false

  const typingNames = Object.values(state.typing[conversation.id] ?? {}).map((t) => firstName(t.name))
  const last = conversation.lastMessage
  let preview: string
  if (typingNames.length > 0) {
    preview = isGroup ? `${typingNames.join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…` : 'typing…'
  } else if (!last) {
    preview = isGroup ? `${conversation.members.length} members · say hi 👋` : 'Say hi 👋'
  } else {
    const who = last.sender.id === me.id ? 'You: ' : isGroup ? `${firstName(last.sender.displayName)}: ` : ''
    preview = who + (last.deleted ? 'Message deleted' : (last.content ?? ''))
  }

  return (
    <button role="listitem" className={`conversation-item${active ? ' active' : ''}${conversation.unreadCount > 0 ? ' unread' : ''}`} onClick={onSelect}>
      <Avatar
        name={title}
        seed={isGroup ? `group-${conversation.id}` : (other?.username ?? title)}
        size={48}
        online={online}
        label={isGroup ? leadingEmoji(title) : undefined}
      />
      <span className="conversation-body">
        <span className="conversation-top">
          <span className="conversation-title">{isGroup ? title.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '') : title}</span>
          {last && <time className="conversation-time">{formatListTime(last.createdAt)}</time>}
        </span>
        <span className="conversation-bottom">
          <span className={`conversation-preview${typingNames.length > 0 ? ' typing' : ''}`}>{preview}</span>
          {conversation.unreadCount > 0 && <span className="unread-badge">{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>}
        </span>
      </span>
    </button>
  )
}
