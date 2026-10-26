import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { UserSummary } from '../lib/types'
import { Avatar } from './Avatar'

export interface Banner {
  id: number
  conversationId: number
  title: string
  body: string
  sender: UserSummary
  group: boolean
}

type Listener = (banner: Banner) => void
const listeners = new Set<Listener>()
let nextId = 1

/** Shows a tappable in-app banner for a message in another conversation. */
export function emitBanner(banner: Omit<Banner, 'id'>) {
  const full = { ...banner, id: nextId++ }
  listeners.forEach((listener) => listener(full))
}

export function InAppNotifications({ onOpen }: { onOpen: (conversationId: number) => void }) {
  const [banners, setBanners] = useState<Banner[]>([])
  const timers = useRef(new Map<number, number>())

  useEffect(() => {
    const listener: Listener = (banner) => {
      setBanners((current) => [...current.filter((b) => b.conversationId !== banner.conversationId), banner].slice(-3))
      const timer = window.setTimeout(() => dismiss(banner.id), 4500)
      timers.current.set(banner.id, timer)
    }
    listeners.add(listener)
    const pending = timers.current
    return () => {
      listeners.delete(listener)
      pending.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const dismiss = (id: number) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setBanners((current) => current.filter((b) => b.id !== id))
  }

  if (banners.length === 0) return null
  return (
    <div className="banner-stack" role="status" aria-live="polite">
      {banners.map((banner) => (
        <div key={banner.id} className="in-app-banner">
          <button
            type="button"
            className="banner-main"
            onClick={() => {
              dismiss(banner.id)
              onOpen(banner.conversationId)
            }}
          >
            <Avatar name={banner.sender.displayName} seed={banner.sender.username} size={38} />
            <span className="banner-text">
              <strong>{banner.title}</strong>
              <span>{banner.body}</span>
            </span>
          </button>
          <button type="button" className="icon-btn ghost small" onClick={() => dismiss(banner.id)} aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
