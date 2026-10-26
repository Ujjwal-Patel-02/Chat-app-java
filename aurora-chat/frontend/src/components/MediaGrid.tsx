import { memo, useState } from 'react'
import { Download, ImageOff, Play } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { saveAttachments } from '../lib/download'
import { displaySrc, formatDuration } from '../lib/media'
import type { Attachment } from '../lib/types'
import { useUpload } from '../lib/uploads'

interface MediaGridProps {
  attachments: Attachment[]
  /** Message time, used for download file names. */
  createdAt?: string
  onOpen: (index: number) => void
  /** Time/status overlay for media-only bubbles. */
  overlay?: React.ReactNode
}

/** WhatsApp-style album layout: 1 big, 2 side by side, 3 = 1 + 2, 4+ = 2×2 with "+N". */
export const MediaGrid = memo(function MediaGrid({ attachments, createdAt, onOpen, overlay }: MediaGridProps) {
  const shown = attachments.slice(0, 4)
  const extra = attachments.length - shown.length
  const single = shown.length === 1 ? shown[0] : null
  const ratio = single?.width && single?.height ? Math.min(1.9, Math.max(0.6, single.width / single.height)) : 4 / 3
  return (
    <div className={`media-grid count-${shown.length}`} style={single ? { aspectRatio: String(ratio) } : undefined}>
      {shown.map((attachment, index) => (
        <MediaTile
          key={attachment.id}
          attachment={attachment}
          createdAt={createdAt}
          large={shown.length === 1}
          extra={index === 3 && extra > 0 ? extra : 0}
          onOpen={() => onOpen(index)}
        />
      ))}
      {overlay && <span className="media-overlay-meta">{overlay}</span>}
    </div>
  )
})

function ProgressRing({ value }: { value: number }) {
  const radius = 18
  const circumference = 2 * Math.PI * radius
  return (
    <svg className="progress-ring" viewBox="0 0 44 44" aria-label={`${Math.round(value * 100)}% uploaded`}>
      <circle cx="22" cy="22" r={radius} className="track" />
      <circle cx="22" cy="22" r={radius} className="bar" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.max(0.04, value))} />
    </svg>
  )
}

function MediaTile({ attachment, createdAt, large, extra, onOpen }: { attachment: Attachment; createdAt?: string; large: boolean; extra: number; onOpen: () => void }) {
  const { notify } = useToast()
  const upload = useUpload(attachment.uploadId)
  const [loaded, setLoaded] = useState(false)
  const [broken, setBroken] = useState(false)
  const video = attachment.kind === 'VIDEO'
  const localPreview = video ? upload?.media?.posterUrl : upload?.media?.previewUrl
  const src = localPreview ?? displaySrc(attachment, video || !large ? 'thumb' : 'full')
  const placeholder = upload?.media?.placeholder ?? attachment.placeholder
  const uploading = upload && upload.status !== 'done'

  return (
    <div className="media-cell">
    <button
      type="button"
      className={`media-tile${loaded ? ' loaded' : ''}${video ? ' video' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        if (!uploading) onOpen()
      }}
      aria-label={video ? 'Play video' : 'Open photo'}
      style={placeholder ? { backgroundImage: `url("${placeholder}")` } : undefined}
    >
      {src && !broken && (
        <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onLoad={() => setLoaded(true)} onError={() => setBroken(true)} />
      )}
      {broken && (
        <span className="media-broken">
          <ImageOff size={22} />
          Unavailable
        </span>
      )}
      {video && !uploading && (
        <>
          <span className="play-badge">
            <Play size={large ? 26 : 20} fill="currentColor" />
          </span>
          {attachment.durationMs ? <span className="duration-badge">{formatDuration(attachment.durationMs)}</span> : null}
        </>
      )}
      {uploading && (
        <span className="upload-overlay">
          {upload.status === 'error' ? <span className="upload-error">!</span> : <ProgressRing value={upload.status === 'processing' ? 0.02 : upload.progress} />}
        </span>
      )}
      {extra > 0 && <span className="more-overlay">+{extra}</span>}
    </button>
      {!uploading && !extra && (
        <button
          type="button"
          className="tile-download"
          onClick={(event) => {
            event.stopPropagation()
            saveAttachments([{ attachment, createdAt }]).catch((error: Error) => notify(error.message || 'Download failed', 'error'))
          }}
          aria-label={video ? 'Download video' : 'Download photo'}
          title={video ? 'Download video' : 'Download photo'}
        >
          <Download size={16} />
        </button>
      )}
    </div>
  )
}
