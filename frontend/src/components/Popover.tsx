import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface PopoverProps {
  anchor: HTMLElement | null
  onClose: () => void
  placement?: 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
  className?: string
  children: ReactNode
}

/**
 * Floating panel rendered in a portal with fixed positioning, so it is never clipped by
 * scrolling containers. Flips vertically when there is not enough room.
 */
export function Popover({ anchor, onClose, placement = 'top', align = 'start', className, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const panel = ref.current
    if (!anchor || !panel) return
    const a = anchor.getBoundingClientRect()
    // offsetWidth/Height ignore the scale() entrance animation, unlike getBoundingClientRect().
    const p = { width: panel.offsetWidth, height: panel.offsetHeight }
    const gap = 8
    let top = placement === 'top' ? a.top - p.height - gap : a.bottom + gap
    if (placement === 'top' && top < gap) top = a.bottom + gap
    if (placement === 'bottom' && top + p.height > window.innerHeight - gap) top = Math.max(gap, a.top - p.height - gap)
    let left = align === 'end' ? a.right - p.width : align === 'center' ? a.left + a.width / 2 - p.width / 2 : a.left
    left = Math.min(Math.max(gap, left), window.innerWidth - p.width - gap)
    top = Math.min(Math.max(gap, top), window.innerHeight - p.height - gap)
    setPosition({ top, left })
  }, [anchor, placement, align])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (ref.current?.contains(target) || anchor?.contains(target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [anchor, onClose])

  return createPortal(
    <div
      ref={ref}
      className={`popover${className ? ` ${className}` : ''}`}
      style={position ? { top: position.top, left: position.left } : { top: -9999, left: -9999, visibility: 'hidden' }}
      role="dialog"
    >
      {children}
    </div>,
    document.body,
  )
}
