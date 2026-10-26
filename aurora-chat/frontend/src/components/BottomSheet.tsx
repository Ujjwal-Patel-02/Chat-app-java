import { useCallback, useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'

interface BottomSheetProps {
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  className?: string
  /** Full-height sheet (e.g. conversation info on phones). */
  tall?: boolean
}

/** Mobile-style sheet: slides up, closes on backdrop tap, Escape, or dragging the handle down. */
export function BottomSheet({ onClose, title, children, className, tall }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; dy: number; startedAt: number } | null>(null)
  const [closing, setClosing] = useState(false)
  const openedAt = useRef(Date.now())

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, 180)
  }, [closing, onClose])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const onPointerDown = (event: ReactPointerEvent) => {
    drag.current = { startY: event.clientY, dy: 0, startedAt: Date.now() }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag.current || !sheetRef.current) return
    drag.current.dy = Math.max(0, event.clientY - drag.current.startY)
    sheetRef.current.style.transition = 'none'
    sheetRef.current.style.transform = `translateY(${drag.current.dy}px)`
  }
  const onPointerUp = () => {
    const state = drag.current
    drag.current = null
    const sheet = sheetRef.current
    if (!state || !sheet) return
    sheet.style.transition = ''
    const velocity = state.dy / Math.max(1, Date.now() - state.startedAt)
    if (state.dy > 110 || velocity > 0.6) close()
    else sheet.style.transform = ''
  }

  return createPortal(
    <div className={`sheet-root${closing ? ' closing' : ''}`}>
      <div className="sheet-backdrop" onClick={() => Date.now() - openedAt.current > 400 && close()} />
      <div ref={sheetRef} className={`sheet${tall ? ' tall' : ''}${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true">
        <div className="sheet-grabber" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <span className="sheet-handle" />
          {title && <div className="sheet-title">{title}</div>}
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
