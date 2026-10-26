import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

export type Theme = 'light' | 'dark'

export type ThemePreference = Theme | 'system'

interface ThemeContextValue {
  theme: Theme
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
  /** Toggles the theme; with an origin point the new theme is revealed in an expanding circle. */
  toggleTheme: (origin?: { x: number; y: number }) => void
}

const STORAGE_KEY = 'aurora-theme'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#07060f' : '#f4f2ff')
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void> }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  )
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved === 'light' || saved === 'dark' ? saved : 'system'
    } catch {
      return 'system'
    }
  })

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* private mode */
    }
    setTheme(next === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : next)
  }, [])

  useEffect(() => applyTheme(theme), [theme])

  // Follow OS changes until the user picks a theme explicitly.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => {
      if (!localStorage.getItem(STORAGE_KEY)) setTheme(event.matches ? 'dark' : 'light')
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const toggleTheme = useCallback(
    (origin?: { x: number; y: number }) => {
      const next: Theme = theme === 'dark' ? 'light' : 'dark'
      const commit = () => {
        try {
          localStorage.setItem(STORAGE_KEY, next)
        } catch {
          /* private mode */
        }
        applyTheme(next)
        flushSync(() => {
          setTheme(next)
          setPreferenceState(next)
        })
      }
      const doc = document as ViewTransitionDocument
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!doc.startViewTransition || reduceMotion) {
        commit()
        return
      }
      const x = origin?.x ?? window.innerWidth / 2
      const y = origin?.y ?? 0
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
      const transition = doc.startViewTransition(commit)
      transition.ready
        .then(() => {
          document.documentElement.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 600, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' },
          )
        })
        .catch(() => {})
    },
    [theme],
  )

  const value = useMemo(() => ({ theme, toggleTheme, preference, setPreference }), [theme, toggleTheme, preference, setPreference])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>')
  return context
}
