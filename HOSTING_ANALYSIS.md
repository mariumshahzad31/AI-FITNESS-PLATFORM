# AI FITNESS PLATFORM — Hosting Analysis

> Analysis only. Based on evidence in this repository (`docker-compose.yml`, the three
> `Dockerfile`s, `package.json` / `requirements.txt`, `next.config.ts`, `database/`).
> No code, configuration, or architecture was changed to produce this document.

## Project Summary

The platform is a **polyglot, multi-service application** — three long-running web
processes plus a relational database:

| Component | Detected stack (evidence) | Runtime | Port |
|-----------|---------------------------|---------|------|
| **Frontend** | Next.js 15 App Router, React 19, TypeScript; `next.config.ts` → `output: "standalone"` | Node 20 (`node server.js`) — **not** a static export | 3000 |
| **Backend API** | Node 20 + Express (ESM), JWT auth, `pg` client | Node 20 (`node src/index.js`) | 5000 |
| **AI / ML service** | Python 3.11 + FastAPI + `uvicorn`; `scikit-learn 1.5.2`, `numpy`, `pandas`, `joblib` | Python (uvicorn) | 8000 |
| **Database** | PostgreSQL 16; `database/schema.sql` (12 tables) + `seed.sql` | Managed Postgres or container | 5432 |

Key facts that drive hosting suitability:

- **Three separate runtimes** (Node × 2 + Python × 1) + **one Postgres** → four deployable
  units. `docker-compose.yml` wires them together.
- **ML runs server-side but is lightweight**: models are pre-trained into the image
  (`RUN python -m app.ml.train`), total artifact size **~6 MB** (`split_model.joblib` ~5 MB).
  Resident memory for the scikit-learn/numpy/pandas process is **~300–500 MB** — fits a
  512 MB free instance, but with little headroom.
