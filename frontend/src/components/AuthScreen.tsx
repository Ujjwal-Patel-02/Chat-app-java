import { useState, type FormEvent } from 'react'
import { ArrowRight, AtSign, Eye, EyeOff, LoaderCircle, Lock, MessageCircle, Palette, Reply, SmilePlus, User as UserIcon, Zap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from './ThemeToggle'
import { Logo } from './Logo'

type Mode = 'login' | 'register'

const FEATURES = [
  { icon: Zap, title: 'Real-time', text: 'Messages, typing and presence over WebSockets' },
  { icon: Reply, title: 'Threaded replies', text: 'Quote any message and jump back to it' },
  { icon: SmilePlus, title: 'Reactions', text: 'React with any emoji, see who reacted' },
  { icon: Palette, title: 'Light & dark', text: 'A glassy aurora UI in both themes' },
]

export function AuthScreen() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') await login(username, password)
      else await register(username, displayName, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
  }

  return (
    <div className="auth-screen">
      <div className="auth-topbar">
        <Logo />
        <ThemeToggle />
      </div>

      <section className="auth-hero">
        <span className="pill-badge">
          <MessageCircle size={14} /> Spring Boot · React · WebSockets
        </span>
        <h1>
          Conversations,
          <br />
          <span className="gradient-text">beautifully in sync.</span>
        </h1>
        <p className="auth-lead">
          Chat with your people in real time. Reply to any message, react with emoji and switch between light and dark
          whenever you like.
        </p>
        <ul className="feature-grid">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="feature-card">
              <span className="feature-icon">
                <Icon size={18} />
              </span>
              <div>
                <strong>{title}</strong>
                <span>{text}</span>
              </div>
            </li>
          ))}
        </ul>

        <div className="preview-stack" aria-hidden="true">
          <div className="preview-bubble theirs">
            <span className="preview-name">Maya</span>
            The new aurora theme looks unreal 🌌
            <span className="preview-reactions">
              <span>🔥 3</span>
              <span>😍 2</span>
            </span>
          </div>
          <div className="preview-bubble mine">
            <span className="preview-quote">Maya: The new aurora theme looks…</span>
            Right? Wait till you try dark mode ✨
          </div>
          <div className="preview-typing">
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      <section className="auth-card glass" aria-label={mode === 'login' ? 'Sign in' : 'Create account'}>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>
            Create account
          </button>
          <span className={`segmented-indicator ${mode}`} />
        </div>

        <div className="auth-card-head">
          <h2>{mode === 'login' ? 'Welcome back' : 'Join Aurora'}</h2>
          <p>{mode === 'login' ? 'Sign in to pick up your conversations.' : 'Create an account in seconds — no email needed.'}</p>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && (
            <label className="field">
              <span className="field-label">Display name</span>
              <span className="field-control">
                <UserIcon size={17} />
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Alex Rivera" autoComplete="name" maxLength={40} required />
              </span>
            </label>
          )}
          <label className="field">
            <span className="field-label">Username</span>
            <span className="field-control">
              <AtSign size={17} />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="alex"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={21}
                required
              />
            </span>
            {mode === 'register' && <span className="field-hint">3–20 characters: letters, numbers, dots or underscores.</span>}
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <span className="field-control">
              <Lock size={17} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'At least 6 characters' : '••••••••'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'register' ? 6 : undefined}
                required
              />
              <button type="button" className="icon-btn ghost small" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? <LoaderCircle size={18} className="spin" /> : null}
            {mode === 'login' ? 'Sign in' : 'Create account'}
            {!busy && <ArrowRight size={18} />}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
          <button type="button" className="link-btn" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </section>
    </div>
  )
}
