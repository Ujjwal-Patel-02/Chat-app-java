import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, Share2, X } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { formatTime } from '../lib/format'
import { canShareFiles, prefetchAttachment, saveAttachments } from '../lib/download'
import { displaySrc } from '../lib/media'
import type { ViewerItem } from './MediaViewerContext'

interface Props {
  items: ViewerItem[]
  startIndex: number
  onClose: () => void
}

interface Gesture {
  pointers: Map<number, { x: number; y: number }>
  startX: number
  startY: number
  startedAt: number
  axis: 'x' | 'y' | 'pan' | 'pinch' | null
  dx: number
  dy: number
  startScale: number
  startDistance: number
  startPan: { x: number; y: number }
}

const MAX_SCALE = 4

/**
 * Full-screen photo/video viewer: swipe left/right between items, swipe down to close,
 * pinch or double-tap to zoom, drag to pan, arrow keys + Escape on desktop.
 */
export default function MediaViewer({ items, startIndex, onClose }: Props) {
  const { notify } = useToast()
  const [index, setIndex] = useState(startIndex)
  const [chrome, setChrome] = useState(true)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const stageRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null)
  const tapTimer = useRef<number | undefined>(undefined)
  const item = items[index]

  const resetZoom = useCallback(() => {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= items.length) return
      setIndex(next)
      resetZoom()
    },
    [items.length, resetZoom],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowLeft') go(index - 1)
      else if (event.key === 'ArrowRight') go(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, index, onClose])

  // Pause videos that slide out of view.
  useEffect(() => {
    trackRef.current?.querySelectorAll('video').forEach((video, i) => {
      if (Number(video.dataset.index) !== index && !video.paused) video.pause()
      void i
    })
  }, [index])

  const setTrack = (dx: number, animate: boolean) => {
    const track = trackRef.current
    if (!track) return
    track.style.transition = animate ? '' : 'none'
    track.style.transform = `translate3d(calc(${-index * 100}% + ${dx}px), 0, 0)`
  }

  const setDismiss = (dy: number, animate: boolean) => {
    const slide = trackRef.current?.children[index] as HTMLElement | undefined
    if (slide) {
      slide.style.transition = animate ? '' : 'none'
      slide.style.transform = dy ? `translate3d(0, ${dy}px, 0) scale(${1 - Math.min(dy, 400) / 1600})` : ''
    }
    if (backdropRef.current) {
      backdropRef.current.style.transition = animate ? '' : 'none'
      backdropRef.current.style.opacity = String(1 - Math.min(Math.abs(dy), 400) / 500)
    }
  }

  const zoomAt = (clientX: number, clientY: number) => {
    if (item.attachment.kind !== 'IMAGE') return
    if (scale > 1) {
      resetZoom()
      return
    }
    const rect = stageRef.current!.getBoundingClientRect()
    const next = 2.5
    const ox = clientX - rect.left - rect.width / 2
    const oy = clientY - rect.top - rect.height / 2
    setScale(next)
    setPan({ x: -ox * (next - 1), y: -oy * (next - 1) })
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('video, button')) return
    const g = gesture.current ?? {
      pointers: new Map(),
      startX: event.clientX,
      startY: event.clientY,
      startedAt: Date.now(),
      axis: null,
      dx: 0,
      dy: 0,
      startScale: scale,
      startDistance: 0,
      startPan: pan,
    }
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (g.pointers.size === 2 && item.attachment.kind === 'IMAGE') {
      const [a, b] = [...g.pointers.values()]
      g.axis = 'pinch'
      g.startDistance = Math.hypot(a.x - b.x, a.y - b.y)
      g.startScale = scale
      g.startPan = pan
    }
    gesture.current = g
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || !g.pointers.has(event.pointerId)) return
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (g.axis === 'pinch') {
      const [a, b] = [...g.pointers.values()]
      if (!a || !b) return
      const ratio = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, g.startDistance)
      setScale(Math.min(MAX_SCALE, Math.max(1, g.startScale * ratio)))
      return
    }
    const dx = event.clientX - g.startX
    const dy = event.clientY - g.startY
    if (!g.axis) {
      if (Math.hypot(dx, dy) < 8) return
      g.axis = scale > 1 ? 'pan' : Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    g.dx = dx
    g.dy = dy
    if (g.axis === 'pan') setPan({ x: g.startPan.x + dx, y: g.startPan.y + dy })
    else if (g.axis === 'x') {
      const atEdge = (index === 0 && dx > 0) || (index === items.length - 1 && dx < 0)
      setTrack(atEdge ? dx / 3 : dx, false)
    } else if (g.axis === 'y') setDismiss(Math.max(-120, dy), false)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g) return
    g.pointers.delete(event.pointerId)
    if (g.pointers.size > 0) return
    gesture.current = null
    const elapsed = Math.max(1, Date.now() - g.startedAt)
    if (g.axis === 'pinch') {
      if (scale <= 1.02) resetZoom()
      return
    }
    if (g.axis === 'x') {
      const fast = Math.abs(g.dx) / elapsed > 0.5
      if ((g.dx < -60 || (fast && g.dx < -20)) && index < items.length - 1) go(index + 1)
      else if ((g.dx > 60 || (fast && g.dx > 20)) && index > 0) go(index - 1)
      setTrack(0, true)
      return
    }
    if (g.axis === 'y') {
      if (Math.abs(g.dy) > 120 || Math.abs(g.dy) / elapsed > 0.7) onClose()
      else setDismiss(0, true)
      return
    }
    if (g.axis === null) {
      // A tap: double-tap zooms, single tap toggles the toolbars.
      const now = Date.now()
      const previous = lastTap.current
      if (previous && now - previous.time < 300 && Math.hypot(previous.x - event.clientX, previous.y - event.clientY) < 30) {
        window.clearTimeout(tapTimer.current)
        lastTap.current = null
        zoomAt(event.clientX, event.clientY)
      } else {
        lastTap.current = { time: now, x: event.clientX, y: event.clientY }
        tapTimer.current = window.setTimeout(() => setChrome((value) => !value), 300)
      }
    }
  }

  useEffect(() => {
    prefetchAttachment(item.attachment)
  }, [item.attachment])

  const download = async () => {
    try {
      await saveAttachments([{ attachment: item.attachment, createdAt: item.createdAt }])
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Download failed', 'error')
    }
  }

  const share = async () => {
    try {
      const result = await saveAttachments([{ attachment: item.attachment, createdAt: item.createdAt }], { preferShare: true })
      if (result === 'downloaded') notify('Saved to Downloads', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : "Couldn't share this file", 'error')
    }
  }

  const canShare = canShareFiles()

  return createPortal(
    <div className={`viewer${chrome ? '' : ' hide-chrome'}`} role="dialog" aria-modal="true" aria-label="Media viewer">
      <div ref={backdropRef} className="viewer-backdrop" />
      <header className="viewer-top">
        <button type="button" className="viewer-btn" onClick={onClose} aria-label="Close viewer">
          <X size={22} />
        </button>
        <div className="viewer-meta">
          {item.sender && <strong>{item.sender.displayName}</strong>}
          <span>
            {item.createdAt ? formatTime(item.createdAt) : ''}
            {items.length > 1 ? ` · ${index + 1} of ${items.length}` : ''}
          </span>
        </div>
        {canShare && (
          <button type="button" className="viewer-btn" onClick={share} aria-label="Share or save to Photos" title="Share or save to Photos">
            <Share2 size={20} />
          </button>
        )}
        <button type="button" className="viewer-btn" onClick={download} aria-label="Download" title="Download">
          <Download size={20} />
        </button>
      </header>

      <div
        ref={stageRef}
        className="viewer-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(event) => (event.nativeEvent as PointerEvent).pointerType !== 'touch' && zoomAt(event.clientX, event.clientY)}
      >
        <div ref={trackRef} className="viewer-track" style={{ transform: `translate3d(${-index * 100}%, 0, 0)` }}>
          {items.map((entry, i) => {
            const near = Math.abs(i - index) <= 1
            const attachment = entry.attachment
            return (
              <div className="viewer-slide" key={`${attachment.id}-${i}`}>
                {near && attachment.kind === 'IMAGE' && (
                  <img
                    src={displaySrc(attachment, 'full')}
                    alt={entry.caption ?? 'Photo'}
                    draggable={false}
                    style={i === index ? { transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})` } : undefined}
                    className={i === index && scale > 1 ? 'zoomed' : ''}
                  />
                )}
                {near && attachment.kind === 'VIDEO' && (
                  <video
                    data-index={i}
                    src={displaySrc(attachment, 'full')}
                    poster={displaySrc(attachment, 'thumb')}
                    controls
                    playsInline
                    autoPlay={i === index}
                    preload="metadata"
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {index > 0 && (
        <button type="button" className="viewer-nav prev" onClick={() => go(index - 1)} aria-label="Previous">
          <ChevronLeft size={26} />
        </button>
      )}
      {index < items.length - 1 && (
        <button type="button" className="viewer-nav next" onClick={() => go(index + 1)} aria-label="Next">
          <ChevronRight size={26} />
        </button>
      )}
      {item.caption && <div className="viewer-caption">{item.caption}</div>}
    </div>,
    document.body,
  )
}
