import { api } from './api'

const PREF_KEY = 'aurora-push'

export type PushStatus = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on'

export function isIOS(): boolean {
  return /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function prefOn(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === 'on'
  } catch {
    return false
  }
}

function setPref(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {
    /* ignore */
  }
}

/** True when this device should get notifications from the server (so the page shouldn't show its own). */
export function pushActive(): boolean {
  return pushSupported() && Notification.permission === 'granted' && prefOn()
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted' || !prefOn()) return 'off'
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  return subscription ? 'on' : 'off'
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false
  const left = new Uint8Array(a)
  return left.length === b.length && left.every((value, index) => value === b[index])
}

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration()
  if (!existing) await navigator.serviceWorker.register('/sw.js')
  return navigator.serviceWorker.ready
}

async function subscribeAndRegister(): Promise<void> {
  const config = await api.pushConfig()
  if (!config.enabled || !config.publicKey) throw new Error('Notifications are turned off on the server.')
  const key = base64UrlToBytes(config.publicKey)
  const registration = await readyRegistration()
  let subscription = await registration.pushManager.getSubscription()
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe()
    subscription = null
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  }
  await api.pushSubscribe(subscription.toJSON())
}

/** Asks for permission (must run from a click/tap) and subscribes this device. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser does not support notifications.')
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(permission === 'denied' ? 'Notifications are blocked. Allow them in your browser settings.' : 'Notifications were not allowed.')
  }
  await subscribeAndRegister()
  setPref(true)
}

export async function disablePush(): Promise<void> {
  setPref(false)
  const registration = await navigator.serviceWorker?.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) {
    await api.pushUnsubscribe(subscription.endpoint).catch(() => {})
    await subscription.unsubscribe().catch(() => {})
  }
}

/** Re-registers this device after sign-in (subscriptions can rotate; keys can change). */
export async function syncPush(): Promise<void> {
  if (!pushActive()) return
  await subscribeAndRegister().catch(() => {})
}

/** Detaches this device from the signed-in user (keeps the browser permission). */
export async function detachPush(): Promise<void> {
  if (!pushSupported()) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) await api.pushUnsubscribe(subscription.endpoint).catch(() => {})
}

/** Local notification while the page is open but hidden and push isn't set up on this device. */
export async function showLocalNotification(title: string, options: NotificationOptions & { url?: string }): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const registration = await navigator.serviceWorker?.getRegistration()
  const { url, ...rest } = options
  const notificationOptions = { icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', ...rest, data: { url } }
  if (registration) await registration.showNotification(title, notificationOptions)
  else new Notification(title, notificationOptions)
}
