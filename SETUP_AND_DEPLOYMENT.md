# Aurora Chat — Setup & Free Hosting Guide

This guide takes you from the downloaded source code to a live app on the internet, **for $0**:

1. [How the free hosting fits together](#1-how-the-free-hosting-fits-together)
2. [Prerequisites](#2-prerequisites)
3. [Run it locally](#3-run-it-locally)
4. [Push the code to GitHub](#4-push-the-code-to-github)
5. [Create a free PostgreSQL database (Neon)](#5-create-a-free-postgresql-database-neon)
6. [Deploy the Java backend (Render)](#6-deploy-the-java-backend-render)
7. [Deploy the React frontend (Vercel)](#7-deploy-the-react-frontend-vercel)
8. [Connect frontend and backend (CORS)](#8-connect-frontend-and-backend-cors)
9. [Test your live app](#9-test-your-live-app)
10. [Optional extras](#10-optional-extras)
11. [Troubleshooting](#11-troubleshooting)

Expect about **30–40 minutes** for a first deployment.

---

## 1. How the free hosting fits together

```
   Browser ──HTTPS──▶  Vercel  (React frontend, static files)
      │
      ├──HTTPS (REST) ──▶  Render  (Spring Boot API, Docker)  ──▶  Neon (PostgreSQL)
      └──WSS (live chat)─▶  Render
```

| Piece | Service | Free plan highlights* |
|---|---|---|
| React frontend | **Vercel** – Hobby | Global CDN, HTTPS, auto-deploy on every `git push` |
| Java API + WebSockets | **Render** – Free web service | Docker support, HTTPS, auto-deploy; sleeps after ~15 min without traffic, wakes in ~1 min |
| Database | **Neon** – Free | Serverless Postgres, data persists, scales to zero when idle |

\*Free-tier limits change from time to time, so check each provider's pricing page.

> **Why isn't the backend on Vercel too?** Vercel serves static sites and short-lived serverless functions (Node.js, Python, Go, Ruby…). It doesn't run Java, and serverless functions can't keep the WebSocket connections that real-time chat needs. So the React app goes on Vercel, where it's fast and free, and the Spring Boot API goes on Render, which runs Docker containers for free. The frontend just needs to know the API's URL (`VITE_API_URL`).

---

## 2. Prerequisites

**Accounts** (sign up with GitHub to save time):
- [GitHub](https://github.com)
- [Vercel](https://vercel.com/signup)
- [Render](https://dashboard.render.com/register)
- [Neon](https://console.neon.tech/signup)

**Tools** (for running locally):

| Tool | Version | Check with |
|---|---|---|
| Java JDK | 17 or newer (21 recommended), e.g. [Temurin](https://adoptium.net) | `java -version` |
| Node.js | 20.19+ or 22+ ([nodejs.org](https://nodejs.org)) | `node -v` |
| Git | any recent | `git --version` |

You don't need to install Maven: the project includes the Maven Wrapper (`./mvnw`). You don't need a database either, because locally the API uses an embedded H2 database.

---

## 3. Run it locally

### 3.1 Get the code
Unzip the project (or clone your repository) and open a terminal in the `aurora-chat` folder.

### 3.2 Start the backend (port 8080)

```bash
cd backend
# macOS / Linux — APP_DEMO_DATA_ENABLED seeds demo users the first time
APP_DEMO_DATA_ENABLED=true ./mvnw spring-boot:run
```

Windows PowerShell:
```powershell
cd backend
$env:APP_DEMO_DATA_ENABLED="true"; .\mvnw.cmd spring-boot:run
```

Windows Command Prompt:
```cmd
cd backend
set "APP_DEMO_DATA_ENABLED=true" && mvnw.cmd spring-boot:run
```

The first run downloads dependencies (a few minutes). The backend is ready when you see `Started AuroraChatApplication`. Check <http://localhost:8080/api/health>; it should show `{"status":"UP",…}`.

> Local data lives in `backend/data/`. Delete that folder to start fresh. Demo data is only added when the database is empty.

### 3.3 Start the frontend (port 5173)

Open a **second terminal**:

```bash
cd frontend
cp .env.example .env.local        # Windows: copy .env.example .env.local
npm install
npm run dev
```

Open <http://localhost:5173>.

### 3.4 Try it
- Sign in as **alex** / **password123**, or create your own account.
- Open a **private/incognito window**, sign in as **maya** / **password123**, and chat between the two windows. You'll see typing indicators, instant delivery, replies, reactions and read receipts.
- Toggle light/dark mode with the ☀️/🌙 switch.

### 3.5 Run the tests (optional)

```bash
cd backend && ./mvnw test        # 10 tests: REST flow, WebSocket events, URL parsing
cd frontend && npm run build     # strict TypeScript check + production build
```

### 3.6 Production-like run with PostgreSQL (optional, needs Docker)

```bash
docker compose up --build        # Postgres + API on http://localhost:8080
```
Then run the frontend as in step 3.3.

---

## 4. Push the code to GitHub

1. On GitHub click **New repository**, name it `aurora-chat`, and leave it **empty** (no README, .gitignore or license, because the project already has them).
2. In the project folder:

```bash
git init
git add .
git commit -m "Aurora Chat: Spring Boot + React real-time chat"
git branch -M main
git remote add origin https://github.com/<your-username>/aurora-chat.git
git push -u origin main
```

The included `.gitignore` keeps `node_modules`, build output and local databases out of the repo.

---

## 5. Create a free PostgreSQL database (Neon)

Render's disk is temporary (it's wiped on every deploy/restart), so production data must live in a real database.

1. Go to <https://console.neon.tech> and click **New Project**.
2. Name it `aurora-chat` and pick a **region close to where you'll run the API**:
   - Render **Singapore** → Neon **AWS Asia Pacific (Singapore)** (good for India/Asia)
   - Render **Oregon** → Neon **AWS US West (Oregon)**
   - Render **Frankfurt** → Neon **AWS Europe (Frankfurt)**
3. Click **Create**. On the project dashboard click **Connect** and copy the **connection string**. It looks like:

   ```
   postgresql://neondb_owner:AbC123xyz@ep-cool-sky-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

Keep it handy for the next step. You can paste it as-is: the backend converts this format to JDBC automatically, and tables are created on first start.

> 🔒 Treat the connection string like a password. Never commit it to Git.

---

## 6. Deploy the Java backend (Render)

You can use the included **Blueprint** (fastest) or create the service manually. Pick one.

### Option A — Blueprint (uses `render.yaml`)

1. Render dashboard → **New +** → **Blueprint**.
2. Connect your GitHub account if asked, then select the `aurora-chat` repository.
3. Render reads `render.yaml` and shows the `aurora-chat-api` service. Fill in:
   - `DATABASE_URL` → your Neon connection string
   - `APP_CORS_ALLOWED_ORIGINS` → `https://*.vercel.app` for now (you'll tighten this in step 8)
4. Click **Apply**. `APP_JWT_SECRET` is generated for you.

### Option B — Manual web service

1. Render dashboard → **New +** → **Web Service** → select the `aurora-chat` repository.
2. Settings:

   | Field | Value |
   |---|---|
   | Name | `aurora-chat-api` (this becomes part of your URL) |
   | Region | same region as your Neon database |
   | Branch | `main` |
   | Root Directory | `backend` |
   | Language / Runtime | **Docker** (auto-detected from `backend/Dockerfile`) |
   | Instance Type | **Free** |

3. **Environment Variables** → add:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | your Neon connection string |
   | `APP_JWT_SECRET` | click **Generate** (or paste any long random string) |
   | `APP_CORS_ALLOWED_ORIGINS` | `https://*.vercel.app` (tightened in step 8) |

4. **Advanced** → **Health Check Path** → `/api/health`.
5. Click **Create Web Service**.

### Wait for the first deploy
The first Docker build takes about **5–10 minutes**. Watch the **Logs** tab until you see `Started AuroraChatApplication` and the service shows **Live**.

Copy your URL from the top of the page, e.g. `https://aurora-chat-api.onrender.com`, and open `https://aurora-chat-api.onrender.com/api/health` in your browser. You should see `{"status":"UP",…}`. 🎉

> 💤 On the free plan the service sleeps after ~15 minutes without traffic. The next request wakes it in about a minute, and the frontend shows a friendly "Waking up the server…" banner while that happens.

---

## 7. Deploy the React frontend (Vercel)

1. Go to <https://vercel.com/new> and **import** your `aurora-chat` GitHub repository.
2. Configure the project:

   | Field | Value |
   |---|---|
   | Project Name | `aurora-chat` (your site becomes `aurora-chat.vercel.app` if available) |
   | Framework Preset | **Vite** (auto-detected) |
   | **Root Directory** | click **Edit** → choose **`frontend`** ⚠️ important |
   | Build Command | `npm run build` (default, also set in `vercel.json`) |
   | Output Directory | `dist` (default) |

3. Open **Environment Variables** and add:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | your Render URL, e.g. `https://aurora-chat-api.onrender.com` (**no trailing slash**) |

4. Click **Deploy**. After about a minute you get a URL like `https://aurora-chat.vercel.app`.

> `VITE_*` variables are baked in at **build time**. If you change `VITE_API_URL` later, redeploy: **Deployments** → ⋯ → **Redeploy**.

---

## 8. Connect frontend and backend (CORS)

Browsers only let your site call the API if the API allows your site's **origin**.

1. Copy your Vercel production URL, e.g. `https://aurora-chat.vercel.app`.
2. Render → `aurora-chat-api` → **Environment** → edit `APP_CORS_ALLOWED_ORIGINS`:

   ```
   https://aurora-chat.vercel.app
   ```

   To also allow Vercel preview deployments and a custom domain, use a comma-separated list:

   ```
   https://aurora-chat.vercel.app,https://aurora-chat-*.vercel.app,https://chat.yourdomain.com
   ```

3. **Save Changes**. Render redeploys automatically in a minute or two.

Rules: include `https://`, no trailing slash, no paths. The same list protects both the REST API and the WebSocket handshake.

---

## 9. Test your live app

1. Open your Vercel URL. If the API was asleep you'll see "Waking up the server…" for up to a minute.
2. **Create an account** (username + display name + password).
3. Open a private window (or use your phone), create a second account, and start a chat with **New conversation** → pick the other user.
4. Try everything: typing indicator, replies (hover a message → ↩), reactions (hover → 😊+, or double-click a message for ❤️), edit/delete, a group chat and dark mode.

Share the URL with friends and they can sign up and chat with you right away.

---

## 10. Optional extras

### Demo content in production
Set `APP_DEMO_DATA_ENABLED=true` on Render **before the first start against an empty database** to get the demo users. ⚠️ Everyone can sign in to those accounts with `password123`, so turn it back off and don't use it for a real community.

### Keep the API awake
Free services sleep when idle. If you want instant responses, ping `https://<your-api>.onrender.com/api/health` every 10–14 minutes with a free monitor such as [UptimeRobot](https://uptimerobot.com) or [cron-job.org](https://cron-job.org). Keep in mind this uses your free instance hours (one always-on free service fits within Render's monthly free hours at the time of writing).

### Custom domain
- Frontend: Vercel → Project → **Settings → Domains** → add `chat.yourdomain.com` and follow the DNS instructions.
- Add the new origin to `APP_CORS_ALLOWED_ORIGINS` on Render.
- Optional: a custom domain for the API (Render → **Settings → Custom Domains**), then update `VITE_API_URL` on Vercel and redeploy.

### Automatic deploys
Both Vercel and Render redeploy on every push to `main`. GitHub Actions (`.github/workflows/ci.yml`) builds and tests both apps on every push and pull request.

### Other free backend hosts
The backend is a standard Docker image (`backend/Dockerfile`), so it also runs on [Koyeb](https://www.koyeb.com), [Google Cloud Run](https://cloud.google.com/run) (free tier, needs billing enabled) or an [Oracle Cloud Always Free](https://www.oracle.com/cloud/free/) VM. Set the same environment variables (`DATABASE_URL`, `APP_JWT_SECRET`, `APP_CORS_ALLOWED_ORIGINS`) and make sure the host supports WebSockets.

---

## 11. Troubleshooting

| Symptom | Cause & fix |
|---|---|
| Red banner **"Backend URL not configured"** | `VITE_API_URL` wasn't set when Vercel built the site. Add it (Project → Settings → Environment Variables) and **redeploy**. |
| **"Waking up the server…"** never goes away | Open the API's `/api/health` directly. If it doesn't load, check the Render **Logs**: usually a typo in `DATABASE_URL` or the build failed. |
| Browser console: **CORS error** / `No 'Access-Control-Allow-Origin'` | `APP_CORS_ALLOWED_ORIGINS` doesn't match your site exactly. Use `https://your-app.vercel.app` (no trailing slash), save, and wait for the redeploy. |
| Sidebar stuck on **"Connecting…"** | The WebSocket can't connect. It uses the same CORS list, and the API URL must be `https://` (it becomes `wss://`). Also check that the API is awake. |
| Signed out after a redeploy | `APP_JWT_SECRET` changed or the database was reset. Sign in again. Keep the secret stable. |
| All data disappears after each deploy | `DATABASE_URL` isn't set, so the API fell back to the temporary H2 file. Set the Neon URL (step 6). |
| Render logs: `password authentication failed` / SSL errors | Re-copy the Neon connection string. Special characters in a password must be URL-encoded (e.g. `@` → `%40`). Keep `sslmode=require`. |
| Render build fails | Check that Root Directory is `backend` (manual setup) or that `render.yaml` is at the repo root (Blueprint). Look for the first `ERROR` line in the build logs. |
| Vercel build fails with `tsc` errors | Make sure **Root Directory** is `frontend`, then run `npm run build` locally to see the same error. |
| Login says **"Invalid username or password"** | Usernames are case-insensitive; passwords are not. Demo accounts only exist if demo data was enabled on an empty database. |
| Port 8080 or 5173 already in use (local) | Stop the other process, or run the backend with `PORT=8081` and set `VITE_API_URL=http://localhost:8081` in `frontend/.env.local`. |

---

**That's it, your chat app is live.** 🚀 For code structure, API and WebSocket reference, see [README.md](README.md).
