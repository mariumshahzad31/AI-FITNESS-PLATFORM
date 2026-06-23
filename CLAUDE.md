# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## What this is

A full-stack, AI-powered fitness platform. Users register, complete a fitness assessment,
and get ML-generated calorie targets and workout plans, log food/activity in natural
language, track weight/progress, and chat with an AI coach — all behind JWT auth.

## Architecture

Four services. The browser only talks to the frontend and the backend; the backend calls
the AI service **server-side** (the browser never calls the AI service directly).

```
Next.js 15 (frontend, :3000)
      │  HTTP, NEXT_PUBLIC_API_URL
      ▼
Express API (backend, :5000) ──► PostgreSQL (:5433 host → 5432)
      │  AI_SERVICE_URL (server-side)
      ▼
FastAPI + scikit-learn (ai-service, :8000)
```

| Layer    | Stack                                             | Dir          | Port |
|----------|---------------------------------------------------|--------------|------|
| Frontend | Next.js 15 App Router, TypeScript, Tailwind, SWR  | `frontend/`  | 3000 |
| Backend  | Node 20, Express, JWT, bcrypt, Helmet, `pg`       | `backend/`   | 5000 |
| AI/ML    | Python 3.11, FastAPI, scikit-learn, pandas, numpy | `ai-service/`| 8000 |
| Database | PostgreSQL 16                                     | `database/`  | 5433 |

## Run it locally

**One command (preferred):**
```bash
docker compose up --build
```
Builds all services, trains the ML models into the AI image, initialises the DB schema +
exercise catalog, and seeds a demo account.

- App: http://localhost:3000 · Backend: http://localhost:5000/health · AI: http://localhost:8000/health
- Demo login: `demo@aifitness.app` / `Demo1234!`

> **Gotcha (seen in practice):** if `docker compose up` is interrupted with Ctrl-C mid-build,
> a half-created container can squat the `aifit-db` name and the next `up` fails with
> *"container name /aifit-db is already in use"*. Fix: `docker compose down` (not Ctrl-C), or
> `docker rm -f aifit-db aifit-ai aifit-backend aifit-frontend`, then `docker compose up -d`.
> Prefer `docker compose down` to stop the stack cleanly.

**Manual dev** (per-service, see `README.md` for full steps):
```bash
# database (host port 5433 to avoid clashing with a local 5432)
docker run -d --name aifit-db -e POSTGRES_USER=fitness_user -e POSTGRES_PASSWORD=fitness_password \
  -e POSTGRES_DB=ai_fitness_platform -p 5433:5432 postgres:16-alpine

cd ai-service && python -m venv .venv && pip install -r requirements.txt && \
  python -m app.ml.train && uvicorn app.main:app --reload --port 8000

cd backend  && npm install && npm run migrate && npm run seed && npm run dev   # :5000
cd frontend && npm install && npm run dev                                      # :3000
```

## Common commands

| Task                         | Command (from the service dir)                |
|------------------------------|-----------------------------------------------|
| Backend dev (hot reload)     | `npm run dev` (backend)                        |
| Apply schema + reference data| `npm run migrate` (backend) — runs `schema.sql` + `seed.sql` |
| Seed demo account + history  | `npm run seed` (backend)                       |
| Frontend dev                 | `npm run dev` (frontend)                       |
| Frontend production build    | `npm run build` (frontend) — emits standalone output |
| Train ML models              | `python -m app.ml.train` (ai-service)          |
| Run AI service               | `uvicorn app.main:app --reload --port 8000`    |

There is no automated test suite. Verify changes by running the stack and hitting the
`/health` endpoints + the live UI.

## Layout

```
backend/
  src/
    index.js            # app entry: middleware, routes, /health, graceful DB-degraded boot
    config.js           # env → config object
    db.js               # pg Pool, verifyConnection(), query() (tags conn errors as 503)
    routes/             # auth, profile, dashboard, logs, weight, workout, goals, coach, nearby, ai
    middleware/         # auth (JWT), validate, rateLimit, errorHandler
    utils/              # jwt, aiClient, planning, helpers
  scripts/              # migrate.js (schema+seed), seed.js (demo account + 14d history)
ai-service/
  app/
    main.py             # FastAPI endpoints (nlp, calorie-target, workout/plan, coach/chat, …)
    schemas.py          # pydantic request/response models
    ml/                 # datasets, train, engine, nlp, coach  (models saved to app/data/)
frontend/
  app/                  # App Router: login, register, onboarding, dashboard/*
  components/           # ui, dashboard, providers (Theme, Auth)
  lib/                  # api client, types, token store
database/
  schema.sql            # tables, indexes, triggers
  seed.sql              # exercise catalog (reference data)
docker-compose.yml      # full-stack startup
DEPLOY.md               # free-tier deploy guide (Neon + Render + Vercel)
```

## Conventions & key behaviours

- **ES modules** in the backend (`"type": "module"`); use `import`/`export`, not `require`.
- **Config via env only.** Backend reads `src/config.js`; AI service reads `os.getenv`. Never
  hardcode secrets or URLs. See `backend/.env.example` and `frontend/.env.example`.
- **CORS is strict (no wildcard).** Backend allows exactly `FRONTEND_ORIGIN`; AI service
  allows `{FRONTEND_ORIGIN, BACKEND_ORIGIN}`. When the frontend URL changes, update these or
  requests are blocked.
- **Graceful DB degradation.** The backend boots even if the DB is down; connection-level
  failures are surfaced as HTTP **503** (see the `CONNECTION_ERROR_CODES` set in `db.js`),
  never opaque 500s. `/health` reports `database: connected | unavailable`.
- **DB connection string is passed straight to `pg`.** For managed Postgres (e.g. Neon),
  include `?sslmode=require` in `DATABASE_URL`; no code change needed for SSL.
- **Auth:** JWT access tokens (15 min) + rotating refresh tokens (7 days), bcrypt hashing.
  Protected routes use the `auth` middleware; the frontend refreshes tokens transparently.
- **ML models are trained, not bundled.** `python -m app.ml.train` writes models to
  `ai-service/app/data/`; the Docker image pre-trains them at build time (fast, ~5 s) and the
  service also warms up on startup (`lifespan` in `main.py`).
- **Ports:** DB is exposed on host **5433** (not 5432) on purpose — don't change it casually.

## Deploying

See [DEPLOY.md](DEPLOY.md) for the free-tier setup (Neon database + Render backend/AI +
Vercel frontend), including the exact env vars and the CORS wiring order.

## Docs

- `README.md` — overview & quick start
- `docs/ARCHITECTURE.md` — architecture & data flow
- `docs/API.md` — REST + ML endpoint reference
- `docs/DATABASE.md` — tables, relationships, constraints
- `docs/AUDIT_AND_FIXES.md` — repository audit & fix report
