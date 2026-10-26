import { useEffect, useState } from 'react'
import { Bell, Download, Info, Keyboard, LogOut, Monitor, Moon, Send, Server, Share, Smartphone, Sun, Volume2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useChatActions } from '../context/ChatContext'
import { useTheme, type ThemePreference } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import { useCoarsePointer } from '../hooks/useMediaQuery'
import { api } from '../lib/api'
import { setPref, usePref } from '../lib/prefs'
import { disablePush, enablePush, getPushStatus, isIOS, isStandalone, type PushStatus } from '../lib/push'
import { promptInstall, useInstallAvailable } from '../lib/pwa'
import { Avatar } from './Avatar'
import { BottomSheet } from './BottomSheet'

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth()
  const { me } = useChatActions()
  const { preference, setPreference } = useTheme()
  const { notify } = useToast()
  const coarse = useCoarsePointer()
  const sound = usePref('sound')
  const enterToSend = usePref('enterToSend')
  const installAvailable = useInstallAvailable()
  const [push, setPush] = useState<PushStatus | null>(null)
  const [server, setServer] = useState<{ version?: string; uptime?: string; keepAlive?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getPushStatus().then(setPush)
    api.health().then(setServer).catch(() => setServer({}))
  }, [])

  const togglePush = async (on: boolean) => {
    setBusy(true)
    try {
      if (on) {
        await enablePush()
        notify('Notifications are on 🎉', 'success')
      } else {
        await disablePush()
        notify('Notifications are off on this device', 'info')
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not change notifications', 'error')
    } finally {
      setPush(await getPushStatus())
      setBusy(false)
    }
  }

  const pushHint: Record<PushStatus, string> = {
    on: 'You’ll be notified about new messages on this device, even when Aurora is closed.',
    off: 'Get notified about new messages, even when Aurora is closed.',
    denied: 'Notifications are blocked. Allow them for this site in your browser settings, then come back.',
    unsupported: 'This browser doesn’t support notifications. Try Chrome, Edge, Firefox or Safari.',
    'ios-install': 'On iPhone and iPad, add Aurora to your Home Screen first (Share → Add to Home Screen).',
  }

  return (
    <BottomSheet onClose={onClose} title="Settings" className="settings-sheet">
      <div className="profile-card">
        <Avatar name={me.displayName} seed={me.username} size={56} />
        <span>
          <strong>{me.displayName}</strong>
          <span>@{me.username}</span>
        </span>
      </div>

      <div className="settings-group">
        <h4 className="group-label">Appearance</h4>
        <div className="theme-choices" role="radiogroup" aria-label="Theme">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" role="radio" aria-checked={preference === value} className={`theme-choice${preference === value ? ' active' : ''}`} onClick={() => setPreference(value)}>
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <h4 className="group-label">Notifications</h4>
        <label className={`setting-row${push === 'unsupported' || push === 'ios-install' || push === 'denied' ? ' disabled' : ''}`}>
          <span className="setting-icon">
            <Bell size={18} />
          </span>
          <span className="setting-text">
            <strong>Push notifications</strong>
            <span>{push ? pushHint[push] : 'Checking…'}</span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={push === 'on'}
            disabled={busy || !push || push === 'unsupported' || push === 'ios-install' || push === 'denied'}
            onChange={(event) => void togglePush(event.target.checked)}
            aria-label="Push notifications"
          />
        </label>
        {push === 'on' && (
          <button
            type="button"
            className="setting-link"
            onClick={async () => {
              try {
                const { devices } = await api.pushTest()
                notify(devices > 0 ? 'Test notification sent' : 'No devices are subscribed yet', devices > 0 ? 'success' : 'info')
              } catch (error) {
                notify(error instanceof Error ? error.message : 'Could not send a test', 'error')
              }
            }}
          >
            <Send size={15} /> Send a test notification
          </button>
        )}
        <label className="setting-row">
          <span className="setting-icon">
            <Volume2 size={18} />
          </span>
          <span className="setting-text">
            <strong>In-app sounds</strong>
            <span>Play a sound for messages in other chats</span>
          </span>
          <input type="checkbox" className="switch" checked={sound} onChange={(event) => setPref('sound', event.target.checked)} aria-label="In-app sounds" />
        </label>
      </div>

      <div className="settings-group">
        <h4 className="group-label">Chats</h4>
        <label className="setting-row">
          <span className="setting-icon">
            <Keyboard size={18} />
          </span>
          <span className="setting-text">
            <strong>Enter key sends</strong>
            <span>{coarse ? 'Off: Enter adds a new line, tap the send button to send' : 'Shift+Enter always adds a new line'}</span>
          </span>
          <input type="checkbox" className="switch" checked={enterToSend} onChange={(event) => setPref('enterToSend', event.target.checked)} aria-label="Enter key sends" />
        </label>
      </div>

      {(installAvailable || (isIOS() && !isStandalone())) && (
        <div className="settings-group">
          <h4 className="group-label">App</h4>
          {installAvailable ? (
            <button type="button" className="setting-row as-button" onClick={() => void promptInstall()}>
              <span className="setting-icon">
                <Download size={18} />
              </span>
              <span className="setting-text">
                <strong>Install Aurora</strong>
                <span>Add it to your home screen or dock. It opens full-screen like a native app.</span>
              </span>
            </button>
          ) : (
            <div className="setting-row">
              <span className="setting-icon">
                <Smartphone size={18} />
              </span>
              <span className="setting-text">
                <strong>Add to Home Screen</strong>
                <span>
                  In Safari tap <Share size={12} /> Share → <b>Add to Home Screen</b> for a full-screen app with notifications.
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      <div className="settings-group">
        <h4 className="group-label">About</h4>
        <div className="about-card">
          <span className="about-row">
            <Info size={15} /> App <b>v{__APP_VERSION__}</b>
          </span>
          <span className="about-row">
            <Server size={15} /> Server{' '}
            {server === null ? (
              'checking…'
            ) : server.version ? (
              <>
                <b>v{server.version}</b> · up {server.uptime} · keep-awake <b className={server.keepAlive === 'on' ? 'ok' : ''}>{server.keepAlive}</b>
              </>
            ) : (
              'unreachable'
            )}
          </span>
        </div>
      </div>

      <button type="button" className="btn btn-ghost btn-block sign-out" onClick={logout}>
        <LogOut size={17} /> Sign out
      </button>
    </BottomSheet>
  )
}
