import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      className={`theme-toggle${isDark ? ' is-dark' : ''}${compact ? ' compact' : ''}`}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      }}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      <span className="theme-toggle-track">
        <Sun size={14} className="theme-icon sun" />
        <Moon size={14} className="theme-icon moon" />
        <span className="theme-toggle-knob">{isDark ? <Moon size={13} /> : <Sun size={13} />}</span>
      </span>
    </button>
  )
}
