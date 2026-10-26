import { useEffect, useState } from 'react'
import { Bell, BellOff, Images, Play, Users } from 'lucide-react'
import { useChat } from '../context/ChatContext'
import { api } from '../lib/api'
import { conversationTitle, lastSeenLabel, leadingEmoji, otherMember } from '../lib/format'
import { displaySrc, formatDuration } from '../lib/media'
import type { Conversation, MediaItem } from '../lib/types'
import { Avatar } from './Avatar'
import { BottomSheet } from './BottomSheet'
import { useMediaViewer } from './MediaViewerContext'

/** Chat details: mute switch, members and every shared photo/video. */
export function ConversationInfo({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const { me, state, setMuted } = useChat()
  const viewer = useMediaViewer()
  const [media, setMedia] = useState<MediaItem[] | null>(null)
  const isGroup = conversation.type === 'GROUP'
  const title = conversationTitle(conversation, me.id)
  const other = isGroup ? undefined : otherMember(conversation, me.id)
  const presenceOf = (id: number, online: boolean, seen: string | null) => state.presence[id] ?? { online, lastSeenAt: seen }

  useEffect(() => {
    let cancelled = false
    api.media(conversation.id).then((items) => !cancelled && setMedia(items)).catch(() => !cancelled && setMedia([]))
    return () => {
      cancelled = true
    }
  }, [conversation.id, conversation.lastMessage?.id])

  const subtitle = isGroup
    ? `${conversation.members.length} members`
    : other
      ? presenceOf(other.id, other.online, other.lastSeenAt).online
        ? 'Online'
        : lastSeenLabel(presenceOf(other.id, other.online, other.lastSeenAt).lastSeenAt)
      : ''

  return (
    <BottomSheet onClose={onClose} tall className="info-sheet">
      <div className="info-hero">
        <Avatar
          name={title}
          seed={isGroup ? `group-${conversation.id}` : (other?.username ?? title)}
          size={84}
          label={isGroup ? leadingEmoji(title) : undefined}
          online={other ? presenceOf(other.id, other.online, other.lastSeenAt).online : false}
        />
        <h3>{isGroup ? title.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '') : title}</h3>
        <span>{other ? `@${other.username} · ${subtitle}` : subtitle}</span>
      </div>

      <div className="settings-group">
        <label className="setting-row">
          <span className="setting-icon">{conversation.muted ? <BellOff size={18} /> : <Bell size={18} />}</span>
          <span className="setting-text">
            <strong>Mute notifications</strong>
            <span>{conversation.muted ? 'You won’t be notified about new messages' : 'Get notified about new messages'}</span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={conversation.muted}
            onChange={(event) => void setMuted(conversation.id, event.target.checked)}
            aria-label="Mute notifications"
          />
        </label>
      </div>

      {isGroup && (
        <div className="settings-group">
          <h4 className="group-label">
            <Users size={15} /> {conversation.members.length} members
          </h4>
          {conversation.members.map((member) => {
            const presence = presenceOf(member.id, member.online, member.lastSeenAt)
            return (
              <div key={member.id} className="member-row">
                <Avatar name={member.displayName} seed={member.username} size={38} online={presence.online} />
                <span>
                  <strong>
                    {member.displayName}
                    {member.id === me.id ? ' (you)' : ''}
                  </strong>
                  <em>{presence.online ? 'Online' : lastSeenLabel(presence.lastSeenAt)}</em>
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div className="settings-group">
        <h4 className="group-label">
          <Images size={15} /> Shared photos & videos{media && media.length > 0 ? ` · ${media.length}` : ''}
        </h4>
        {media === null && <div className="media-gallery loading">{Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton" />)}</div>}
        {media && media.length === 0 && <p className="muted-text">Photos and videos you share will show up here.</p>}
        {media && media.length > 0 && (
          <div className="media-gallery">
            {media.map((item, index) => (
              <button
                key={item.attachment.id}
                type="button"
                className="gallery-tile"
                style={item.attachment.placeholder ? { backgroundImage: `url("${item.attachment.placeholder}")` } : undefined}
                onClick={() =>
                  viewer.open(
                    media.map((m) => ({ attachment: m.attachment, sender: m.sender, createdAt: m.createdAt })),
                    index,
                  )
                }
                aria-label={item.attachment.kind === 'VIDEO' ? 'Play video' : 'Open photo'}
              >
                <img src={displaySrc(item.attachment, 'thumb')} alt="" loading="lazy" />
                {item.attachment.kind === 'VIDEO' && (
                  <span className="gallery-video">
                    <Play size={12} fill="currentColor" /> {formatDuration(item.attachment.durationMs)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