- **The computer-vision (form analyzer) runs entirely in the browser** (MediaPipe assets
  served from the frontend's `/public`, ~15 MB downloaded client-side). **Zero ML cost on
  the server** — important: free tiers are not taxed by the camera feature.
- **No GPU, no heavy training at runtime**, no background workers, no object storage.
- **Environment variables required**: `DATABASE_URL`, `FRONTEND_ORIGIN`, `AI_SERVICE_URL`,
  `AI_TIMEOUT_MS`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`,
  `JWT_REFRESH_TTL_DAYS`, `BCRYPT_ROUNDS`, `PORT`/`AI_SERVICE_PORT`, and the frontend's
  build-time `NEXT_PUBLIC_API_URL`.

**Deployment complexity: medium.** Any free host must run a Node service, a Python service,
and a Postgres database, and let them reach each other over private/public URLs.

## Hosting Platform Comparison

| Rank | Platform | Free Plan | Can Host Entire Project | Difficulty | Score |
|------|----------|-----------|-------------------------|------------|-------|
| 1 | **Render** | Free web services + free Postgres (expires after 30–90 days) | ✅ Yes — 3 web services + managed Postgres | Easy | **9/10** |
| 2 | **Oracle Cloud — Always Free** | ARM VM, up to 4 vCPU / 24 GB RAM, free *forever* | ✅ Yes — runs the full `docker-compose` on one VM | Hard | **8/10** |
| 3 | **Koyeb** | 1 free service + serverless Postgres; Docker-native, auto-HTTPS | ⚠️ Partial — tight; services must be combined/trimmed | Medium | **7/10** |
| 4 | **Northflank** | Free dev sandbox: limited services + 1 Postgres addon | ⚠️ Partial — fits ~2 of 3 services + DB | Medium | **6/10** |
| 5 | **Fly.io** | Small monthly free allowance, then pay-as-you-go | ✅ Technically — Docker VMs + Fly Postgres | Medium | **6/10** |
| 6 | **Railway** | One-time trial credit only — **not ongoing free** | ✅ Yes (after trial, paid Hobby ~$5/mo) | Easy | **5/10** |
| 7 | **Replit** | Free, but apps sleep; multi-runtime + Postgres is awkward | ⚠️ Partial / unreliable for a 4-unit stack | Easy | **4/10** |
| 8 | **AWS / Azure / GCP free tier** | 12-month trial, credit card, complex IAM/networking | ✅ Yes, but heavy overkill | Hard | **4/10** |

## Best Platform

**Render.** It is the only managed platform that hosts **every part of this repository on a
genuinely free plan with public HTTPS URLs and almost no ops work**:

- Native **Node** and **Python** web services — matches the backend (`node src/index.js`)
  and AI service (`uvicorn app.main:app`) directly; the existing Dockerfiles can also be
  used as-is.
- A **free managed PostgreSQL** instance for `schema.sql` + `seed.sql`.
- Each service gets a stable `*.onrender.com` HTTPS URL — exactly what `NEXT_PUBLIC_API_URL`
  / `AI_SERVICE_URL` / `FRONTEND_ORIGIN` expect — and env vars are set in the dashboard.
- The 512 MB free RAM comfortably runs the Node services and is sufficient for the
  scikit-learn service (~300–500 MB, models pre-baked, no runtime training).

**Main caveats:** free services **spin down after ~15 min idle**, so the first hit after
inactivity is a cold start (and here it can chain frontend → backend → AI, ~30–60 s once).
The free Postgres is **time-limited (30–90 days)** and must be recreated/re-seeded
afterwards.

## Second Best Option

**Oracle Cloud — Always Free.** The most powerful free option: an Always-Free ARM VM
(up to 4 vCPU / 24 GB RAM) can run the **entire `docker-compose.yml` unchanged** on a single
machine — **no cold starts, always-on, free forever**, and Postgres lives in its own
container with no 90-day expiry. The trade-offs are operational: you manage a Linux VM
yourself, configure a reverse proxy + TLS (e.g. Caddy/Nginx) for HTTPS, open firewall
ports, and a credit card is required at sign-up. Best **demo experience**, highest setup
effort.

## Third Best Option

**Koyeb.** Docker-native, global edge, automatic HTTPS, and a serverless Postgres on the
free tier. It deploys this repo's containers cleanly, but the free allowance realistically
covers **one always-on service**, so all three web processes don't fit free without
consolidating them (e.g. proxying the AI service behind the backend). Good middle ground if
you want managed hosting closer to "always-on" than Render's sleep behavior.

## Recommended Choice

### → **Render**

- **Why:** lowest-friction path from this exact repository to a **public, shareable HTTPS
  URL**. It supports all three runtimes and a free Postgres, reads the project's existing env
  vars, and can deploy straight from GitHub (or the included Dockerfiles) with no
  architecture changes. For a student/portfolio project this is the best effort-to-result
  ratio.
- **Expected limitations:**
  - Cold starts after ~15 min idle (first visit ~30–60 s while services wake). Mitigate with
    a simple uptime pinger on the frontend + backend URLs before a demo.
  - Free PostgreSQL expires after ~30–90 days → recreate and re-run the seed.
  - 512 MB RAM per service — fine here, but keep the AI service lean (it already is).
- **Suitable for LinkedIn & FYP?** **Yes.** It yields a clean, recruiter-friendly public URL
  and showcases the full Next.js + Express + FastAPI + scikit-learn + PostgreSQL stack live.
  For a graded FYP defense or a high-traffic showcase where cold starts are unacceptable,
  switch to **Oracle Cloud Always Free** (always-on) or pin Render's paid Starter tier
  temporarily.

## Conclusion

This is a four-unit, multi-runtime application, and the server-side ML footprint is small
(models pre-trained, ~6 MB; CV runs in the browser). That makes it a realistic fit for free
hosting. **Render** is the recommended platform for a fast, professional public deployment
with minimal effort; **Oracle Cloud Always Free** is the stronger choice when always-on
performance matters more than setup time. Either delivers a portfolio-grade, demonstrable
public URL.
