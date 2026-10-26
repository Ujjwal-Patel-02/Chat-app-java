import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Camera, Check, ImagePlus, Pencil, Reply, SendHorizontal, Smile, X } from 'lucide-react'
import { useChatActions } from '../context/ChatContext'
import { useToast } from '../context/ToastContext'
import { useCoarsePointer } from '../hooks/useMediaQuery'
import { conversationTitle, firstName } from '../lib/format'
import { MAX_ATTACHMENTS, describeAttachments, kindOf } from '../lib/media'
import { usePref } from '../lib/prefs'
import type { Conversation, Message } from '../lib/types'
import { removeUpload, startUpload } from '../lib/uploads'
import { AttachmentTray } from './AttachmentTray'
import { EmojiPicker } from './EmojiPicker'

interface ComposerProps {
  conversation: Conversation
  replyTo: Message | null
  editing: Message | null
  onCancelReply: () => void
  onCancelEdit: () => void
  onEditLast: () => void
}

export interface ComposerHandle {
  addFiles: (files: File[]) => void
}

const MAX_LENGTH = 4000
const drafts = new Map<number, string>()

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { conversation, replyTo, editing, onCancelReply, onCancelEdit, onEditLast },
  ref,
) {
  const { me, sendMessage, editMessage, sendTyping } = useChatActions()
  const { notify } = useToast()
  const coarse = useCoarsePointer()
  const enterToSend = usePref('enterToSend')
  const [text, setText] = useState(() => drafts.get(conversation.id) ?? '')
  const [uploadIds, setUploadIds] = useState<string[]>([])
  const [showEmoji, setShowEmoji] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const typingSentAt = useRef(0)
  const typingTimer = useRef<number | undefined>(undefined)
  const draftBeforeEdit = useRef('')
  const uploadIdsRef = useRef<string[]>([])
  uploadIdsRef.current = uploadIds

  const addFiles = (files: File[]) => {
    if (editing) return
    const media = files.filter((file) => kindOf(file) !== null)
    if (media.length < files.length) notify('Only photos and videos can be shared.', 'info')
    const room = MAX_ATTACHMENTS - uploadIdsRef.current.length
    if (media.length > room) notify(`You can send up to ${MAX_ATTACHMENTS} photos or videos at once.`, 'info')
    const accepted = media.slice(0, Math.max(0, room))
    if (accepted.length) setUploadIds((current) => [...current, ...accepted.map(startUpload)])
  }

  useImperativeHandle(ref, () => ({ addFiles }))

  // Drop unsent uploads when leaving the conversation.
  useEffect(() => () => uploadIdsRef.current.forEach((id) => removeUpload(id)), [])

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
    // On phones, don't pop the keyboard up just because a chat was opened.
    if (!coarse) textareaRef.current?.focus()
  }, [conversation.id, coarse])

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
    if (editing) return
    drafts.set(conversation.id, value)
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
    if (content.length > MAX_LENGTH) return
    if (editing) {
      if (!content && editing.attachments.length === 0) return
      const target = editing
      onCancelEdit()
      if (content !== (target.content ?? '')) await editMessage(target.id, content)
      return
    }
    const ids = uploadIdsRef.current
    if (!content && ids.length === 0) return
    setText('')
    setUploadIds([])
    uploadIdsRef.current = []
    drafts.delete(conversation.id)
    stopTyping()
    const reply = replyTo
      ? {
          id: replyTo.id,
          sender: replyTo.sender,
          content: replyTo.content,
          deleted: replyTo.deleted,
          attachmentKind: replyTo.attachments[0]?.kind ?? null,
          attachmentCount: replyTo.attachments.length,
          thumbnailUrl: replyTo.attachments[0] ? (replyTo.attachments[0].thumbnailUrl ?? (replyTo.attachments[0].kind === 'IMAGE' ? replyTo.attachments[0].url : null)) : null,
        }
      : null
    onCancelReply()
    await sendMessage(conversation.id, content, reply, ids)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && enterToSend) {
      event.preventDefault()
      void submit()
    } else if (event.key === 'Escape') {
      if (editing) onCancelEdit()
      else if (replyTo) onCancelReply()
    } else if (event.key === 'ArrowUp' && !text && !editing && uploadIds.length === 0) {
      event.preventDefault()
      onEditLast()
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files)
    if (files.length) {
      event.preventDefault()
      addFiles(files)
    }
  }

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    onChange(text.slice(0, start) + emoji + text.slice(end))
    requestAnimationFrame(() => {
      if (coarse) return
      el?.focus()
      el?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  const title = conversationTitle(conversation, me.id)
  const placeholder = uploadIds.length
    ? 'Add a caption…'
    : conversation.type === 'GROUP'
      ? `Message ${title.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '')}`
      : `Message ${firstName(title)}`
  const tooLong = text.length > MAX_LENGTH
  const canSend = (text.trim().length > 0 || uploadIds.length > 0 || (editing?.attachments.length ?? 0) > 0) && !tooLong
  const keepFocus = (event: React.PointerEvent) => event.preventDefault() // keeps the phone keyboard open

  return (
    <div className="composer-wrap">
      {(replyTo || editing) && (
        <div className={`composer-context${editing ? ' editing' : ''}`}>
          <span className="composer-context-icon">{editing ? <Pencil size={16} /> : <Reply size={16} />}</span>
          <span className="composer-context-body">
            <strong>{editing ? (editing.attachments.length ? 'Editing caption' : 'Editing message') : `Replying to ${replyTo && replyTo.sender.id === me.id ? 'yourself' : replyTo?.sender.displayName}`}</strong>
            <span>{editing ? editing.content || describeAttachments(editing.attachments) : replyTo?.content || describeAttachments(replyTo?.attachments ?? [])}</span>
          </span>
          <button className="icon-btn ghost small" onClick={editing ? onCancelEdit : onCancelReply} aria-label="Cancel">
            <X size={16} />
          </button>
        </div>
      )}

      <AttachmentTray
        ids={uploadIds}
        onRemove={(id) => {
          removeUpload(id)
          setUploadIds((current) => current.filter((value) => value !== id))
        }}
      />

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
        {!editing && (
          <button type="button" className="icon-btn ghost" onClick={() => fileInputRef.current?.click()} aria-label="Attach photos or videos" title="Photos & videos">
            <ImagePlus size={21} />
          </button>
        )}
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={stopTyping}
          placeholder={placeholder}
          aria-label="Message"
          enterKeyHint={enterToSend ? 'send' : 'enter'}
        />
        {tooLong && <span className="composer-count">{MAX_LENGTH - text.length}</span>}
        {coarse && !editing && !text.trim() && uploadIds.length === 0 ? (
          <button type="button" className="icon-btn ghost camera-btn" onClick={() => cameraInputRef.current?.click()} aria-label="Take a photo">
            <Camera size={21} />
          </button>
        ) : (
          <button
            type="button"
            className="send-btn"
            onPointerDown={keepFocus}
            onClick={() => void submit()}
            disabled={!canSend}
            aria-label={editing ? 'Save edit' : 'Send message'}
            title={editing ? 'Save' : 'Send'}
          >
            {editing ? <Check size={20} /> : <SendHorizontal size={20} />}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
      </div>

      {showEmoji && <EmojiPicker anchor={emojiButtonRef.current} onPick={insertEmoji} onClose={() => setShowEmoji(false)} placement="top" align="start" />}
    </div>
  )
})
