# Aurora Chat — Full Setup, Upgrade & Free Hosting Guide

Everything you need to run Aurora Chat for **$0**: a live, installable chat app with photo and video sharing, downloads and push notifications, which stays awake around the clock.

| Your situation | Follow |
|---|---|
| 🆕 **First time**: nothing deployed yet | **Part A**, steps 1–12 |
| 🔄 **Already running Aurora Chat** and want the new version **without losing data, in the same GitHub repo** | **[Part B — Upgrade](#part-b--upgrade-your-existing-app-keep-all-data-same-github-repo)** |
| 💤 Stop the free server from **falling asleep** | **[Part C — Keep the app awake](#part-c--keep-the-app-awake-automatic-every-10-minutes)** |

**Part A — New installation**

1. [How the free hosting fits together](#1-how-the-free-hosting-fits-together)
2. [Prerequisites](#2-prerequisites)
3. [Run it locally](#3-run-it-locally)
4. [Push the code to GitHub](#4-push-the-code-to-github)
5. [Create a free PostgreSQL database (Neon)](#5-create-a-free-postgresql-database-neon)
6. [Create free media storage (Cloudinary)](#6-create-free-media-storage-cloudinary)
7. [Deploy the Java backend (Render)](#7-deploy-the-java-backend-render)
8. [Deploy the React frontend (Vercel)](#8-deploy-the-react-frontend-vercel)
9. [Connect frontend and backend (CORS)](#9-connect-frontend-and-backend-cors)
10. [Test your live app, install it on your phone, turn on notifications](#10-test-your-live-app-install-it-on-your-phone-turn-on-notifications)
11. [Optional extras](#11-optional-extras)
12. [Troubleshooting](#12-troubleshooting)

**Part B — [Upgrade an existing installation](#part-b--upgrade-your-existing-app-keep-all-data-same-github-repo)** (keep data, same repo) · **Part C — [Keep the app awake](#part-c--keep-the-app-awake-automatic-every-10-minutes)**

Expect about **40 minutes** for a first deployment, and **15 minutes** for an upgrade.

---

## Part B — Upgrade your existing app (keep all data, same GitHub repo)

Follow this part if Aurora Chat is **already running** (your own GitHub repo connected to Render and Vercel). Don't follow Part A for this: you don't need a new repository, database, Render service or Vercel project. You update the code in your existing repo, and Render and Vercel redeploy it by themselves.

### B.1 What happens to your data

| Your data | After the upgrade |
|---|---|
| Accounts, passwords, chats, messages, replies, reactions, read receipts | **Kept exactly as they are.** The new version only *adds* things to the database (3 new tables and 1 new optional column). It never changes or deletes existing rows. |
| Who is signed in | Everyone stays signed in, as long as `APP_JWT_SECRET` on Render stays the same (don't change it). |
| Your Render / Vercel / Neon settings | Unchanged. New settings are optional, see B.5. |

This was tested on **PostgreSQL 17 (the same database as Neon)** and on the local H2 database. Data created with the old version was identical after upgrading, after rolling back to the old version, and after upgrading again.

> ⚠️ If your old deployment had **no `DATABASE_URL`** on Render, the data was in a temporary file that Render wipes on every restart, so there's nothing permanent to keep. Do Part A step 5 (Neon) now so data is kept from here on.

### B.2 Make a backup first (2 minutes, recommended)

**Neon (your live database).** Open <https://console.neon.tech> → your project → **Branches** → **Create branch**. Name it `backup-before-upgrade`, choose your main branch as the parent and **current point in time**, then click **Create**. This makes an instant copy of your whole database that the app doesn't use. If anything goes wrong you still have every row. You can delete the branch after a few days.

*(Alternative, if you have PostgreSQL tools installed: `pg_dump "<your DATABASE_URL>" > aurora-backup.sql`)*

**Local copy (if you also ran it on your computer).** Copy the folder `backend/data/` somewhere safe. It holds the local database and uploads.

### B.3 Put the new version into your GitHub repo

Pick **one** of the three ways below. All of them keep your repo's history, so you're adding one new commit.

#### Way 1 — automatic script (macOS, Linux, or Windows with Git Bash)

```bash
# 1. Get a fresh copy of YOUR repo (any empty folder works)
git clone https://github.com/<your-username>/<your-repo>.git my-aurora-repo

# 2. Unzip the new version next to it (creates the folder aurora-chat/), then:
cd aurora-chat
bash scripts/update-repo.sh ../my-aurora-repo
```

The script copies the new files into your repo and removes 5 old screenshots that are no longer used. It never touches your Git history, local data (`backend/data`), `.env` files or any file you added yourself. It shows a summary and asks **"Commit and push to GitHub now?"**. Answer `y` and you're done: Render and Vercel start redeploying.

> On Windows, use **Git Bash** (installed with [Git for Windows](https://git-scm.com/download/win)): right-click the `aurora-chat` folder → **Open Git Bash here**, then run the `bash scripts/update-repo.sh …` line.

#### Way 2 — GitHub Desktop (no command line)

1. Install [GitHub Desktop](https://desktop.github.com) and sign in.
2. **File → Clone repository** → choose your Aurora Chat repo → **Clone**.
3. **Repository → Show in Explorer/Finder** to open the cloned folder.
4. Delete everything in that folder **except the hidden `.git` folder**. A fresh clone contains no data, so this is safe.
   *(To see hidden files: Windows Explorer → View → Show → Hidden items; macOS Finder → `Cmd + Shift + .`)*
5. Unzip the new version and copy **everything inside** its `aurora-chat` folder into the cloned folder.
6. Back in GitHub Desktop you'll see the changes. Type the summary `Update Aurora Chat to v2.1` → **Commit to main** → **Push origin**.

#### Way 3 — plain Git commands

```bash
git clone https://github.com/<your-username>/<your-repo>.git my-aurora-repo
cd my-aurora-repo
git rm -r -q .                      # removes the old files from the working copy (history is kept)
cp -R ../aurora-chat/. .            # copy the new version in (unzip it next to the clone first)
git add -A
git commit -m "Update Aurora Chat to v2.1"
git push
```

> **Ways 2 and 3 replace every file in the repo.** If you committed files of your own (notes, images…), copy them back before committing, or use Way 1, which keeps them.
>
> **Did you change the code yourself?** The update overwrites Aurora Chat's files. Before pushing, run `git diff --cached` (or look at the changes in GitHub Desktop) and re-apply your edits.
>
> **Is your project inside a sub-folder of the repo** (for example `my-repo/aurora-chat/backend`)? Use that sub-folder everywhere above. Your Render "Root Directory" and Vercel "Root Directory" already point there.

### B.4 Watch the automatic redeploys (5–10 minutes)

- **Render** → your service → **Events**: a new deploy starts from your commit. In **Logs** you'll see `Media storage: …`, `Keep-alive: pinging https://….onrender.com/api/health every 10 min` and `Started AuroraChatApplication`.
- **Vercel** → your project → **Deployments**: the newest one becomes **Ready**.
- Open `https://<your-service>.onrender.com/api/health`. It should show `"version":"2.1.0"` and `"keepAlive":"on"`.

> Using a Render **Blueprint**? New settings in `render.yaml` aren't filled in automatically for an existing service. Add them in the dashboard (next step). Your existing values, including the generated `APP_JWT_SECRET`, stay as they are.

### B.5 Add the new settings on Render (Environment tab)

| Key | Needed? | Value |
|---|---|---|
| `CLOUDINARY_URL` | **Yes, before anyone shares photos or videos** | From Part A step 6 (`cloudinary://…`). Without it, photos are stored on Render's temporary disk and disappear after a restart. |
| `APP_PUSH_SUBJECT` | Recommended | `mailto:you@example.com` (contact address for push services) |
| `APP_KEEP_ALIVE_ENABLED` | No | Keep-alive is **on automatically** on Render. Set it to `false` only to turn it off. |

Leave `DATABASE_URL`, `APP_JWT_SECRET` and `APP_CORS_ALLOWED_ORIGINS` **exactly as they are**. Saving the new settings triggers one more short redeploy.

### B.6 Check that everything is there

1. Open your app (same Vercel address as before). You should still be signed in.
2. Your old chats and messages are all there. ⚙️ **Settings → About** shows **App v2.1.0** and **Server v2.1.0 · keep-awake on**.
3. Send a photo, turn on notifications (Part A step 10.3), and set up the second keep-awake layer (Part C).

### B.7 If something goes wrong: roll back

Your data is safe either way. The old version runs fine on the upgraded database (tested).

- **Fastest:** Render → service → **Events** → pick the previous successful deploy → **Rollback** (if your plan shows it). Vercel → **Deployments** → previous deployment → **⋯ → Instant Rollback**.
- **Always works:** undo the commit on GitHub, which redeploys the old code on both:
  ```bash
  cd my-aurora-repo && git revert --no-edit HEAD && git push
  ```
- **Data problem?** Neon → **Branches** → `backup-before-upgrade` → **Restore** (or point `DATABASE_URL` at the backup branch's connection string).

Photo messages sent with the new version show up as text-only in the old version, and come back with their photos when you upgrade again.

---

## Part C — Keep the app awake (automatic, every 10 minutes)

Render's free plan puts your backend to sleep after **15 minutes without visitors**. The next visitor then waits about a minute, and push notifications can't be sent while it sleeps. Aurora Chat prevents this with **two automatic layers**. Use both.

### C.1 Layer 1: built into the server (no setup on Render)

Every **10 minutes** the backend calls its own public address `https://<your-service>.onrender.com/api/health`. The request goes out to the internet and back in through Render, so Render sees a visitor and keeps the service running.

- On Render it switches on by itself, because Render tells the app its public address (`RENDER_EXTERNAL_URL`).
- On other hosts, set `APP_KEEP_ALIVE_URL` to your backend's public URL.
- Change the interval with `APP_KEEP_ALIVE_INTERVAL` (e.g. `14m`). Keep it under 15 minutes.
- Turn it off with `APP_KEEP_ALIVE_ENABLED=false`.

**Check it:** Render **Logs** show `Keep-alive: pinging … every 10 min`. Then open `/api/health` a few times over an hour: `"uptime"` keeps growing (e.g. `2h 15m`) instead of resetting. ⚙️ Settings → **About** shows the same.

### C.2 Layer 2: a scheduled GitHub event (also wakes it if it ever sleeps)

The repo includes `.github/workflows/keep-alive.yml`, a GitHub Actions **schedule** event that runs **every 10 minutes** and calls your backend's health address. Unlike layer 1, it can also wake the backend after a restart or a sleep.

1. GitHub → your repo → **Settings → Secrets and variables → Actions → Variables** tab → **New repository variable**.
2. Name: `BACKEND_URL` · Value: `https://<your-service>.onrender.com` → **Add variable**.
3. **Actions** tab → if asked, click **I understand my workflows, go ahead and enable them**.
4. Open **Keep backend awake** → **Run workflow** to test it now. The run summary shows `Backend answered: {"status":"UP",…}`.

From then on it runs by itself. Good to know:
- GitHub starts scheduled runs on a best-effort basis: they can be a few minutes late. Layer 1 covers the gaps.
- **Public repo:** free and unlimited. GitHub pauses schedules after **60 days with no commits**: you'll get an email, and one click (Actions → Keep backend awake → **Enable workflow**) restarts it.
- **Private repo:** Actions minutes are limited (2,000 per month on the free plan), and this schedule would use about 4,300. So the job **skips itself in private repos** and layer 1 still keeps the app awake. To force it on anyway, add a variable `KEEP_ALIVE_IN_PRIVATE_REPO` = `true`.

### C.3 Optional layer 3: an external monitor

[cron-job.org](https://cron-job.org) (free) → **Create cronjob** → URL `https://<your-service>.onrender.com/api/health` → every **10 minutes** → Save. [UptimeRobot](https://uptimerobot.com) (free, 5-minute checks) also works and emails you if the app goes down.

### C.4 Limits to know

- Render's free plan includes **750 instance hours per month**. One service running all month uses about 744, so **keep only one free service awake**. Otherwise they run out before the month ends and Render stops them until the next month.
- The health check **doesn't use the database**, so Neon can still sleep when nobody is chatting (saving its free compute hours). Neon wakes up in well under a second when someone sends a message.

---

# Part A — New installation


## 1. How the free hosting fits together

```
   Phone / browser ──HTTPS──▶ Vercel  (React PWA: static files + service worker)
        │
        ├──HTTPS (REST) ─▶ Render  (Spring Boot API, Docker) ──▶ Neon (PostgreSQL)
        ├──WSS (live chat)▶ Render                           └─▶ Cloudinary (photos & videos)
        └──◀── push notifications ── browser push service (Google / Mozilla / Apple / Microsoft) ◀── Render
```

| Piece | Service | Free plan highlights* |
|---|---|---|
| React frontend (PWA) | **Vercel** – Hobby | Global CDN, HTTPS, auto-deploy on every `git push` |
| Java API + WebSockets + push | **Render** – Free web service | Docker, HTTPS, auto-deploy; sleeps after ~15 min idle, wakes in ~1 min |
| Database | **Neon** – Free | Serverless Postgres, data persists |
| Photos & videos | **Cloudinary** – Free | No credit card, monthly credits for storage + bandwidth, global CDN |
| Push notifications | Built into browsers | Free; the server signs messages with its own VAPID keys (no Firebase account needed) |

\*Free-tier limits change from time to time, so check each provider's pricing page.

> **Why isn't the backend on Vercel too?** Vercel serves static sites and short-lived serverless functions. It doesn't run Java, and those functions can't hold the WebSocket connections real-time chat needs. So the React app goes on Vercel and the Spring Boot API on Render.
>
> **Why Cloudinary?** Render's free disk is temporary: files are wiped whenever the server restarts, which happens every time it wakes from sleep. Cloudinary keeps photos and videos permanently and serves them fast from a CDN.

---

## 2. Prerequisites

**Accounts** (sign up with GitHub or Google to save time):
- [GitHub](https://github.com)
- [Vercel](https://vercel.com/signup)
- [Render](https://dashboard.render.com/register)
- [Neon](https://console.neon.tech/signup)
- [Cloudinary](https://cloudinary.com/users/register_free)

**Tools** (for running locally):

| Tool | Version | Check with |
|---|---|---|
| Java JDK | 17 or newer (21 recommended), e.g. [Temurin](https://adoptium.net) | `java -version` |
| Node.js | 20.19+ or 22+ ([nodejs.org](https://nodejs.org)) | `node -v` |
| Git | any recent | `git --version` |

You don't need Maven (the project includes `./mvnw`), a database (H2 is built in) or a Cloudinary account to run locally (media is saved to disk).

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

The first run downloads dependencies (a few minutes). It's ready when you see `Started AuroraChatApplication`. Check <http://localhost:8080/api/health>, which should show `{"status":"UP",…}`.

> Local data lives in `backend/data/` (database + `uploads/` for photos and videos). Delete the folder to start fresh. Demo data is only added when the database is empty.

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
- Open a **private/incognito window** and sign in as **maya** / **password123**, then chat between the two windows.
- **Photos & videos:** click 🖼️ in the message box, paste an image, or drag files onto the chat. Click a photo to open the full-screen viewer.
- **Notifications:** open ⚙️ Settings (bottom-left) → turn on **Push notifications**, then **Send a test notification**. Browsers allow this on `http://localhost`. On other addresses you need HTTPS.
- **Phone layout:** open your browser's device toolbar (F12 → 📱) to see the mobile UI: long-press a message, swipe it right to reply, double-tap to ❤️.

> To try it on your real phone on the same Wi-Fi, use the deployed version (step 7 onward). Phones only allow notifications and installing on HTTPS sites.

### 3.5 Run the tests (optional)

```bash
cd backend && ./mvnw test        # 22 tests: chat, WebSocket, media, push, Cloudinary
cd frontend && npm run build     # strict TypeScript check + production build
```

### 3.6 Production-like run with PostgreSQL (optional, needs Docker)

```bash
docker compose up --build        # Postgres + API on http://localhost:8080
```
Then run the frontend as in step 3.3.

---

## 4. Push the code to GitHub

> Already have an Aurora Chat repo on GitHub? Don't create a new one: follow **[Part B](#part-b--upgrade-your-existing-app-keep-all-data-same-github-repo)** to update it.

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

---

## 5. Create a free PostgreSQL database (Neon)

1. Go to <https://console.neon.tech> and click **New Project**.
2. Name it `aurora-chat` and pick a **region close to where you'll run the API**:
   - Render **Singapore** → Neon **AWS Asia Pacific (Singapore)** (good for India/Asia)
   - Render **Oregon** → Neon **AWS US West (Oregon)**
   - Render **Frankfurt** → Neon **AWS Europe (Frankfurt)**
3. Click **Create**, then **Connect**, and copy the **connection string**:

   ```
   postgresql://neondb_owner:AbC123xyz@ep-cool-sky-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

Paste it as-is later. The backend converts it to JDBC automatically and creates the tables on first start.

> 🔒 Treat connection strings and API secrets like passwords. Never commit them to Git.

---

## 6. Create free media storage (Cloudinary)

1. Sign up at <https://cloudinary.com/users/register_free> (no credit card).
2. Open the **Dashboard** (or **Settings → API Keys**).
3. Copy the **API environment variable**. It looks like:

   ```
   CLOUDINARY_URL=cloudinary://123456789012345:AbCdEfGhIjKlMnOpQrStUvWxYz0@your-cloud-name
   ```

   You'll paste the part after `CLOUDINARY_URL=` into Render in the next step. Pasting the whole line also works.

That's all: the backend uploads files into an `aurora-chat` folder in your Cloudinary media library. When someone deletes a message, its files are deleted from Cloudinary too.

---

## 7. Deploy the Java backend (Render)

Use the included **Blueprint** (fastest) or create the service manually.

### Option A — Blueprint (uses `render.yaml`)

1. Render dashboard → **New +** → **Blueprint**.
2. Connect GitHub if asked, then select the `aurora-chat` repository.
3. Render reads `render.yaml` and shows the `aurora-chat-api` service. Fill in:
   - `DATABASE_URL` → your Neon connection string
   - `CLOUDINARY_URL` → your Cloudinary URL (`cloudinary://…`)
   - `APP_CORS_ALLOWED_ORIGINS` → `https://*.vercel.app` for now (tightened in step 9)
   - `APP_PUSH_SUBJECT` → `mailto:` followed by your email, e.g. `mailto:you@example.com`
4. Click **Apply**. `APP_JWT_SECRET` is generated for you.

### Option B — Manual web service

1. Render dashboard → **New +** → **Web Service** → select the `aurora-chat` repository.
2. Settings:

   | Field | Value |
   |---|---|
   | Name | `aurora-chat-api` (becomes part of your URL) |
   | Region | same region as your Neon database |
   | Branch | `main` |
   | Root Directory | `backend` |
   | Language / Runtime | **Docker** (auto-detected from `backend/Dockerfile`) |
   | Instance Type | **Free** |

3. **Environment Variables** → add:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | your Neon connection string |
   | `CLOUDINARY_URL` | your Cloudinary URL |
   | `APP_JWT_SECRET` | click **Generate** (or any long random string) |
   | `APP_CORS_ALLOWED_ORIGINS` | `https://*.vercel.app` (tightened in step 9) |
   | `APP_PUSH_SUBJECT` | `mailto:you@example.com` |

4. **Advanced** → **Health Check Path** → `/api/health`.
5. Click **Create Web Service**.

### Wait for the first deploy
The first Docker build takes about **5–10 minutes**. In the **Logs** tab you should see `Media storage: Cloudinary (cloud '…')` and `Started AuroraChatApplication`, and the service should show **Live**.

Copy your URL (e.g. `https://aurora-chat-api.onrender.com`) and open `…/api/health`. It should show `{"status":"UP",…}`. 🎉

> 🔑 **Push keys are automatic.** On first start the server generates its VAPID key pair and stores it in the database, so it survives restarts and redeploys. You don't need a Firebase account.
>
> 💤 On the free plan the service sleeps after ~15 minutes without traffic. The next visit wakes it in about a minute, and the app shows a "Waking up the server…" banner meanwhile. Push notifications are sent by the server, so a sleeping server sends nothing until someone opens the app (see step 11 to keep it awake).

---

## 8. Deploy the React frontend (Vercel)

1. Go to <https://vercel.com/new> and **import** your `aurora-chat` repository.
2. Configure the project:

   | Field | Value |
   |---|---|
   | Project Name | `aurora-chat` (your site becomes `aurora-chat.vercel.app` if available) |
   | Framework Preset | **Vite** (auto-detected) |
   | **Root Directory** | click **Edit** → choose **`frontend`** ⚠️ important |
   | Build Command / Output | `npm run build` / `dist` (defaults; also in `vercel.json`) |

3. **Environment Variables** → add `VITE_API_URL` = your Render URL, e.g. `https://aurora-chat-api.onrender.com` (**no trailing slash**).
4. Click **Deploy**. After about a minute you get a URL like `https://aurora-chat.vercel.app`.

`vercel.json` already sets the right caching for the service worker (`sw.js`) and the web app manifest, so installs and updates work.

> `VITE_*` variables are baked in at **build time**. If you change `VITE_API_URL`, redeploy: **Deployments** → ⋯ → **Redeploy**.

---

## 9. Connect frontend and backend (CORS)

1. Copy your Vercel production URL, e.g. `https://aurora-chat.vercel.app`.
2. Render → `aurora-chat-api` → **Environment** → edit `APP_CORS_ALLOWED_ORIGINS`:

   ```
   https://aurora-chat.vercel.app
   ```

   To also allow preview deployments and a custom domain, separate them with commas:

   ```
   https://aurora-chat.vercel.app,https://aurora-chat-*.vercel.app,https://chat.yourdomain.com
   ```

3. **Save Changes**. Render redeploys in a minute or two.

Rules: include `https://`, no trailing slash, no paths. The same list covers REST, file uploads and the WebSocket.

---

## 10. Test your live app, install it on your phone, turn on notifications

### 10.1 Chat
1. Open your Vercel URL. If the API was asleep you'll see "Waking up the server…" for up to a minute.
2. **Create an account**, then create a second one in a private window or on another device.
3. **New conversation** → pick the other user → chat. Try a photo, a video, a reply, a reaction and dark mode.

### 10.2 Download photos and videos you receive

| Where | How |
|---|---|
| **Computer** | Hover over a photo or video → click the **⬇ download** button in its corner. For a whole album: **⋯ → Download all**. Files go to your *Downloads* folder as `aurora-<date>-<time>-xxxx.jpg`. |
| **Phone** | **Long-press** the message → **Save photo** / **Save video** / **Save all**. The share sheet opens: choose **Save Image** / **Save Video** (iPhone → Photos) or **Save** / **Download** (Android). |
| **Full-screen viewer** | Tap a photo → **⬇** (download) or **Share** (save to Photos, send to other apps). |

### 10.3 Install as an app

| Device | How |
|---|---|
| **Android** (Chrome/Edge/Samsung Internet) | Menu ⋮ → **Install app** / **Add to Home screen**, or ⚙️ Settings → **Install Aurora** |
| **iPhone / iPad** (Safari, iOS 16.4+) | Share button → **Add to Home Screen** → **Add** |
| **Desktop** (Chrome/Edge) | Install icon in the address bar, or ⚙️ Settings → **Install Aurora** |

The installed app opens full-screen with its own icon, shows an unread badge on the icon, and loads even with a weak connection.

### 10.4 Turn on notifications
1. In the app, open ⚙️ **Settings** → switch on **Push notifications** → allow when the browser asks.
   - **iPhone/iPad:** this only works in the app opened **from the Home Screen** (an Apple requirement). Safari tabs don't offer it.
2. Tap **Send a test notification**. You should see "Notifications are working 🎉".
3. Close the app, then send yourself a message from your other account: a notification appears, and tapping it opens that chat.
4. To silence one chat: open it → tap the name at the top → **Mute notifications**.

Each device needs its own opt-in. Signing out stops notifications on that device.

---

## 11. Optional extras

### Demo content in production
Set `APP_DEMO_DATA_ENABLED=true` on Render **before the first start against an empty database** to get the demo users. ⚠️ Anyone can sign in to them with `password123`, so turn it off again for a real community.

### Keep the app awake
Built in and automatic on Render, plus a scheduled GitHub event every 10 minutes: see **[Part C](#part-c--keep-the-app-awake-automatic-every-10-minutes)**.

### Your own VAPID keys (optional)
The server generates and stores VAPID keys automatically. If you'd rather manage them yourself, run `npx web-push generate-vapid-keys` and set `APP_PUSH_VAPID_PUBLIC_KEY` and `APP_PUSH_VAPID_PRIVATE_KEY` on Render. Changing keys later means every device has to turn notifications off and on again.

### Upload limits
Photos up to 10 MB and videos up to 50 MB by default (`APP_MEDIA_MAX_IMAGE_MB`, `APP_MEDIA_MAX_VIDEO_MB`). Photos are resized and compressed on the device first, so most uploads are much smaller. Cloudinary's free plan also caps the file size per upload, so keep videos short.

### Custom domain
- Frontend: Vercel → Project → **Settings → Domains** → add `chat.yourdomain.com` and follow the DNS steps.
- Add the new origin to `APP_CORS_ALLOWED_ORIGINS` on Render.

### Automatic deploys
Vercel and Render redeploy on every push to `main`. GitHub Actions run `.github/workflows/ci.yml` (builds and tests both apps on each push and pull request) and `.github/workflows/keep-alive.yml` (the 10-minute keep-awake event from Part C).

### Other free backend hosts
`backend/Dockerfile` also runs on [Koyeb](https://www.koyeb.com), [Google Cloud Run](https://cloud.google.com/run) (free tier, billing account required) or an [Oracle Cloud Always Free](https://www.oracle.com/cloud/free/) VM. Set the same environment variables. If the host has a **persistent** disk, you can skip Cloudinary (`APP_MEDIA_STORAGE=local`, `APP_MEDIA_DIR=/path/on/disk`).

---

## 12. Troubleshooting

| Symptom | Cause & fix |
|---|---|
| Red banner **"Backend URL not configured"** | `VITE_API_URL` wasn't set when Vercel built the site. Add it and **redeploy**. |
| **"Waking up the server…"** never goes away | Open the API's `/api/health` directly. If it fails, check Render **Logs**: usually a typo in `DATABASE_URL`/`CLOUDINARY_URL` or a failed build. |
| Browser console: **CORS error** | `APP_CORS_ALLOWED_ORIGINS` doesn't exactly match your site (`https://your-app.vercel.app`, no trailing slash). Save and wait for the redeploy. |
| Sidebar stuck on **"Connecting…"** | The WebSocket can't connect: same CORS list, the API URL must be `https://` (it becomes `wss://`), and the API must be awake. |
| **Photos/videos disappear** after a while | `CLOUDINARY_URL` isn't set, so files went to Render's temporary disk. Render logs warn about this at startup. Set it (step 6) and re-share. |
| **"Media unavailable"** placeholders | Same as above (files lost), or the files were deleted from Cloudinary. |
| Upload says **"too large"** | Over the limit (10 MB photo / 50 MB video by default) or Cloudinary's free per-file cap. Trim the video or raise the limits. |
| **HEIC photos** rejected | Most browsers can't show HEIC. iPhones convert automatically when you pick from the photo library. Otherwise share as JPEG ("Most Compatible" camera setting). |
| A video **won't play** | Some codecs (e.g. HEVC from some phones) don't play in every browser. Re-record in "Most Compatible" mode or convert to H.264 MP4. |
| **Notifications switch is greyed out** | *Unsupported*: use Chrome, Edge, Firefox or Safari 16+. *Blocked*: allow notifications for the site in browser/OS settings. *iPhone*: open the app from the Home Screen. |
| **No notifications arrive** | Check: Settings → **Send a test notification**; the chat isn't muted; your phone isn't in Do Not Disturb/Focus mode; the Render service is awake. If the server's VAPID keys changed, turn notifications off and on again. |
| Notifications show while I'm in the app | They shouldn't: an open, focused app shows in-app banners instead. Check that the page is actually focused (not a background tab). |
| **Old chats missing after upgrading** | `DATABASE_URL` on Render must be the **same** Neon connection string as before. Don't create a new database. Check Render → Environment, fix it and redeploy; the data is still in Neon (and in your backup branch). |
| Everyone was **signed out after upgrading** | `APP_JWT_SECRET` changed. Data is fine: sign in again. To avoid it, keep the old value. |
| `update-repo.sh`: "uncommitted changes" | Your clone has local edits. Commit or discard them (`git stash`), or use a fresh `git clone`. |
| GitHub Desktop shows **thousands of changes** | You copied `node_modules` or `target`. Delete those folders, as they're ignored and regenerated automatically. |
| Server **still falls asleep** | Check `/api/health` → `"keepAlive":"on"`. In Render Logs, look for `Keep-alive: pinging …`. Set up Part C layer 2 or 3 as well. If Render suspended the service for the month, the free hours ran out (C.4). |
| **Keep backend awake** workflow never runs | Set the `BACKEND_URL` variable, enable workflows in the **Actions** tab, and make sure the file is on the default branch. In private repos it skips itself by design (C.2). |
| **Download** does nothing on iPhone | Use long-press → **Save photo**, then **Save Image** in the share sheet. In Safari tabs downloads go to the **Files** app → *Downloads*. |
| Downloads open the photo instead of saving | Old browser: right-click/long-press the opened photo → *Save image*. |
| Signed out after a redeploy | `APP_JWT_SECRET` changed or the database was reset. Sign in again and keep the secret stable. |
| All data disappears after each deploy | `DATABASE_URL` isn't set, so the API used the temporary H2 file. Set the Neon URL (step 5). |
| Render logs: `password authentication failed` / SSL errors | Re-copy the Neon string. URL-encode special characters in passwords (`@` → `%40`) and keep `sslmode=require`. |
| Vercel build fails | **Root Directory** must be `frontend`. Run `npm run build` locally to see the same error. |
| Port 8080 or 5173 already in use (local) | Stop the other process, or run the backend with `PORT=8081` and set `VITE_API_URL=http://localhost:8081` in `frontend/.env.local`. |
