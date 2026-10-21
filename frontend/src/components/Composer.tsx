import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, Pencil, Reply, SendHorizontal, Smile, X } from 'lucide-react'
import { useChat } from '../context/ChatContext'
import { conversationTitle, firstName } from '../lib/format'
import type { Conversation, Message } from '../lib/types'
import { EmojiPicker } from './EmojiPicker'

interface ComposerProps {
  conversation: Conversation
  replyTo: Message | null
  editing: Message | null
  onCancelReply: () => void
  onCancelEdit: () => void
  onEditLast: () => void
}

const MAX_LENGTH = 4000
const drafts = new Map<number, string>()

export function Composer({ conversation, replyTo, editing, onCancelReply, onCancelEdit, onEditLast }: ComposerProps) {
  const { me, sendMessage, editMessage, sendTyping } = useChat()
  const [text, setText] = useState(() => drafts.get(conversation.id) ?? '')
  const [showEmoji, setShowEmoji] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)
  const typingSentAt = useRef(0)
  const typingTimer = useRef<number | undefined>(undefined)
  const draftBeforeEdit = useRef('')

  // Load the message into the box when editing starts; restore the draft when it ends.
  useEffect(() => {
    if (editing) {
      draftBeforeEdit.current = textareaRef.current?.value ?? ''
      setText(editing.content ?? '')
      requestAnimationFrame(() => {
        const el = textareaRef.current
        el?.focus()
        el?.setSelectionRange(el.value.length, el.value.length)
      })
    } else {
      setText(draftBeforeEdit.current || drafts.get(conversation.id) || '')
      draftBeforeEdit.current = ''
    }
  }, [editing, conversation.id])

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus()
  }, [replyTo])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [conversation.id])

  // Auto-grow up to a limit.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`
  }, [text])

  // Stop the typing indicator when leaving the conversation.
  useEffect(() => {
    const conversationId = conversation.id
    return () => {
      window.clearTimeout(typingTimer.current)
      if (typingSentAt.current) sendTyping(conversationId, false)
    }
  }, [conversation.id, sendTyping])

  const stopTyping = () => {
    window.clearTimeout(typingTimer.current)
    if (typingSentAt.current) {
      typingSentAt.current = 0
      sendTyping(conversation.id, false)
    }
  }

  const onChange = (value: string) => {
    setText(value)
    if (!editing) drafts.set(conversation.id, value)
    if (editing) return
    if (!value.trim()) {
      stopTyping()
      return
    }
    const now = Date.now()
    if (now - typingSentAt.current > 2500) {
      typingSentAt.current = now
      sendTyping(conversation.id, true)
    }
    window.clearTimeout(typingTimer.current)
    typingTimer.current = window.setTimeout(stopTyping, 3500)
  }

  const submit = async () => {
    const content = text.trim()
    if (!content || content.length > MAX_LENGTH) return
    if (editing) {
      const target = editing
      onCancelEdit()
      if (content !== target.content) await editMessage(target.id, content)
      return
    }
    setText('')
    drafts.delete(conversation.id)
    stopTyping()
    const reply = replyTo
      ? { id: replyTo.id, sender: replyTo.sender, content: replyTo.content, deleted: replyTo.deleted }
      : null
    onCancelReply()
    await sendMessage(conversation.id, content, reply)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    } else if (event.key === 'Escape') {
      if (editing) onCancelEdit()
      else if (replyTo) onCancelReply()
    } else if (event.key === 'ArrowUp' && !text && !editing) {
      event.preventDefault()
      onEditLast()
    }
  }

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const next = text.slice(0, start) + emoji + text.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  const title = conversationTitle(conversation, me.id)
  const placeholder = conversation.type === 'GROUP' ? `Message ${title.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '')}` : `Message ${firstName(title)}`
  const tooLong = text.length > MAX_LENGTH

  return (
    <div className="composer-wrap">
      {(replyTo || editing) && (
        <div className={`composer-context${editing ? ' editing' : ''}`}>
          <span className="composer-context-icon">{editing ? <Pencil size={16} /> : <Reply size={16} />}</span>
          <span className="composer-context-body">
            <strong>
              {editing ? 'Editing message' : `Replying to ${replyTo && replyTo.sender.id === me.id ? 'yourself' : replyTo?.sender.displayName}`}
            </strong>
            <span>{editing ? editing.content : replyTo?.content}</span>
          </span>
          <button className="icon-btn ghost small" onClick={editing ? onCancelEdit : onCancelReply} aria-label="Cancel">
            <X size={16} />
          </button>
        </div>
      )}

      <div className={`composer${tooLong ? ' too-long' : ''}`}>
        <button
          ref={emojiButtonRef}
          type="button"
          className={`icon-btn ghost${showEmoji ? ' on' : ''}`}
          onClick={() => setShowEmoji((value) => !value)}
          aria-label="Insert emoji"
          title="Emoji"
        >
          <Smile size={21} />
        </button>
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={stopTyping}
          placeholder={placeholder}
          aria-label="Message"
        />
        {tooLong && <span className="composer-count">{MAX_LENGTH - text.length}</span>}
        <button
          type="button"
          className="send-btn"
          onClick={() => void submit()}
          disabled={!text.trim() || tooLong}
          aria-label={editing ? 'Save edit' : 'Send message'}
          title={editing ? 'Save' : 'Send'}
        >
          {editing ? <Check size={20} /> : <SendHorizontal size={20} />}
        </button>
      </div>

      {showEmoji && (
        <EmojiPicker anchor={emojiButtonRef.current} onPick={insertEmoji} onClose={() => setShowEmoji(false)} placement="top" align="start" />
      )}
    </div>
  )
}
