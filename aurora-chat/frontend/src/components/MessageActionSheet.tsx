import { useEffect, useState } from 'react'
import { Copy, Download, Image as ImageIcon, Pencil, Plus, Reply, Trash2 } from 'lucide-react'
import { useChatActions } from '../context/ChatContext'
import { useToast } from '../context/ToastContext'
import { prefetchAttachment, saveAttachments, saveLabel } from '../lib/download'
import { QUICK_REACTIONS } from '../lib/emoji'
import { describeAttachments, displaySrc } from '../lib/media'
import type { Message } from '../lib/types'
import { BottomSheet } from './BottomSheet'
import { EmojiPicker } from './EmojiPicker'

interface Props {
  message: Message
  onClose: () => void
  onReply: (message: Message) => void
  onEdit: (message: Message) => void
  onOpenMedia: (message: Message, index: number) => void
}

/** Long-press menu on touch screens: quick reactions + message actions. */
export function MessageActionSheet({ message, onClose, onReply, onEdit, onOpenMedia }: Props) {
  const { me, toggleReaction, deleteMessage } = useChatActions()
  const { notify } = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [picker, setPicker] = useState(false)
  const mine = message.sender.id === me.id
  // Fetch the files now, so the share sheet can open instantly when "Save" is tapped.
  useEffect(() => message.attachments.forEach(prefetchAttachment), [message.attachments])
  const preview = message.content || describeAttachments(message.attachments)

  const react = (emoji: string) => {
    void toggleReaction(message, emoji)
    onClose()
  }

  if (picker) return <EmojiPicker anchor={null} onPick={react} onClose={onClose} />

  return (
    <BottomSheet onClose={onClose} className="action-sheet">
      <div className="action-preview">
        {message.attachments[0] && (
          <img src={displaySrc(message.attachments[0], 'thumb')} alt="" className="action-preview-thumb" />
        )}
        <span>
          <strong>{mine ? 'You' : message.sender.displayName}</strong>
          <span>{preview}</span>
        </span>
      </div>
      <div className="sheet-reactions">
        {QUICK_REACTIONS.map((emoji) => {
          const reacted = message.reactions.some((r) => r.emoji === emoji && r.users.some((u) => u.id === me.id))
          return (
            <button key={emoji} type="button" className={`reaction-option${reacted ? ' mine' : ''}`} onClick={() => react(emoji)} aria-label={`React with ${emoji}`}>
              {emoji}
            </button>
          )
        })}
        <button type="button" className="reaction-option more" onClick={() => setPicker(true)} aria-label="More emoji">
          <Plus size={20} />
        </button>
      </div>
      <div className="sheet-actions">
        <button type="button" className="sheet-action" onClick={() => { onReply(message); onClose() }}>
          <Reply size={20} /> Reply
        </button>
        {message.content && (
          <button
            type="button"
            className="sheet-action"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message.content ?? '')
                notify('Copied to clipboard', 'success')
              } catch {
                notify("Couldn't copy the message", 'error')
              }
              onClose()
            }}
          >
            <Copy size={20} /> Copy text
          </button>
        )}
        {message.attachments.length > 0 && (
          <button
            type="button"
            className="sheet-action"
            onClick={async () => {
              const items = message.attachments.map((attachment) => ({ attachment, createdAt: message.createdAt }))
              try {
                const result = await saveAttachments(items, { preferShare: true })
                if (result === 'downloaded') notify(items.length > 1 ? `Saving ${items.length} files to Downloads…` : 'Saved to Downloads', 'success')
              } catch (error) {
                notify(error instanceof Error ? error.message : 'Could not save', 'error')
              }
              onClose()
            }}
          >
            <Download size={20} /> {saveLabel(message.attachments.length, message.attachments.every((a) => a.kind === 'VIDEO') ? 'VIDEO' : 'IMAGE', 'Save')}
          </button>
        )}
        {message.attachments.length > 0 && (
          <button type="button" className="sheet-action" onClick={() => { onOpenMedia(message, 0); onClose() }}>
            <ImageIcon size={20} /> Open {message.attachments.length > 1 ? 'album' : message.attachments[0].kind === 'VIDEO' ? 'video' : 'photo'}
          </button>
        )}
        {mine && (
          <button type="button" className="sheet-action" onClick={() => { onEdit(message); onClose() }}>
            <Pencil size={20} /> {message.attachments.length ? 'Edit caption' : 'Edit'}
          </button>
        )}
        {mine && (
          <button
            type="button"
            className="sheet-action danger"
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true)
                return
              }
              void deleteMessage(message.id)
              onClose()
            }}
          >
            <Trash2 size={20} /> {confirmDelete ? 'Tap again to delete for everyone' : 'Delete'}
          </button>
        )}
      </div>
    </BottomSheet>
  )
}
