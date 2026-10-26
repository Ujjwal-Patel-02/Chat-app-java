/* Aurora Chat service worker: offline app shell + Web Push notifications. */
const VERSION = 'aurora-v2'
const SHELL_CACHE = `${VERSION}-shell`
const ASSET_CACHE = `${VERSION}-assets`
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/badge-96.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

async function trim(cache, max) {
  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((key) => cache.delete(key)))
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // API, media and CDNs always go to the network

  // Pages: network first (always fresh), cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
            const copy = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy))
          }
          return response
        })
        .catch(async () => (await caches.match('/index.html')) || (await caches.match('/')) || Response.error()),
    )
    return
  }

  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) {
          cache.put(request, response.clone())
          trim(cache, 80)
        }
        return response
      }),
    )
    return
  }

  // Other static files (icons, manifest): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached || Response.error())
      return cached || network
    }),
  )
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Aurora Chat', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    (async () => {
      if (typeof data.badge === 'number' && self.navigator.setAppBadge) {
        try {
          await (data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge())
        } catch {
          /* unsupported */
        }
      }
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const focused = windows.some((client) => client.focused && client.visibilityState === 'visible')
      if (focused && data.type === 'message') return // the open app shows its own in-app banner

      const tag = data.tag || 'aurora'
      const existing = await self.registration.getNotifications({ tag })
      const previous = existing.reduce((max, n) => Math.max(max, (n.data && n.data.count) || 1), 0)
      const count = data.type === 'message' ? previous + 1 : 1
      const title = count > 1 ? `${data.title} · ${count} new messages` : data.title || 'Aurora Chat'
      await self.registration.showNotification(title, {
        body: data.body || '',
        tag,
        renotify: true,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        image: data.image,
        timestamp: data.timestamp || Date.now(),
        vibrate: [80, 40, 80],
        data: { url: data.url || '/', conversationId: data.conversationId, count },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { url = '/', conversationId } = event.notification.data || {}
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const client = windows.find((c) => new URL(c.url).origin === self.location.origin)
      if (client) {
        await client.focus()
        if (conversationId) client.postMessage({ type: 'open-conversation', conversationId })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})

// The browser rotated the subscription: ask any open window to register the new one.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((windows) => windows.forEach((c) => c.postMessage({ type: 'push-resync' }))),
  )
})
