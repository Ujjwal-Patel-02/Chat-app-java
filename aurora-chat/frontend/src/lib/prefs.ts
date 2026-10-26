import { useSyncExternalStore } from 'react'

export type PrefKey = 'sound' | 'enterToSend'

const listeners = new Set<() => void>()
const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const DEFAULTS: Record<PrefKey, boolean> = { sound: true, enterToSend: !coarse }

export function getPref(key: PrefKey): boolean {
  try {
    const value = localStorage.getItem(`aurora-pref-${key}`)
    return value === null ? DEFAULTS[key] : value === '1'
  } catch {
    return DEFAULTS[key]
  }
}

export function setPref(key: PrefKey, value: boolean) {
  try {
    localStorage.setItem(`aurora-pref-${key}`, value ? '1' : '0')
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener())
}

export function usePref(key: PrefKey): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => getPref(key),
  )
}
