import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Users } from 'lucide-react'
import { useChat } from '../context/ChatContext'
import { conversationTitle, firstName, lastSeenLabel, leadingEmoji, otherMember } from '../lib/format'
import type { Conversation, Message } from '../lib/types'
import { Avatar } from './Avatar'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { Popover } from './Popover'
import { ThemeToggle } from './ThemeToggle'

export function ChatWindow({ conversation }: { conversation: Conversation }) {
  const { me, state, selectConversation } = useChat()
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editing, setEditing] = useState<Message | null>(null)
  const [showMembers, setShowMembers] = useState(false)
  const membersButtonRef = useRef<HTMLButtonElement>(null)
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
    <section className="chat-window">
      <header className="chat-header">
        <button className="icon-btn ghost back-btn" onClick={() => selectConversation(null)} aria-label="Back to conversations">
          <ArrowLeft size={20} />
        </button>
        <Avatar
          name={title}
          seed={isGroup ? `group-${conversation.id}` : (other?.username ?? title)}
          size={44}
          online={other ? presenceOf(other.id, other.online, other.lastSeenAt).online : false}
          label={isGroup ? leadingEmoji(title) : undefined}
        />
        <div className="chat-header-info">
          <h2>{isGroup ? title.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '') : title}</h2>
          <span className={`chat-header-status ${subtitleClass}`}>{subtitle}</span>
        </div>
        <div className="chat-header-actions">
          {isGroup && (
            <button
              ref={membersButtonRef}
              className={`icon-btn ghost${showMembers ? ' on' : ''}`}
              onClick={() => setShowMembers((v) => !v)}
              aria-label="Members"
              title="Members"
            >
              <Users size={19} />
            </button>
          )}
          <span className="header-theme">
            <ThemeToggle compact />
          </span>
        </div>
      </header>

      {showMembers && (
        <Popover anchor={membersButtonRef.current} onClose={() => setShowMembers(false)} placement="bottom" align="end" className="members-panel">
          <h4>{conversation.members.length} members</h4>
          <ul>
            {[...conversation.members]
              .sort((a, b) => Number(presenceOf(b.id, b.online, b.lastSeenAt).online) - Number(presenceOf(a.id, a.online, a.lastSeenAt).online))
              .map((member) => {
                const presence = presenceOf(member.id, member.online, member.lastSeenAt)
                return (
                  <li key={member.id}>
                    <Avatar name={member.displayName} seed={member.username} size={34} online={presence.online} />
                    <span>
                      <strong>
                        {member.displayName}
                        {member.id === me.id ? ' (you)' : ''}
                      </strong>
                      <em>{presence.online ? 'Online' : lastSeenLabel(presence.lastSeenAt)}</em>
                    </span>
                  </li>
                )
              })}
          </ul>
        </Popover>
      )}

      <MessageList
        conversation={conversation}
        onReply={(message) => {
          setEditing(null)
          setReplyTo(message)
        }}
        onEdit={(message) => {
          setReplyTo(null)
          setEditing(message)
        }}
      />

      <Composer
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
