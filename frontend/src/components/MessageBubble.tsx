import { Fragment, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Ban, Check, CheckCheck, Clock, Copy, CircleAlert, Ellipsis, Pencil, Plus, Reply, RotateCw, SmilePlus, Trash2, X } from 'lucide-react'
import { useChat } from '../context/ChatContext'
import { useToast } from '../context/ToastContext'
import { QUICK_REACTIONS } from '../lib/emoji'
import { firstName, formatTime, isJumboEmoji } from '../lib/format'
import type { Message, Reaction } from '../lib/types'
import { Avatar } from './Avatar'
import { EmojiPicker } from './EmojiPicker'
import { Popover } from './Popover'

export type DeliveryStatus = 'pending' | 'failed' | 'sent' | 'seen'

interface MessageBubbleProps {
  message: Message
  mine: boolean
  first: boolean
  last: boolean
  showName: boolean
  showAvatar: boolean
  status: DeliveryStatus | null
  footnote: string | null
  highlighted: boolean
  animate: boolean
  onReply: (message: Message) => void
  onEdit: (message: Message) => void
  onJump: (messageId: number) => void
}

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g

function renderText(text: string): ReactNode[] {
  return text.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
        {part}
      </a>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  )
}

function reactionTitle(reaction: Reaction, meId: number): string {
  const names = reaction.users.map((u) => (u.id === meId ? 'You' : firstName(u.displayName)))
  const list = names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${list} reacted with ${reaction.emoji}`
}

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ')

export function MessageBubble(props: MessageBubbleProps) {
  const { message, mine, first, last, showName, showAvatar, status, footnote, highlighted, animate, onReply, onEdit, onJump } = props
  const { me, toggleReaction, deleteMessage, retryMessage, discardMessage } = useChat()
  const { notify } = useToast()
  const [menu, setMenu] = useState<null | 'react' | 'emoji' | 'more'>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [touchActive, setTouchActive] = useState(false)
  const [hovered, setHovered] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const reactButtonRef = useRef<HTMLButtonElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)

  const interactive = !message.deleted && message.id > 0
  const jumbo = !message.deleted && !message.replyTo && isJumboEmoji(message.content)
  const close = () => {
    setMenu(null)
    setConfirmDelete(false)
  }

  // On touch screens a tap reveals the action bar; tapping elsewhere hides it.
  useEffect(() => {
    if (!touchActive) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) setTouchActive(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [touchActive])

  const onBubbleClick = () => {
    if (interactive && window.matchMedia('(hover: none)').matches) setTouchActive((value) => !value)
  }

  const onBubbleDoubleClick = (event: MouseEvent) => {
    if (!interactive) return
    event.preventDefault()
    window.getSelection()?.removeAllRanges()
    void toggleReaction(message, '❤️')
  }

  const react = (emoji: string) => {
    void toggleReaction(message, emoji)
    close()
    setTouchActive(false)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content ?? '')
      notify('Copied to clipboard', 'success')
    } catch {
      notify("Couldn't copy the message", 'error')
    }
    close()
  }

  return (
    <div
      ref={rowRef}
      id={`msg-${message.conversationId}-${message.id}`}
      onPointerEnter={(event) => event.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={(event) => event.pointerType === 'mouse' && setHovered(false)}
      className={cx(
        'msg-row',
        mine ? 'mine' : 'theirs',
        first && 'first',
        last && 'last',
        animate && 'animate',
        highlighted && 'highlighted',
        (menu !== null || touchActive || hovered) && 'active',
      )}
    >
      {!mine && (
        <div className="msg-avatar">
          {showAvatar && <Avatar name={message.sender.displayName} seed={message.sender.username} size={32} />}
        </div>
      )}

      <div className="msg-stack">
        {showName && <span className="msg-sender">{message.sender.displayName}</span>}

        <div className="msg-line">
          <div
            ref={bubbleRef}
            className={cx('msg-bubble', jumbo && 'jumbo', message.deleted && 'deleted', message.pending && 'pending', message.failed && 'failed')}
            onClick={onBubbleClick}
            onDoubleClick={onBubbleDoubleClick}
          >
            {message.replyTo && (
              <button
                type="button"
                className="reply-quote"
                onClick={(event) => {
                  event.stopPropagation()
                  if (message.replyTo) onJump(message.replyTo.id)
                }}
                title="Jump to message"
              >
                <span className="reply-quote-name">
                  {message.replyTo.sender.id === me.id ? 'You' : message.replyTo.sender.displayName}
                </span>
                <span className="reply-quote-text">
                  {message.replyTo.deleted ? 'Original message was deleted' : message.replyTo.content}
                </span>
              </button>
            )}

            {message.deleted ? (
              <span className="msg-deleted">
                <Ban size={14} /> This message was deleted
              </span>
            ) : (
              <p className="msg-text">{renderText(message.content ?? '')}</p>
            )}

            <span className="msg-meta">
              {message.editedAt && !message.deleted && <span className="msg-edited">edited</span>}
              <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
                {formatTime(message.createdAt)}
              </time>
              {mine && status && (
                <span className={`msg-status ${status}`} aria-label={status}>
                  {status === 'pending' && <Clock size={13} />}
                  {status === 'failed' && <CircleAlert size={13} />}
                  {status === 'sent' && <Check size={14} />}
                  {status === 'seen' && <CheckCheck size={14} />}
                </span>
              )}
            </span>
          </div>

          {interactive && (
            <div className="msg-actions" role="toolbar" aria-label="Message actions">
              <button ref={reactButtonRef} type="button" className="icon-btn tiny" onClick={() => setMenu(menu === 'react' ? null : 'react')} aria-label="Add reaction" title="React">
                <SmilePlus size={16} />
              </button>
              <button type="button" className="icon-btn tiny" onClick={() => { onReply(message); setTouchActive(false) }} aria-label="Reply" title="Reply">
                <Reply size={16} />
              </button>
              <button ref={moreButtonRef} type="button" className="icon-btn tiny" onClick={() => setMenu(menu === 'more' ? null : 'more')} aria-label="More actions" title="More">
                <Ellipsis size={16} />
              </button>
            </div>
          )}
        </div>

        {message.reactions.length > 0 && (
          <div className="reaction-row">
            {message.reactions.map((reaction) => {
              const reacted = reaction.users.some((u) => u.id === me.id)
              return (
                <button
                  key={reaction.emoji}
                  type="button"
                  className={cx('reaction-chip', reacted && 'mine')}
                  onClick={() => void toggleReaction(message, reaction.emoji)}
                  title={reactionTitle(reaction, me.id)}
                  aria-pressed={reacted}
                >
                  <span className="reaction-emoji">{reaction.emoji}</span>
                  <span className="reaction-count">{reaction.count}</span>
                </button>
              )
            })}
          </div>
        )}

        {message.failed && (
          <div className="msg-failed">
            <CircleAlert size={14} /> Not sent
            <button type="button" className="link-btn" onClick={() => retryMessage(message)}>
              <RotateCw size={13} /> Retry
            </button>
            <button type="button" className="link-btn" onClick={() => discardMessage(message)}>
              <X size={13} /> Discard
            </button>
          </div>
        )}

        {footnote && <span className="msg-footnote">{footnote}</span>}
      </div>

      {menu === 'react' && (
        <Popover anchor={reactButtonRef.current} onClose={close} placement="top" align="center" className="reaction-bar">
          {QUICK_REACTIONS.map((emoji) => {
            const reacted = message.reactions.some((r) => r.emoji === emoji && r.users.some((u) => u.id === me.id))
            return (
              <button key={emoji} type="button" className={cx('reaction-option', reacted && 'mine')} onClick={() => react(emoji)} aria-label={`React with ${emoji}`}>
                {emoji}
              </button>
            )
          })}
          <button type="button" className="reaction-option more" onClick={() => setMenu('emoji')} aria-label="More emoji">
            <Plus size={18} />
          </button>
        </Popover>
      )}

      {menu === 'emoji' && (
        <EmojiPicker anchor={bubbleRef.current} onPick={react} onClose={close} placement="top" align={mine ? 'end' : 'start'} />
      )}

      {menu === 'more' && (
        <Popover anchor={moreButtonRef.current} onClose={close} placement="bottom" align={mine ? 'end' : 'start'} className="menu">
          <button type="button" className="menu-item" onClick={() => { onReply(message); close() }}>
            <Reply size={16} /> Reply
          </button>
          <button type="button" className="menu-item" onClick={copy}>
            <Copy size={16} /> Copy text
          </button>
          {mine && (
            <button type="button" className="menu-item" onClick={() => { onEdit(message); close() }}>
              <Pencil size={16} /> Edit
            </button>
          )}
          {mine && (
            <button
              type="button"
              className="menu-item danger"
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true)
                  return
                }
                void deleteMessage(message.id)
                close()
              }}
            >
              <Trash2 size={16} /> {confirmDelete ? 'Tap again to delete' : 'Delete'}
            </button>
          )}
        </Popover>
      )}
    </div>
  )
}
