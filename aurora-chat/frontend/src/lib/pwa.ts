import { useSyncExternalStore } from 'react'
import { syncPush } from './push'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

/** Registers the service worker (offline shell + push) and relays notification clicks to the app. */
export function initPwa() {
  if ('serviceWorker' in navigator) {
    const register = () => navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('Service worker registration failed', error))
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'open-conversation') {
        window.dispatchEvent(new CustomEvent('aurora:open-conversation', { detail: Number(event.data.conversationId) }))
      } else if (event.data?.type === 'push-resync') {
        void syncPush()
      }
    })
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    emit()
  })
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false
  const prompt = deferredPrompt
  deferredPrompt = null
  emit()
  await prompt.prompt()
  return (await prompt.userChoice).outcome === 'accepted'
}

export function useInstallAvailable(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => deferredPrompt !== null,
  )
}

/** Unread count on the home-screen icon (installed PWAs on Android, desktop, iOS 16.4+). */
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  if (count > 0) nav.setAppBadge?.(count).catch(() => {})
  else nav.clearAppBadge?.().catch(() => {})
}
