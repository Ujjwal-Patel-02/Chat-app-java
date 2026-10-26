<div align="center">

<img src="frontend/public/favicon.svg" width="72" alt="Aurora Chat logo" />

# Aurora Chat

**Real-time chat with replies, reactions, photo & video sharing and downloads, push notifications and a glassy light & dark UI. Installable on your phone, and it stays awake on free hosting.**
Java Spring Boot backend · React frontend · WebSockets · PWA

![Java](https://img.shields.io/badge/Java-17%2B-orange?logo=openjdk&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.5-6DB33F?logo=springboot&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-8b5cf6)

<img src="docs/screenshots/08-media-dark.png" alt="Aurora Chat with photo and video sharing in dark mode" width="100%" />

<p>
  <img src="docs/screenshots/11-mobile-media-dark.png" width="19%" alt="Phone: group chat with an album" />
  <img src="docs/screenshots/12-mobile-actions-dark.png" width="19%" alt="Phone: long-press actions" />
  <img src="docs/screenshots/16-mobile-banner-dark.png" width="19%" alt="Phone: in-app notification" />
  <img src="docs/screenshots/15-mobile-info-light.png" width="19%" alt="Phone: shared media" />
  <img src="docs/screenshots/14-mobile-settings-light.png" width="19%" alt="Phone: settings and notifications" />
</p>

</div>

---

## ✨ Features

| Feature | What it does |
|---|---|
| ⚡ **Real-time messaging** | Messages appear instantly for everyone in the chat (STOMP over WebSocket). The app reconnects and catches up automatically, including when a phone wakes the app. |
| 📷 **Photos & videos** | Send up to 10 at once from the gallery, camera, clipboard paste or drag & drop. Photos are compressed on the device (a 3.5 MB photo became about 1.5 MB in testing). Videos get a poster frame. You see upload progress, a blurred preview while files load, and albums laid out in a grid. |
| ⬇️ **Download received media** | On a computer, hover a photo or video and click ⬇, or use **⋯ → Download all** for an album. On a phone, long-press → **Save photo / Save all**, which opens the share sheet → *Save Image* (Photos/Gallery). Files get neutral names like `aurora-20261026-153812-1a2b.jpg`. |
| 🖼️ **Full-screen viewer** | Swipe between photos and videos, pinch or double-tap to zoom, swipe down to close, and share or save files. |
| 🔔 **Push notifications** | Get alerted about new messages even when the app is closed (Web Push with VAPID, implemented with the plain JDK). Several messages from one chat stack into one notification. Tapping a notification opens that chat. The home-screen icon shows an unread badge. |
| 🔕 **Mute & in-app alerts** | Mute any chat. While the app is open, messages in other chats show a tappable banner with a soft sound. |
| 📱 **Mobile-first, installable** | Install it as an app (PWA) with an offline app shell. On phones: long-press a message for actions, swipe right to reply, double-tap to ❤️. The composer stays above the keyboard, the layout respects notches and safe areas, and the back button works. |
| ↩️ **Replies** | Reply to any message, photos included (the quote shows a thumbnail). Tap the quote to jump to the original. |
| 😍 **Reactions** | Quick reactions, a searchable emoji picker, live counts, and you can see who reacted. |
| 👥 **Direct & group chats** | 1:1 and named group chats, each with an info panel listing members and every shared photo and video. |
| 🟢 **Presence, typing, receipts** | Online dots, "last seen" times, typing indicators, ✓ sent / ✓✓ seen, and unread badges. |
| 🌗 **Light & dark mode** | Light, dark, or follow the system, switched with a circular reveal animation. |
| ☕ **Stays awake on free hosting** | The server pings its own public address every 10 minutes (automatic on Render), and a scheduled GitHub Actions event every 10 minutes is included as a second layer, so the free instance never falls asleep. `/api/health` shows the version, uptime and keep-alive status. |
| 🔄 **Safe upgrades** | Database changes are additive only. Upgrading keeps every user, chat and message (tested on PostgreSQL 17 and H2), and `scripts/update-repo.sh` puts a new version into your existing GitHub repo. |
| 🔐 **Secure by default** | BCrypt passwords, JWT for REST and WebSocket, per-chat authorization. Uploads are type-checked by their actual bytes, push endpoints are restricted to an allowlist, and notifications are end-to-end encrypted. |

## 🧱 Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, `@stomp/stompjs`, lucide icons, hand-written CSS design system, service worker (offline shell + push), Web App Manifest |
| Backend | Java 17+, Spring Boot 3.5 (Web, WebSocket/STOMP, Security, Data JPA, Validation), JJWT; Web Push (RFC 8291/8292) implemented with the plain JDK |
| Storage | PostgreSQL (e.g. free Neon) or zero-setup H2 locally · media on **Cloudinary** (free) or local disk |
| Hosting (free) | Frontend on **Vercel** · API on **Render** (Docker) · Postgres on **Neon** · media on **Cloudinary** |

## 🗺️ Architecture

```mermaid
flowchart LR
    subgraph Phone["Browser / installed PWA"]
      UI["React app<br/>(Vercel)"]
      SW["Service worker<br/>offline + push"]
    end
    subgraph API["Spring Boot API (Render)"]
      REST["REST /api/**"]
      WS["STOMP /ws"]
      SVC["Services<br/>chat · media · push"]
    end
    DB[("PostgreSQL<br/>(Neon)")]
    CDN[("Cloudinary<br/>photos & videos")]
    PUSH["Browser push services<br/>(FCM · Mozilla · Apple · WNS)"]

    UI -- "HTTPS + JWT" --> REST
    UI <-- "WSS + JWT" --> WS
    UI -- "loads media" --> CDN
    REST --> SVC
    SVC --> DB
    SVC -- "uploads" --> CDN
    SVC -- "events after commit" --> WS
    SVC -- "encrypted, VAPID-signed" --> PUSH
    PUSH --> SW
```

* **Writes go over REST.** After the transaction commits, the server pushes events to each member's private queue `/user/queue/events`.
* **Media is uploaded first** (`POST /api/media`), then attached to the message, so sending is instant and progress is visible.
* **Push notifications** go to members who aren't muted and have notifications on. The service worker skips them when the app is already open and focused.

## 🚀 Quick start (local)

**Prerequisites:** JDK 17+ and Node.js 20.19+ (or 22+). No database or cloud accounts needed.

```bash
git clone https://github.com/<your-username>/aurora-chat.git
cd aurora-chat

# 1) Backend → http://localhost:8080   (demo users are optional)
cd backend
APP_DEMO_DATA_ENABLED=true ./mvnw spring-boot:run        # Windows CMD: set "APP_DEMO_DATA_ENABLED=true" && mvnw.cmd spring-boot:run

# 2) Frontend → http://localhost:5173   (in a second terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open <http://localhost:5173> and sign in as **alex** / **password123** (demo data), or create an account. To chat with yourself, open a **private window** and sign in as **maya** / **password123**. Photos and videos are saved in `backend/data/uploads`. Notifications work on `localhost` in Chrome, Edge and Firefox: turn them on under ⚙️ Settings.

> Full step-by-step instructions, including free deployment to Vercel, are in **[SETUP_AND_DEPLOYMENT.md](SETUP_AND_DEPLOYMENT.md)**.

## 🔄 Upgrading an existing installation

Already running an older Aurora Chat? Keep the **same GitHub repo, Render service, Vercel project and Neon database**. All data stays:

```bash
git clone https://github.com/<you>/<your-repo>.git my-aurora-repo   # your existing repo
cd aurora-chat                                                      # the new version (unzipped)
bash scripts/update-repo.sh ../my-aurora-repo                       # copies it in, asks to commit + push
```

Render and Vercel redeploy automatically. Then add `CLOUDINARY_URL` on Render. Backup, GitHub Desktop and rollback steps: **[SETUP_AND_DEPLOYMENT.md → Part B](SETUP_AND_DEPLOYMENT.md#part-b--upgrade-your-existing-app-keep-all-data-same-github-repo)**.

## 📁 Project structure

```
aurora-chat/
├── backend/                         Spring Boot API (Maven)
│   ├── src/main/java/com/aurora/chat/
│   │   ├── auth/                    register / login / me
│   │   ├── chat/                    conversations, messages, reactions, typing, mute, events
│   │   ├── media/                   uploads, type sniffing, local + Cloudinary storage, streaming, clean-up
│   │   ├── push/                    Web Push: VAPID keys, RFC 8291 encryption, subscriptions, notifications
│   │   ├── user/                    users, presence
│   │   ├── security/                JWT, HTTP filter, STOMP auth interceptor
│   │   ├── config/                  security, WebSocket, async, DATABASE_URL parsing, demo data
│   │   ├── common/ · dto/           mapping, errors, health, request/response records
│   ├── src/test/java/...            26 tests: REST, WebSocket, media, downloads, push, Cloudinary, keep-alive
│   └── Dockerfile
├── frontend/                        React + Vite PWA
│   ├── public/                      sw.js (service worker), manifest.webmanifest, icons/
│   ├── src/components/              chat UI, media grid & viewer, sheets, settings, banners…
│   ├── src/context/                 auth, theme, toasts, chat state (reducer + STOMP client)
│   ├── src/lib/                     API, media processing & uploads, push, PWA, sounds, formatting
│   └── vercel.json
├── scripts/update-repo.sh           puts a new version into your existing Git repo (keeps data & history)
├── .github/workflows/               ci.yml (build + test) · keep-alive.yml (pings the backend every 10 min)
├── docs/                            PDF guide + screenshots
├── render.yaml                      one-click Render blueprint for the API
├── docker-compose.yml               optional local Postgres + API
├── README.md                        ← you are here
└── SETUP_AND_DEPLOYMENT.md          setup & free hosting guide
```

## 🔌 API reference

All endpoints except register/login/health and media downloads require `Authorization: Bearer <token>`. Errors look like `{"status":400,"error":"Bad Request","message":"…"}`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` · `/api/auth/login` | → `{token, user}` |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/users?query=` | Search people (excludes you) |
| `GET` | `/api/conversations` | Your chats with last message, unread count, read states, `muted` |
| `POST` | `/api/conversations/direct` · `/group` | `{userId}` · `{name, memberIds[]}` |
| `GET` | `/api/conversations/{id}/messages?before=&limit=` | Page of messages (oldest → newest) |
| `POST` | `/api/conversations/{id}/messages` | `{content?, replyToId?, clientId?, attachmentIds?[]}` (text and/or up to 10 uploads) |
| `POST` | `/api/conversations/{id}/read` | `{messageId}` → move your read marker |
| `PUT` | `/api/conversations/{id}/mute` | `{muted}` → mute/unmute notifications |
| `GET` | `/api/conversations/{id}/media?before=` | Shared photos & videos, newest first |
| `PATCH` · `DELETE` | `/api/messages/{id}` | Edit (caption may be empty for media) · delete your message (files are deleted too) |
| `POST` | `/api/messages/{id}/reactions` | `{emoji}` → toggle your reaction |
| `POST` | `/api/media` | Multipart upload: `file` (+ optional `poster`, `width`, `height`, `durationMs`, `placeholder`) → attachment |
| `GET` | `/api/media/{id}` · `/api/media/{id}/thumbnail` | File stream with HTTP range support (public, unguessable id); add `?download=true` to force a download |
| `GET` | `/api/push/config` | `{enabled, publicKey}` (VAPID) |
| `POST` · `DELETE` | `/api/push/subscriptions` | Register / remove this browser (`PushSubscription.toJSON()`) |
| `POST` | `/api/push/test` | Send yourself a test notification |
| `GET` | `/api/health` | `{status, version, uptime, keepAlive}`: public, no database access |

### WebSocket (STOMP)

Connect to `ws(s)://<api-host>/ws` with the STOMP header `Authorization: Bearer <token>`.

| Direction | Destination | Payload |
|---|---|---|
| subscribe | `/user/queue/events` | `{type, conversationId, payload}`: `MESSAGE_CREATED`, `MESSAGE_UPDATED`, `REACTIONS_UPDATED`, `CONVERSATION_UPSERTED`, `TYPING`, `READ`, `MUTE_UPDATED` |
| subscribe | `/topic/presence` | `{userId, online, lastSeenAt}` |
| send | `/app/conversations/{id}/typing` | `{typing: true \| false}` |

## ⚙️ Configuration

**Backend** (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP port (set automatically by most hosts) |
| `DATABASE_URL` | *(unset → H2 file DB)* | Postgres URL, e.g. `postgresql://user:pass@host/db?sslmode=require` (Neon/Render format is fine) |
| `APP_JWT_SECRET` | dev value | **Required in production.** Any long random string |
| `APP_JWT_EXPIRATION` | `7d` | Token lifetime |
| `APP_CORS_ALLOWED_ORIGINS` | `http://localhost:5173,…` | Comma-separated frontend origins; patterns like `https://*.vercel.app` allowed |
| `CLOUDINARY_URL` | *(unset → local disk)* | `cloudinary://API_KEY:API_SECRET@CLOUD_NAME` from the Cloudinary dashboard. **Needed on hosts with temporary disks (Render free).** |
| `APP_MEDIA_STORAGE` | `auto` | `auto`, `local` or `cloudinary` |
| `APP_MEDIA_DIR` | `./data/uploads` | Folder for local media storage |
| `APP_MEDIA_MAX_IMAGE_MB` · `APP_MEDIA_MAX_VIDEO_MB` | `10` · `50` | Upload limits per file |
| `APP_PUSH_SUBJECT` | `mailto:notifications@aurora-chat.dev` | Your contact `mailto:` or `https:` URL for push services (Apple requires a valid one) |
| `APP_PUSH_VAPID_PUBLIC_KEY` · `…_PRIVATE_KEY` | *(generated)* | Optional; otherwise generated once and stored in the database |
| `APP_PUSH_ENABLED` | `true` | Turn push notifications off entirely |
| `APP_PUBLIC_URL` | *(Render: automatic)* | Public API URL; lets notifications show photo previews when media is on local disk |
| `APP_KEEP_ALIVE_ENABLED` | `true` | Ping `<public URL>/api/health` so free hosts don't put the server to sleep |
| `APP_KEEP_ALIVE_URL` | *(Render: automatic)* | URL to ping (defaults to `APP_PUBLIC_URL`, or `RENDER_EXTERNAL_URL` on Render) |
| `APP_KEEP_ALIVE_INTERVAL` | `10m` | How often to ping (keep it under Render's 15-minute sleep timer) |
| `APP_DEMO_DATA_ENABLED` | `false` | Seed demo users/conversations into an **empty** database |

**Frontend** (build-time: `frontend/.env.local` locally, or Vercel → Environment Variables)

| Variable | Example | Purpose |
|---|---|---|
| `VITE_API_URL` | `https://aurora-chat-api.onrender.com` | Backend base URL (no trailing slash) |
| `VITE_WS_URL` | *(optional)* | Override the WebSocket URL (defaults to `VITE_API_URL` + `/ws`) |

## 📱 Notifications & install, by platform

| Platform | Install | Push notifications |
|---|---|---|
| Android (Chrome, Edge, Samsung) | Menu → **Install app** (or the in-app Settings button) | ✅ In the browser or installed |
| iPhone / iPad (iOS 16.4+) | Safari → Share → **Add to Home Screen** | ✅ After installing to the Home Screen (Apple requirement) |
| Desktop (Chrome, Edge, Firefox, Safari 16+) | Install icon in the address bar (Chromium) | ✅ |

## 🧪 Testing

```bash
cd backend && ./mvnw test          # 26 tests
cd frontend && npm run build       # strict TypeScript + production build
```

The backend tests cover REST flows and WebSocket delivery. They also cover media: upload, type sniffing, range streaming, deleting files with their message, and cleaning up uploads that were never sent. On the push side, they check Cloudinary request signing (against Cloudinary's documented example), VAPID, and a full delivery path to a fake push service. One test asserts that the Web Push encryption matches a vector from Node's `http_ece` (the library behind the `web-push` npm package) byte for byte.

The app was also checked end to end with real browsers: an emulated phone and a laptop (17 mobile/media/notification checks, 7 download checks and 16 regression checks). The upgrade path was run on PostgreSQL 17 and H2: data from the previous version survived upgrading, rolling back and upgrading again.

## ☁️ Deploy for free

| Part | Where | Notes |
|---|---|---|
| React PWA | **Vercel** (Hobby) | Root directory `frontend`, set `VITE_API_URL` |
| Spring Boot API | **Render** (free web service, Docker) | `render.yaml` included; sleeps after ~15 min idle |
| PostgreSQL | **Neon** (free) | Paste the connection string into `DATABASE_URL` |
| Photos & videos | **Cloudinary** (free) | Paste `CLOUDINARY_URL` into Render |
| Keep-awake | Built in + GitHub Actions | Automatic on Render; set the `BACKEND_URL` repo variable for the scheduled event |

Vercel can't run a long-lived Java server with WebSockets, so the API runs on Render. The whole stack still costs $0. **[SETUP_AND_DEPLOYMENT.md](SETUP_AND_DEPLOYMENT.md)** walks through every click.

## 📸 More screenshots

<p align="center">
  <img src="docs/screenshots/17-download-dark.png" width="64%" alt="Download a photo or a whole album" />
  <img src="docs/screenshots/18-mobile-save-dark.png" width="16%" alt="Phone: Save all" />
  <img src="docs/screenshots/19-mobile-about-light.png" width="16%" alt="Settings → About: version and keep-awake" />
</p>
<p align="center">
  <img src="docs/screenshots/09-media-light.png" width="49%" alt="Light mode with attachment tray" />
  <img src="docs/screenshots/10-viewer-dark.png" width="49%" alt="Full-screen viewer" />
</p>
<p align="center">
  <img src="docs/screenshots/01-auth-light.png" width="49%" alt="Sign in (light)" />
  <img src="docs/screenshots/02-chat-dark.png" width="49%" alt="Group chat (dark)" />
</p>
<p align="center">
  <img src="docs/screenshots/06-mobile-list-dark.png" width="19%" alt="Phone list (dark)" />
  <img src="docs/screenshots/13-mobile-viewer-dark.png" width="19%" alt="Phone viewer" />
  <img src="docs/screenshots/11-mobile-media-light.png" width="19%" alt="Phone chat (light)" />
  <img src="docs/screenshots/06-mobile-list-light.png" width="19%" alt="Phone list (light)" />
</p>

## 🛣️ Ideas for next steps

- Voice messages and file attachments (PDFs, docs)
- Message search and pinned messages
- Group management (rename, add/remove members, admins)
- Horizontal scaling with an external STOMP broker (RabbitMQ) and Redis-backed presence

## 📄 License

[MIT](LICENSE). Use it, learn from it, ship it.
