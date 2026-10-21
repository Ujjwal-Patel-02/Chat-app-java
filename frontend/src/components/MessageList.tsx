import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, LoaderCircle, Sparkles } from 'lucide-react'
import { useChat } from '../context/ChatContext'
import { useToast } from '../context/ToastContext'
import { dayLabel, firstName, isSameDay } from '../lib/format'
import type { Conversation, Message } from '../lib/types'
import { MessageBubble, type DeliveryStatus } from './MessageBubble'

const GROUP_WINDOW_MS = 5 * 60 * 1000
const EMPTY: Message[] = []

const keyOf = (message: Message) => message.clientId ?? String(message.id)

function groupedWith(a: Message | undefined, b: Message | undefined): boolean {
  if (!a || !b) return false
  return (
    a.sender.id === b.sender.id &&
    isSameDay(a.createdAt, b.createdAt) &&
    Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) < GROUP_WINDOW_MS
  )
}

interface MessageListProps {
  conversation: Conversation
  onReply: (message: Message) => void
  onEdit: (message: Message) => void
}

export function MessageList({ conversation, onReply, onEdit }: MessageListProps) {
  const { me, state, loadOlder, getMessagesState } = useChat()
  const { notify } = useToast()
  const messagesState = state.messages[conversation.id]
  const items = messagesState?.items ?? EMPTY
  const loaded = messagesState?.loaded ?? false
  const isGroup = conversation.type === 'GROUP'

  const scrollerRef = useRef<HTMLDivElement>(null)
  const metrics = useRef({ scrollTop: 0, scrollHeight: 0, nearBottom: true })
  const edgeKeys = useRef<{ first: string | null; last: string | null }>({ first: null, last: null })
  const knownKeys = useRef<Set<string> | null>(null)
  const oldestInitialId = useRef(Number.POSITIVE_INFINITY)
  const [newCount, setNewCount] = useState(0)
  const [farFromBottom, setFarFromBottom] = useState(false)
  const [highlighted, setHighlighted] = useState<number | null>(null)

  const typingNames = Object.values(state.typing[conversation.id] ?? {}).map((entry) => firstName(entry.name))
  const typingLabel =
    typingNames.length === 0
      ? null
      : typingNames.length === 1
        ? `${typingNames[0]} is typing`
        : typingNames.length === 2
          ? `${typingNames[0]} and ${typingNames[1]} are typing`
          : 'Several people are typing'

  // Read receipts: how many other members have read up to each of my messages.
  const others = useMemo(() => conversation.members.filter((m) => m.id !== me.id), [conversation.members, me.id])
  const readOf = (userId: number) => conversation.readStates.find((r) => r.userId === userId)?.lastReadMessageId ?? 0
  const lastMineId = [...items].reverse().find((m) => m.sender.id === me.id && m.id > 0 && !m.deleted)?.id

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el || !loaded) return
    const first = items.length ? keyOf(items[0]) : null
    const last = items.length ? keyOf(items[items.length - 1]) : null

    if (knownKeys.current === null) {
      el.scrollTop = el.scrollHeight
      knownKeys.current = new Set(items.map(keyOf))
      oldestInitialId.current = items.find((m) => m.id > 0)?.id ?? Number.POSITIVE_INFINITY
    } else if (first !== edgeKeys.current.first && last === edgeKeys.current.last) {
      // Older messages were prepended: keep what the user was looking at in place.
      el.scrollTop = metrics.current.scrollTop + (el.scrollHeight - metrics.current.scrollHeight)
    } else if (last !== edgeKeys.current.last) {
      const newest = items[items.length - 1]
      if (metrics.current.nearBottom || newest?.sender.id === me.id) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        setNewCount((count) => count + 1)
      }
    } else if (metrics.current.nearBottom) {
      el.scrollTop = el.scrollHeight
    }

    edgeKeys.current = { first, last }
    metrics.current = { ...metrics.current, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight }
  }, [items, loaded, me.id, typingLabel])

  const onScroll = () => {
    const el = scrollerRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distance < 120
    metrics.current = { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, nearBottom }
    if (nearBottom && newCount > 0) setNewCount(0)
    const far = distance > 480
    if (far !== farFromBottom) setFarFromBottom(far)
    if (el.scrollTop < 160 && messagesState?.hasMore && !messagesState.loading) void loadOlder(conversation.id)
  }

  const scrollToBottom = () => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' })
    setNewCount(0)
  }

  const jumpTo = async (messageId: number) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const el = document.getElementById(`msg-${conversation.id}-${messageId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlighted(messageId)
        window.setTimeout(() => setHighlighted((current) => (current === messageId ? null : current)), 1800)
        return
      }
      if (!getMessagesState(conversation.id)?.hasMore) break
      await loadOlder(conversation.id)
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    }
    notify('That message is no longer available.', 'info')
  }

  const statusFor = (message: Message): DeliveryStatus | null => {
    if (message.sender.id !== me.id || message.deleted) return null
    if (message.failed) return 'failed'
    if (message.pending || message.id < 0) return 'pending'
    const seenBy = others.filter((o) => readOf(o.id) >= message.id).length
    return others.length > 0 && seenBy === others.length ? 'seen' : 'sent'
  }

  const footnoteFor = (message: Message): string | null => {
    if (message.id !== lastMineId) return null
    const seenBy = others.filter((o) => readOf(o.id) >= message.id).length
    if (seenBy === 0) return null
    if (!isGroup) return 'Seen'
    return seenBy === others.length ? 'Seen by everyone' : `Seen by ${seenBy}`
  }

  return (
    <div className="message-area">
      <div className="message-scroller" ref={scrollerRef} onScroll={onScroll}>
        {!loaded && (
          <div className="message-skeletons">
            {[60, 38, 72, 45, 55].map((width, i) => (
              <span key={i} className={`skeleton bubble ${i % 2 ? 'right' : ''}`} style={{ width: `${width}%` }} />
            ))}
          </div>
        )}

        {loaded && messagesState?.hasMore && (
          <div className="load-older">
            <button className="btn btn-ghost btn-small" onClick={() => void loadOlder(conversation.id)} disabled={messagesState.loading}>
              {messagesState.loading ? <LoaderCircle size={15} className="spin" /> : null} Load earlier messages
            </button>
          </div>
        )}

        {loaded && items.length === 0 && (
          <div className="conversation-intro">
            <span className="intro-icon">
              <Sparkles size={22} />
            </span>
            <h3>This is the beginning of something great</h3>
            <p>{isGroup ? 'Say hello to the group 👋' : 'Send the first message — they’ll see it instantly.'}</p>
          </div>
        )}

        {items.map((message, index) => {
          const previous = items[index - 1]
          const next = items[index + 1]
          const showDay = !previous || !isSameDay(previous.createdAt, message.createdAt)
          const first = showDay || !groupedWith(previous, message)
          const last = !groupedWith(message, next) || Boolean(next && !isSameDay(message.createdAt, next.createdAt))
          const mine = message.sender.id === me.id
          const key = keyOf(message)
          const animate =
            knownKeys.current !== null &&
            !knownKeys.current.has(key) &&
            (message.id < 0 || message.id > oldestInitialId.current)
          return (
            <Fragment key={key}>
              {showDay && (
                <div className="day-separator">
                  <span>{dayLabel(message.createdAt)}</span>
                </div>
              )}
              <MessageBubble
                message={message}
                mine={mine}
                first={first}
                last={last}
                showName={isGroup && !mine && first}
                showAvatar={!mine && last}
                status={statusFor(message)}
                footnote={footnoteFor(message)}
                highlighted={highlighted === message.id}
                animate={animate}
                onReply={onReply}
                onEdit={onEdit}
                onJump={(id) => void jumpTo(id)}
              />
            </Fragment>
          )
        })}

        {typingLabel && (
          <div className="typing-row" aria-live="polite">
            <div className="typing-bubble">
              <span />
              <span />
              <span />
            </div>
            <span className="typing-label">{typingLabel}…</span>
          </div>
        )}
      </div>

      {newCount > 0 ? (
        <button className="jump-pill" onClick={scrollToBottom}>
          <ArrowDown size={15} /> {newCount} new message{newCount > 1 ? 's' : ''}
        </button>
      ) : (
        farFromBottom && (
          <button className="jump-pill round" onClick={scrollToBottom} aria-label="Scroll to latest">
            <ArrowDown size={17} />
          </button>
        )
      )}
    </div>
  )
}
