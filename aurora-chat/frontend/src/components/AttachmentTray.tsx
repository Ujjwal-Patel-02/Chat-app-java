import { RotateCw, Video, X } from 'lucide-react'
import { formatDuration } from '../lib/media'
import { retryUpload, useUpload } from '../lib/uploads'

/** Selected photos/videos above the composer, uploading in the background. */
export function AttachmentTray({ ids, onRemove }: { ids: string[]; onRemove: (id: string) => void }) {
  if (ids.length === 0) return null
  return (
    <div className="attachment-tray" aria-label="Attachments">
      {ids.map((id) => (
        <TrayItem key={id} id={id} onRemove={() => onRemove(id)} />
      ))}
    </div>
  )
}

function TrayItem({ id, onRemove }: { id: string; onRemove: () => void }) {
  const upload = useUpload(id)
  if (!upload) return null
  const media = upload.media
  const preview = upload.kind === 'VIDEO' ? media?.posterUrl : media?.previewUrl
  const progress = upload.status === 'done' ? 1 : upload.status === 'uploading' ? upload.progress : 0
  return (
    <div className={`tray-item status-${upload.status}`} title={upload.error ?? upload.name}>
      {preview ? <img src={preview} alt="" /> : <span className="tray-placeholder" />}
      {upload.kind === 'VIDEO' && (
        <span className="tray-video">
          <Video size={12} /> {formatDuration(media?.durationMs)}
        </span>
      )}
      {upload.status !== 'done' && upload.status !== 'error' && (
        <span className="tray-progress">
          <span style={{ width: `${Math.max(6, progress * 100)}%` }} />
        </span>
      )}
      {upload.status === 'error' && (
        <button type="button" className="tray-retry" onClick={() => void retryUpload(id).catch(() => {})} aria-label="Retry upload">
          <RotateCw size={16} />
        </button>
      )}
      <button type="button" className="tray-remove" onClick={onRemove} aria-label="Remove attachment">
        <X size={13} />
      </button>
    </div>
  )
}
