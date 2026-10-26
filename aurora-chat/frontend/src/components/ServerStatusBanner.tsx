import { useEffect, useState } from 'react'
import { LoaderCircle, ServerCrash } from 'lucide-react'
import { api } from '../lib/api'
import { API_MISCONFIGURED, API_URL } from '../lib/config'

type Status = 'checking' | 'ok' | 'waking' | 'unreachable'

/**
 * Free hosting tiers put idle servers to sleep. This pings the API on load and, if it is slow to
 * answer, explains that the server is waking up instead of leaving the user staring at a spinner.
 */
export function ServerStatusBanner() {
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    if (API_MISCONFIGURED) return
    let cancelled = false
    const slowTimer = window.setTimeout(() => !cancelled && setStatus((s) => (s === 'checking' ? 'waking' : s)), 2500)
    const started = Date.now()

    const ping = async () => {
      while (!cancelled) {
        try {
          await api.health()
          if (!cancelled) setStatus('ok')
          return
        } catch {
          if (Date.now() - started > 120_000) {
            if (!cancelled) setStatus('unreachable')
            return
          }
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }
      }
    }
    void ping()
    return () => {
      cancelled = true
      window.clearTimeout(slowTimer)
    }
  }, [])

  if (API_MISCONFIGURED) {
    return (
      <div className="server-banner error" role="alert">
        <ServerCrash size={18} />
        <span>
          Backend URL not configured. Set <code>VITE_API_URL</code> in your Vercel project settings and redeploy
          (currently <code>{API_URL}</code>).
        </span>
      </div>
    )
  }
  if (status === 'waking') {
    return (
      <div className="server-banner" role="status">
        <LoaderCircle size={18} className="spin" />
        <span>Waking up the server… free hosting sleeps when idle, this can take up to a minute.</span>
      </div>
    )
  }
  if (status === 'unreachable') {
    return (
      <div className="server-banner error" role="alert">
        <ServerCrash size={18} />
        <span>
          Can't reach the API at <code>{API_URL}</code>. Check that the backend is running and CORS allows this site.
        </span>
      </div>
    )
  }
  return null
}
