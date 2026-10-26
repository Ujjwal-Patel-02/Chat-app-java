import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, api, getAuthToken, setAuthToken, setUnauthorizedHandler, withRetry } from '../lib/api'
import { detachPush } from '../lib/push'
import type { AuthResponse, User } from '../lib/types'

interface AuthContextValue {
  user: User | null
  token: string | null
  initializing: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, displayName: string, password: string) => Promise<void>
  logout: () => void
}

const TOKEN_KEY = 'aurora-token'
const AuthContext = createContext<AuthContextValue | null>(null)

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    const stored = readStoredToken()
    setAuthToken(stored) // must be set before any child effect issues a request
    return stored
  })
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState<boolean>(() => readStoredToken() !== null)

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
    setToken(null)
    setUser(null)
    // Stop this device receiving the signed-out user's notifications (needs the token, so clear it after).
    const signedOutToken = getAuthToken()
    void detachPush().finally(() => {
      if (getAuthToken() === signedOutToken) setAuthToken(null)
    })
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  // Restore the session on page load (retrying while a sleeping free-tier server wakes up).
  useEffect(() => {
    if (!token || user) {
      setInitializing(false)
      return
    }
    let cancelled = false
    withRetry(() => api.me())
      .then((me) => {
        if (!cancelled) setUser(me)
      })
      .catch((error) => {
        if (!cancelled && (!(error instanceof ApiError) || error.status === 401 || error.status === 404)) logout()
      })
      .finally(() => {
        if (!cancelled) setInitializing(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, user, logout])

  const persist = useCallback((response: AuthResponse) => {
    try {
      localStorage.setItem(TOKEN_KEY, response.token)
    } catch {
      /* ignore */
    }
    setAuthToken(response.token)
    setUser(response.user)
    setToken(response.token)
  }, [])

  const login = useCallback(
    async (username: string, password: string) => persist(await api.login(username, password)),
    [persist],
  )

  const register = useCallback(
    async (username: string, displayName: string, password: string) =>
      persist(await api.register(username, displayName, password)),
    [persist],
  )

  const value = useMemo(
    () => ({ user, token, initializing, login, register, logout }),
    [user, token, initializing, login, register, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
