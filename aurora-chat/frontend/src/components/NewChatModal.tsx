import { useEffect, useState } from 'react'
import { Check, LoaderCircle, Search, Users, X } from 'lucide-react'
import { useChat } from '../context/ChatContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'
import { lastSeenLabel } from '../lib/format'
import type { User } from '../lib/types'
import { Avatar } from './Avatar'

type Tab = 'direct' | 'group'

export function NewChatModal({ onClose }: { onClose: () => void }) {
  const { state, openDirect, createGroup } = useChat()
  const { notify } = useToast()
  const [tab, setTab] = useState<Tab>('direct')
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<User[]>([])
  const [groupName, setGroupName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      api
        .users(query.trim())
        .then((users) => !cancelled && setPeople(users))
        .catch((error: Error) => !cancelled && notify(error.message, 'error'))
        .finally(() => !cancelled && setLoading(false))
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, notify])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isOnline = (user: User) => state.presence[user.id]?.online ?? user.online
  const sorted = [...people].sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)))

  const startDirect = async (user: User) => {
    setBusy(true)
    try {
      await openDirect(user.id)
      onClose()
    } catch (error) {
      notify((error as Error).message, 'error')
      setBusy(false)
    }
  }

  const toggle = (user: User) =>
    setSelected((current) => (current.some((u) => u.id === user.id) ? current.filter((u) => u.id !== user.id) : [...current, user]))

  const submitGroup = async () => {
    setBusy(true)
    try {
      await createGroup(groupName, selected.map((u) => u.id))
      onClose()
    } catch (error) {
      notify((error as Error).message, 'error')
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal glass" role="dialog" aria-modal="true" aria-labelledby="new-chat-title">
        <header className="modal-header">
          <h2 id="new-chat-title">New conversation</h2>
          <button className="icon-btn ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="segmented">
          <button type="button" className={tab === 'direct' ? 'active' : ''} onClick={() => setTab('direct')}>
            Direct message
          </button>
          <button type="button" className={tab === 'group' ? 'active' : ''} onClick={() => setTab('group')}>
            New group
          </button>
          <span className={`segmented-indicator ${tab === 'direct' ? 'login' : 'register'}`} />
        </div>

        {tab === 'group' && (
          <label className="field">
            <span className="field-label">Group name</span>
            <span className="field-control">
              <Users size={17} />
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="🚀 Launch Squad" maxLength={60} />
            </span>
          </label>
        )}

        <div className="search-box">
          <Search size={16} />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people by name or @username" />
        </div>

        {tab === 'group' && selected.length > 0 && (
          <div className="chip-row">
            {selected.map((user) => (
              <button key={user.id} className="person-chip" onClick={() => toggle(user)}>
                <Avatar name={user.displayName} seed={user.username} size={22} />
                {user.displayName}
                <X size={13} />
              </button>
            ))}
          </div>
        )}

        <div className="people-list">
          {loading && people.length === 0 && (
            <div className="people-empty">
              <LoaderCircle size={20} className="spin" />
            </div>
          )}
          {!loading && people.length === 0 && (
            <div className="people-empty">
              {query ? `Nobody matches “${query}”.` : 'No one else has joined yet — invite a friend to sign up!'}
            </div>
          )}
          {sorted.map((user) => {
            const checked = selected.some((u) => u.id === user.id)
            const online = isOnline(user)
            return (
              <button
                key={user.id}
                className={`person-row${checked ? ' selected' : ''}`}
                disabled={busy}
                onClick={() => (tab === 'direct' ? startDirect(user) : toggle(user))}
              >
                <Avatar name={user.displayName} seed={user.username} size={42} online={online} />
                <span className="person-info">
                  <strong>{user.displayName}</strong>
                  <span>
                    @{user.username} · {online ? <em className="online-text">Online</em> : lastSeenLabel(state.presence[user.id]?.lastSeenAt ?? user.lastSeenAt)}
                  </span>
                </span>
                {tab === 'group' && <span className={`checkbox${checked ? ' checked' : ''}`}>{checked && <Check size={14} />}</span>}
              </button>
            )
          })}
        </div>

        {tab === 'group' && (
          <footer className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy || selected.length === 0 || !groupName.trim()} onClick={submitGroup}>
              {busy && <LoaderCircle size={16} className="spin" />}
              Create group{selected.length > 0 ? ` (${selected.length + 1})` : ''}
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}
