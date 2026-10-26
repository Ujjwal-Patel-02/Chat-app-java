import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', listener)
      return () => media.removeEventListener('change', listener)
    },
    () => window.matchMedia(query).matches,
  )
}

/** Phone-sized layout (one pane at a time, bottom sheets). */
export const useIsMobile = () => useMediaQuery('(max-width: 860px)')

/** Touch screen: long-press menus, swipe gestures. */
export const useCoarsePointer = () => useMediaQuery('(pointer: coarse)')
