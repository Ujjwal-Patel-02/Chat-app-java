/** Short vibration for touch feedback (Android; ignored where unsupported). */
export function haptic(pattern: number | number[] = 10) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* ignore */
  }
}

/**
 * Keeps the layout the size of the *visible* viewport on phones, so the composer stays right above the
 * on-screen keyboard (iOS Safari doesn't resize the layout viewport when the keyboard opens).
 */
export function installViewportFix() {
  const viewport = window.visualViewport
  if (!viewport || !window.matchMedia('(pointer: coarse)').matches) return
  const root = document.documentElement
  let frame = 0
  const update = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      if (Math.abs((viewport.scale ?? 1) - 1) > 0.01) return // user is pinch-zooming
      root.style.setProperty('--app-height', `${Math.round(viewport.height)}px`)
      root.style.setProperty('--app-top', `${Math.round(viewport.offsetTop)}px`)
    })
  }
  viewport.addEventListener('resize', update)
  viewport.addEventListener('scroll', update)
  update()
}

export function conversationIdFromPath(path = window.location.pathname): number | null {
  const match = /^\/c\/(\d+)\/?$/.exec(path)
  return match ? Number(match[1]) : null
}
