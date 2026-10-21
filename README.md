<div align="center">

<img src="frontend/public/favicon.svg" width="72" alt="Aurora Chat logo" />

# Aurora Chat

**Real-time chat with threaded replies, emoji reactions and a glassy light & dark UI.**
Java Spring Boot backend · React frontend · WebSockets

![Java](https://img.shields.io/badge/Java-17%2B-orange?logo=openjdk&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.5-6DB33F?logo=springboot&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-8b5cf6)

<img src="docs/screenshots/02-chat-dark.png" alt="Aurora Chat — dark mode" width="100%" />

</div>

---

## ✨ Features

| Feature | What it does |
|---|---|
| ⚡ **Real-time messaging** | Messages appear instantly for everyone in the conversation (STOMP over WebSocket), with automatic reconnect and catch-up after network drops. |
| ↩️ **Replies** | Reply to any message. The reply shows a quoted preview; click it to jump to (and highlight) the original — older history loads automatically. |
| 😍 **Reactions** | One-tap quick reactions, a searchable emoji picker, double-click to ❤️, live counts, and a tooltip showing who reacted. |
| 👥 **Direct & group chats** | Start a 1:1 chat with anyone, or create named groups. New conversations pop up for the other members in real time. |
| 🟢 **Presence & typing** | Online dots, "last seen" times and "Maya is typing…" indicators. |
| ✅ **Read receipts & unread badges** | ✓ sent, ✓✓ seen, "Seen by everyone" in groups, unread counters in the sidebar and the tab title. |
| ✏️ **Edit & delete** | Edit or delete your own messages (press ↑ in an empty box to edit your last one). |
| 🌗 **Light & dark mode** | Follows your OS by default, remembers your choice, and switches with a circular reveal animation. |
| 📱 **Responsive** | Feels at home on desktop and phones. |
| 🔐 **Secure by default** | BCrypt passwords, stateless JWT auth for REST *and* WebSocket, per-conversation authorization, locked-down STOMP destinations. |

<p align="center">
  <img src="docs/screenshots/02-chat-light.png" width="49%" alt="Light mode" />
  <img src="docs/screenshots/03-reactions-dark.png" width="49%" alt="Reactions" />
</p>

## 🧱 Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, `@stomp/stompjs`, lucide icons, hand-written CSS design system (glassmorphism, CSS variables for theming) |
| Backend | Java 17+, Spring Boot 3.5 (Web, WebSocket/STOMP, Security, Data JPA, Validation), JJWT |
| Database | H2 (zero-setup local file DB) · PostgreSQL in production (e.g. free Neon) |
| Hosting (free) | Frontend on **Vercel** · API on **Render** (Docker) · Postgres on **Neon** |

## 🗺️ Architecture

```mermaid
flowchart LR
    subgraph Browser
      UI["React SPA<br/>(Vercel)"]
    end
    subgraph API["Spring Boot API (Render)"]
      REST["REST controllers<br/>/api/**"]
      WS["STOMP broker<br/>/ws"]
      SVC["Services<br/>(auth, chat, presence)"]
    end
    DB[("PostgreSQL<br/>(Neon)")]

    UI -- "HTTPS + JWT<br/>login, history, send, react" --> REST
    UI <-- "WSS + JWT<br/>live events" --> WS
    REST --> SVC
    SVC --> DB
    SVC -- "publish after commit" --> WS
```

* **Writes go over REST** (validated, return proper HTTP errors); the service then **pushes events** to every member's private queue `/user/queue/events` after the transaction commits.
* **Ephemeral signals** (typing) go over the socket: `/app/conversations/{id}/typing`.
* **Presence** is broadcast on `/topic/presence`.

## 🚀 Quick start (local)

**Prerequisites:** JDK 17+ and Node.js 20.19+ (or 22+). No database needed.

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

Open <http://localhost:5173>, sign in as **alex** / **password123** (demo data) or create an account. To chat with yourself, open a second **private window** and sign in as **maya** / **password123**.

> Full step-by-step instructions, including free deployment to Vercel, are in **[SETUP_AND_DEPLOYMENT.md](SETUP_AND_DEPLOYMENT.md)**.

## 📁 Project structure

```
aurora-chat/
├── backend/                         Spring Boot API (Maven)
│   ├── src/main/java/com/aurora/chat/
│   │   ├── auth/                    register / login / me
│   │   ├── chat/                    conversations, messages, reactions, typing, event publisher
│   │   ├── user/                    users, presence tracking
│   │   ├── security/                JWT service, HTTP filter, STOMP auth interceptor
│   │   ├── config/                  security, WebSocket, DATABASE_URL parsing, demo data
│   │   ├── common/                  DTO mapper, errors, health endpoint
│   │   └── dto/                     request / response records
│   ├── src/test/java/...            REST flow, WebSocket and unit tests
│   └── Dockerfile
├── frontend/                        React + Vite SPA
│   ├── src/components/              UI (sidebar, chat window, bubbles, composer, pickers…)
│   ├── src/context/                 auth, theme, toasts, chat state (reducer + STOMP client)
│   ├── src/lib/                     API client, config, formatting, emoji data
│   └── vercel.json
├── docs/                            PDF guide + screenshots
├── render.yaml                      one-click Render blueprint for the API
├── docker-compose.yml               optional local Postgres + API
├── README.md                        ← you are here
└── SETUP_AND_DEPLOYMENT.md          setup & free hosting guide
```

## 🔌 API reference

All endpoints except register/login/health require `Authorization: Bearer <token>`. Errors look like `{"status":400,"error":"Bad Request","message":"…"}`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | `{username, displayName, password}` → `{token, user}` |
| `POST` | `/api/auth/login` | `{username, password}` → `{token, user}` |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/users?query=` | Search people (excludes you) |
| `GET` | `/api/conversations` | Your conversations with last message, unread count, read states |
| `POST` | `/api/conversations/direct` | `{userId}` → open (or create) a DM |
| `POST` | `/api/conversations/group` | `{name, memberIds[]}` → create a group |
| `GET` | `/api/conversations/{id}/messages?before=&limit=` | Page of messages (oldest → newest) |
| `POST` | `/api/conversations/{id}/messages` | `{content, replyToId?, clientId?}` → send |
| `POST` | `/api/conversations/{id}/read` | `{messageId}` → move your read marker |
| `PATCH` | `/api/messages/{id}` | `{content}` → edit your message |
| `DELETE` | `/api/messages/{id}` | Delete your message |
| `POST` | `/api/messages/{id}/reactions` | `{emoji}` → toggle your reaction |
| `GET` | `/api/health` | Liveness (public) |

### WebSocket (STOMP)

Connect to `ws(s)://<api-host>/ws` with the STOMP header `Authorization: Bearer <token>`.

| Direction | Destination | Payload |
|---|---|---|
| subscribe | `/user/queue/events` | `{type, conversationId, payload}` where type ∈ `MESSAGE_CREATED`, `MESSAGE_UPDATED`, `REACTIONS_UPDATED`, `CONVERSATION_UPSERTED`, `TYPING`, `READ` |
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
| `APP_DEMO_DATA_ENABLED` | `false` | Seed demo users/conversations into an **empty** database |
| `DB_POOL_SIZE` | `5` | Max DB connections |

**Frontend** (build-time, `frontend/.env.local` locally or Vercel → Environment Variables)

| Variable | Example | Purpose |
|---|---|---|
| `VITE_API_URL` | `https://aurora-chat-api.onrender.com` | Backend base URL (no trailing slash) |
| `VITE_WS_URL` | *(optional)* | Override the WebSocket URL (defaults to `VITE_API_URL` + `/ws`) |

## 🧪 Testing

```bash
cd backend && ./mvnw test          # REST flow, WebSocket delivery/typing/presence/auth, DATABASE_URL parser
cd frontend && npm run build       # strict TypeScript check + production build
```

The project was also verified end-to-end with two real browsers (sign-in, presence, typing, delivery, replies, jump-to-quote, reactions, edit, delete, read receipts, groups, new DMs, theme toggle, reload and server-restart reconnect).

## ☁️ Deploy for free

| Part | Where | Notes |
|---|---|---|
| React frontend | **Vercel** (Hobby) | Root directory `frontend`, set `VITE_API_URL` |
| Spring Boot API | **Render** (free web service, Docker) | `render.yaml` included; sleeps after ~15 min idle |
| PostgreSQL | **Neon** (free) | Paste the connection string into `DATABASE_URL` |

Vercel runs static sites and short-lived serverless functions, so it can't host a long-running Java server with WebSockets; that's why the API lives on Render. The whole stack still costs $0. See **[SETUP_AND_DEPLOYMENT.md](SETUP_AND_DEPLOYMENT.md)** for the click-by-click guide.

## 📸 More screenshots

<p align="center">
  <img src="docs/screenshots/01-auth-light.png" width="49%" alt="Sign in (light)" />
  <img src="docs/screenshots/05-new-group-dark.png" width="49%" alt="New group (dark)" />
</p>
<p align="center">
  <img src="docs/screenshots/06-mobile-list-dark.png" width="24%" alt="Mobile list (dark)" />
  <img src="docs/screenshots/07-mobile-chat-dark.png" width="24%" alt="Mobile chat (dark)" />
  <img src="docs/screenshots/06-mobile-list-light.png" width="24%" alt="Mobile list (light)" />
  <img src="docs/screenshots/07-mobile-chat-light.png" width="24%" alt="Mobile chat (light)" />
</p>

## 🛣️ Ideas for next steps

- Image & file attachments (e.g. Cloudinary / S3 free tiers)
- Push notifications (Web Push)
- Message search and pinned messages
- Group management (rename, add/remove members)
- Horizontal scaling with an external STOMP broker (RabbitMQ) and Redis-backed presence

## 📄 License

[MIT](LICENSE). Use it, learn from it, ship it.
