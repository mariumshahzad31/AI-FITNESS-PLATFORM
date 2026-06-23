# Deployment Guide — AI Fitness Platform (100% free)

This guide deploys the full stack on free tiers and gives you a public live URL with a
persistent database. Total cost: **$0**.

## The free stack

| Component            | Host                       | Free tier notes                                        |
|----------------------|----------------------------|--------------------------------------------------------|
| PostgreSQL           | **Neon** (neon.tech)       | Serverless Postgres, **persistent** (no expiry), ~0.5 GB |
| AI service (FastAPI) | **Render** web service     | Free; sleeps after ~15 min idle (cold start ~30–50 s)  |
| Backend (Express)    | **Render** web service     | Free; same sleep behaviour                             |
| Frontend (Next.js)   | **Vercel**                 | Free Hobby plan, always-on, custom domain              |

> **Cold start caveat:** Render free services sleep when idle. The first request after a
> nap takes ~30–50 s to wake the backend/AI service. Neon and Vercel do not sleep. For a
> portfolio this is fine. To avoid it, ping the backend `/health` every ~10 min with a free
> uptime monitor (e.g. UptimeRobot).

## Prerequisites

1. A **GitHub repo** containing this project (all three hosts deploy from GitHub).
   If it isn't on GitHub yet:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<you>/AI-FITNESS-PLATFORM.git
   git push -u origin main
   ```
2. Node 20+ and a terminal locally (only needed once, to load the database schema).

---

## Step 1 — Database (Neon)

1. Sign up at <https://neon.tech> → **Create project** (any region close to you).
2. Copy the **connection string**. It looks like:
   ```
   postgresql://<user>:<password>@<host>.neon.tech/<db>?sslmode=require
   ```
   Keep the `?sslmode=require` — the backend passes the string straight to `pg`, and Neon
   requires SSL.
3. **Load the schema + seed data.** From your machine, point the backend at Neon and run the
   existing scripts (these apply `database/schema.sql`, `database/seed.sql`, then create the
   demo account + 14 days of history):
   ```bash
   cd backend
   # PowerShell:
   $env:DATABASE_URL="postgresql://...neon.tech/...?sslmode=require"; npm install; npm run migrate; npm run seed
   # macOS/Linux:
   DATABASE_URL="postgresql://...neon.tech/...?sslmode=require" npm install && npm run migrate && npm run seed
   ```
   (Alternatively: paste the contents of `database/schema.sql` then `database/seed.sql` into
   Neon's **SQL Editor** in the dashboard. The `npm run seed` step is what creates the demo
   login, so prefer the script route if you want the demo account.)

---

## Step 2 — AI service (Render)

1. Sign up at <https://render.com> → **New → Web Service** → connect your GitHub repo.
2. Configure:
   - **Root Directory:** `ai-service`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt && python -m app.ml.train`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** Free
3. Environment variables (add after you have the other URLs — placeholders are fine for the
   first deploy since the backend calls this service server-side):

   | Key               | Value                              |
   |-------------------|------------------------------------|
   | `FRONTEND_ORIGIN` | *(your Vercel URL, set in Step 5)* |
   | `BACKEND_ORIGIN`  | *(your Render backend URL, Step 4)*|

4. Deploy. Note the public URL, e.g. `https://aifit-ai.onrender.com`. Verify:
   `https://aifit-ai.onrender.com/health` → `{"status":"healthy",...}`

---

## Step 3 — Backend (Render)

1. **New → Web Service** → same repo.
2. Configure:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node src/index.js`
   - **Instance Type:** Free
3. Environment variables:

   | Key                    | Value                                                         |
   |------------------------|---------------------------------------------------------------|
   | `NODE_ENV`             | `production`                                                  |
   | `DATABASE_URL`         | your Neon string (with `?sslmode=require`)                    |
   | `AI_SERVICE_URL`       | the Render AI URL from Step 2 (e.g. `https://aifit-ai.onrender.com`) |
   | `AI_TIMEOUT_MS`        | `15000`                                                      |
   | `FRONTEND_ORIGIN`      | your Vercel URL (set in Step 5; use `*`-free placeholder for now) |
   | `JWT_ACCESS_SECRET`    | a long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
   | `JWT_REFRESH_SECRET`   | a *different* long random string                              |
   | `JWT_ACCESS_TTL`       | `15m`                                                        |
   | `JWT_REFRESH_TTL_DAYS` | `7`                                                          |
   | `BCRYPT_ROUNDS`        | `12`                                                        |

   > **Do not set `PORT`** — Render injects it automatically and the app reads it.
4. Deploy. Note the URL, e.g. `https://aifit-backend.onrender.com`. Verify:
   `https://aifit-backend.onrender.com/health` → `{"status":"healthy","database":"connected"}`
   (If `database` shows `unavailable`, recheck `DATABASE_URL` / `sslmode=require`.)

---

## Step 4 — Frontend (Vercel)

1. Sign up at <https://vercel.com> → **Add New → Project** → import the repo.
2. Configure:
   - **Root Directory:** `frontend`
   - Framework preset: **Next.js** (auto-detected)
3. Environment variable:

   | Key                   | Value                                            |
   |-----------------------|--------------------------------------------------|
   | `NEXT_PUBLIC_API_URL` | your Render backend URL (e.g. `https://aifit-backend.onrender.com`) |

   > `NEXT_PUBLIC_*` is baked at build time — if you change it later, **redeploy**.
4. Deploy. You get your live URL, e.g. `https://ai-fitness-platform.vercel.app`.

---

## Step 5 — Wire CORS (close the loop)

The backend and AI service only accept their configured origins, so after the Vercel URL
exists, go back and set it:

1. **Render backend** → `FRONTEND_ORIGIN` = your Vercel URL → save (auto-redeploys).
2. **Render AI service** → `FRONTEND_ORIGIN` = Vercel URL, `BACKEND_ORIGIN` = Render backend
   URL → save.

Order recap (because of the circular dependency): Neon → AI service → backend → frontend →
back-fill `FRONTEND_ORIGIN`.

---

## Verify it works

1. Open your Vercel URL.
2. Log in with the demo account: **`demo@aifitness.app`** / **`Demo1234!`**
   (created by `npm run seed` in Step 1).
3. First load after idle may take ~40 s while Render wakes — that's the cold start, not an error.

## Troubleshooting

| Symptom                                   | Fix                                                                 |
|-------------------------------------------|---------------------------------------------------------------------|
| Login/API calls fail with CORS error      | `FRONTEND_ORIGIN` on the backend must exactly match the Vercel URL (no trailing slash). |
| `/health` shows `database: unavailable`   | `DATABASE_URL` wrong or missing `?sslmode=require`.                 |
| Frontend calls `localhost:5000`           | `NEXT_PUBLIC_API_URL` wasn't set, or you didn't redeploy after setting it. |
| First request very slow                   | Render free cold start. Add an UptimeRobot ping to `/health`.       |
| AI features error / time out              | AI service asleep or `AI_SERVICE_URL` wrong; raise `AI_TIMEOUT_MS`. |

## Cost summary

Everything above stays on free tiers indefinitely. The only "limit" you'll feel is the
Render cold start, which is acceptable for a portfolio project.
