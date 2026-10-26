import { useEffect, useState } from 'react'
import { BellRing, Share, X } from 'lucide-react'
import { useToast } from '../context/ToastContext'
import { enablePush, getPushStatus, type PushStatus } from '../lib/push'

const DISMISS_KEY = 'aurora-push-prompt-dismissed'

/** Friendly opt-in card (browsers penalize permission prompts shown without a user action). */
export function NotificationPrompt() {
  const { notify } = useToast()
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getPushStatus().then(setStatus)
  }, [])

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  if (dismissed || !status) return null
  const askable = status === 'off' && typeof Notification !== 'undefined' && Notification.permission === 'default'
  if (!askable && status !== 'ios-install') return null

  return (
    <div className="notify-card">
      <span className="notify-icon">
        <BellRing size={18} />
      </span>
      <div className="notify-text">
        {status === 'ios-install' ? (
          <>
            <strong>Get notifications on iPhone</strong>
            <span>
              Tap <Share size={12} /> Share, then <b>Add to Home Screen</b>, and open Aurora from your Home Screen.
            </span>
          </>
        ) : (
          <>
            <strong>Never miss a message</strong>
            <span>Turn on notifications for new messages, even when Aurora is closed.</span>
            <button
              type="button"
              className="btn btn-primary btn-small"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await enablePush()
                  notify('Notifications are on 🎉', 'success')
                  setStatus('on')
                } catch (error) {
                  notify(error instanceof Error ? error.message : 'Could not turn on notifications', 'error')
                  setStatus(await getPushStatus())
                } finally {
                  setBusy(false)
                }
              }}
            >
              Turn on notifications
            </button>
          </>
        )}
      </div>
      <button type="button" className="icon-btn ghost small" onClick={dismiss} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  )
}
