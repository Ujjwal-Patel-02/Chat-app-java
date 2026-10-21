const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const rawApiUrl = import.meta.env.VITE_API_URL?.trim()

/** Base URL of the Spring Boot API, e.g. https://aurora-chat-api.onrender.com */
export const API_URL = trimTrailingSlash(rawApiUrl ? rawApiUrl : 'http://localhost:8080')

const rawWsUrl = import.meta.env.VITE_WS_URL?.trim()

/** STOMP WebSocket endpoint: http(s)://host → ws(s)://host/ws */
export const WS_URL = rawWsUrl ? rawWsUrl : `${API_URL.replace(/^http/i, 'ws')}/ws`

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/**
 * True when the site is deployed (not on localhost) but still points at a localhost API,
 * which means VITE_API_URL was not set when the frontend was built.
 */
export const API_MISCONFIGURED =
  typeof window !== 'undefined' &&
  !LOCAL_HOSTS.includes(window.location.hostname) &&
  /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API_URL)
