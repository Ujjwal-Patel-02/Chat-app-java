import { Fragment, memo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Ban, Check, CheckCheck, CircleAlert, Clock, Copy, Download, Ellipsis, Image as ImageIcon, Pencil, Plus, Reply, RotateCw, SmilePlus, Trash2, Video, X } from 'lucide-react'
import { useChatActions } from '../context/ChatContext'
import { useToast } from '../context/ToastContext'
import { haptic } from '../lib/device'
import { saveAttachments, saveLabel } from '../lib/download'
import { QUICK_REACTIONS } from '../lib/emoji'
import { firstName, formatTime, isJumboEmoji } from '../lib/format'
import { mediaUrl } from '../lib/media'
import type { Message, Reaction } from '../lib/types'
import { Avatar } from './Avatar'
import { EmojiPicker } from './EmojiPicker'
import { MediaGrid } from './MediaGrid'
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
  onOpenMedia: (message: Message, index: number) => void
  onOpenActions: (message: Message) => void
}

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g
const LONG_PRESS_MS = 420
const SWIPE_REPLY_PX = 64

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

export function reactionTitle(reaction: Reaction, meId: number): string {
  const names = reaction.users.map((u) => (u.id === meId ? 'You' : firstName(u.displayName)))
  const list = names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${list} reacted with ${reaction.emoji}`
}

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ')

function StatusIcon({ status }: { status: DeliveryStatus }) {
  return (
    <span className={`msg-status ${status}`} aria-label={status}>
      {status === 'pending' && <Clock size={13} />}
      {status === 'failed' && <CircleAlert size={13} />}
      {status === 'sent' && <Check size={14} />}
      {status === 'seen' && <CheckCheck size={14} />}
    </span>
  )
}

/** One chat message. Memoized: only re-renders when its own props change. */
export const MessageBubble = memo(function MessageBubble(props: MessageBubbleProps) {
  const { message, mine, first, last, showName, showAvatar, status, footnote, highlighted, animate } = props
  const { onReply, onEdit, onJump, onOpenMedia, onOpenActions } = props
  const { me, toggleReaction, deleteMessage, retryMessage, discardMessage } = useChatActions()
  const { notify } = useToast()
  const [menu, setMenu] = useState<null | 'react' | 'emoji' | 'more'>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const lineRef = useRef<HTMLDivElement>(null)
  const replyHintRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const reactButtonRef = useRef<HTMLButtonElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const touch = useRef<{ x: number; y: number; timer: number; swiping: boolean; cancelled: boolean; dx: number } | null>(null)
  const lastTap = useRef(0)
  const longPressed = useRef(false)

  const interactive = !message.deleted && message.id > 0
  const hasMedia = !message.deleted && message.attachments.length > 0
  const caption = message.deleted ? null : message.content
  const mediaOnly = hasMedia && !caption && !message.replyTo
  const jumbo = !message.deleted && !hasMedia && !message.replyTo && isJumboEmoji(message.content)
  const close = () => {
    setMenu(null)
    setConfirmDelete(false)
  }

  // ---- Touch gestures: long-press → action sheet, swipe right → reply, double-tap → ❤️ ----
  const resetSwipe = () => {
    if (lineRef.current) {
      lineRef.current.style.transition = ''
      lineRef.current.style.transform = ''
    }
    if (replyHintRef.current) replyHintRef.current.style.opacity = '0'
  }

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.pointerType !== 'touch' || !interactive) return
    const timer = window.setTimeout(() => {
      if (!touch.current || touch.current.swiping) return
      touch.current.cancelled = true
      longPressed.current = true
      haptic(12)
      onOpenActions(message)
    }, LONG_PRESS_MS)
    touch.current = { x: event.clientX, y: event.clientY, timer, swiping: false, cancelled: false, dx: 0 }
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const t = touch.current
    if (!t || t.cancelled) return
    const dx = event.clientX - t.x
    const dy = event.clientY - t.y
    if (!t.swiping) {
      if (Math.abs(dy) > 10) {
        window.clearTimeout(t.timer)
        touch.current = null // vertical scroll
        return
      }
      if (dx > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        t.swiping = true
        window.clearTimeout(t.timer)
      } else {
        return
      }
    }
    const shift = Math.max(0, Math.min(90, dx * 0.6))
    if (t.dx < SWIPE_REPLY_PX * 0.6 && shift >= SWIPE_REPLY_PX * 0.6) haptic(8)
    t.dx = shift
    if (lineRef.current) {
      lineRef.current.style.transition = 'none'
      lineRef.current.style.transform = `translateX(${shift}px)`
    }
    if (replyHintRef.current) replyHintRef.current.style.opacity = String(Math.min(1, shift / (SWIPE_REPLY_PX * 0.6)))
  }

  const onPointerUp = (event: ReactPointerEvent) => {
    const t = touch.current
    touch.current = null
    if (!t) return
    window.clearTimeout(t.timer)
    if (t.swiping) {
      if (t.dx >= SWIPE_REPLY_PX * 0.6) onReply(message)
      resetSwipe()
      return
    }
    if (t.cancelled || event.type === 'pointercancel') return
    const now = Date.now()
    if (now - lastTap.current < 300) {
      lastTap.current = 0
      haptic(10)
      void toggleReaction(message, '❤️')
    } else {
      lastTap.current = now
    }
  }

  const onDoubleClick = (event: MouseEvent) => {
    if (!interactive || (event.nativeEvent as PointerEvent).pointerType === 'touch') return
    event.preventDefault()
    window.getSelection()?.removeAllRanges()
    void toggleReaction(message, '❤️')
  }

  const react = (emoji: string) => {
    void toggleReaction(message, emoji)
    close()
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

  const meta = (
    <>
      {message.editedAt && !message.deleted && <span className="msg-edited">edited</span>}
      <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
        {formatTime(message.createdAt)}
      </time>
      {mine && status && <StatusIcon status={status} />}
    </>
  )

  const reply = message.replyTo
  return (
    <div
      id={`msg-${message.conversationId}-${message.id}`}
      className={cx('msg-row', mine ? 'mine' : 'theirs', first && 'first', last && 'last', animate && 'animate', highlighted && 'highlighted', menu !== null && 'active')}
    >
      {!mine && <div className="msg-avatar">{showAvatar && <Avatar name={message.sender.displayName} seed={message.sender.username} size={32} />}</div>}

      <div className="msg-stack">
        {showName && <span className="msg-sender">{message.sender.displayName}</span>}

        <div className="msg-line" ref={lineRef}>
          <span className="swipe-reply-hint" ref={replyHintRef} aria-hidden="true">
            <Reply size={18} />
          </span>
          <div
            ref={bubbleRef}
            className={cx('msg-bubble', jumbo && 'jumbo', message.deleted && 'deleted', message.pending && 'pending', message.failed && 'failed', hasMedia && 'has-media', mediaOnly && 'media-only')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onTouchEnd={(event) => {
              // Swallow the "ghost" click that follows a long-press, so it can't hit the sheet's backdrop.
              if (longPressed.current) {
                longPressed.current = false
                event.preventDefault()
              }
            }}
            onDoubleClick={onDoubleClick}
            onContextMenu={(event) => {
              if (interactive && window.matchMedia('(pointer: coarse)').matches) event.preventDefault()
            }}
          >
            {reply && (
              <button
                type="button"
                className="reply-quote"
                onClick={(event) => {
                  event.stopPropagation()
                  onJump(reply.id)
                }}
                title="Jump to message"
              >
                <span className="reply-quote-body">
                  <span className="reply-quote-name">{reply.sender.id === me.id ? 'You' : reply.sender.displayName}</span>
                  <span className="reply-quote-text">
                    {reply.deleted ? (
                      'Original message was deleted'
                    ) : reply.content ? (
                      reply.content
                    ) : reply.attachmentKind ? (
                      <span className="quote-media-label">
                        {reply.attachmentKind === 'VIDEO' ? <Video size={13} /> : <ImageIcon size={13} />}
                        {reply.attachmentKind === 'VIDEO' ? 'Video' : (reply.attachmentCount ?? 1) > 1 ? `${reply.attachmentCount} photos` : 'Photo'}
                      </span>
                    ) : null}
                  </span>
                </span>
                {reply.thumbnailUrl && !reply.deleted && <img className="reply-quote-thumb" src={mediaUrl(reply.thumbnailUrl)} alt="" loading="lazy" />}
              </button>
            )}

            {hasMedia && (
              <MediaGrid attachments={message.attachments} createdAt={message.createdAt} onOpen={(index) => onOpenMedia(message, index)} overlay={mediaOnly ? meta : undefined} />
            )}

            {message.deleted ? (
              <span className="msg-deleted">
                <Ban size={14} /> This message was deleted
              </span>
            ) : caption ? (
              <p className="msg-text">{renderText(caption)}</p>
            ) : null}

            {!mediaOnly && <span className="msg-meta">{meta}</span>}
          </div>

          {interactive && (
            <div className="msg-actions" role="toolbar" aria-label="Message actions">
              <button ref={reactButtonRef} type="button" className="icon-btn tiny" onClick={() => setMenu(menu === 'react' ? null : 'react')} aria-label="Add reaction" title="React">
                <SmilePlus size={16} />
              </button>
              <button type="button" className="icon-btn tiny" onClick={() => onReply(message)} aria-label="Reply" title="Reply">
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

      {menu === 'emoji' && <EmojiPicker anchor={bubbleRef.current} onPick={react} onClose={close} placement="top" align={mine ? 'end' : 'start'} />}

      {menu === 'more' && (
        <Popover anchor={moreButtonRef.current} onClose={close} placement="bottom" align={mine ? 'end' : 'start'} className="menu">
          <button type="button" className="menu-item" onClick={() => { onReply(message); close() }}>
            <Reply size={16} /> Reply
          </button>
          {message.content && (
            <button type="button" className="menu-item" onClick={copy}>
              <Copy size={16} /> Copy text
            </button>
          )}
          {hasMedia && (
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                close()
                const items = message.attachments.map((attachment) => ({ attachment, createdAt: message.createdAt }))
                saveAttachments(items)
                  .then(() => items.length > 1 && notify(`Downloading ${items.length} files…`, 'info'))
                  .catch((error: Error) => notify(error.message || 'Download failed', 'error'))
              }}
            >
              <Download size={16} /> {saveLabel(message.attachments.length, message.attachments.every((a) => a.kind === 'VIDEO') ? 'VIDEO' : 'IMAGE', 'Download')}
            </button>
          )}
          {mine && (
            <button type="button" className="menu-item" onClick={() => { onEdit(message); close() }}>
              <Pencil size={16} /> {hasMedia ? 'Edit caption' : 'Edit'}
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
              <Trash2 size={16} /> {confirmDelete ? 'Click again to delete' : 'Delete'}
            </button>
          )}
        </Popover>
      )}
    </div>
  )
})
