# AI Fitness Platform

A production-ready, AI-powered fitness platform. Users register, complete a fitness
assessment, and receive **machine-learning-generated** calorie targets and workout plans,
log food and activity in **natural language**, track **weight & progress analytics**, and
chat with an **AI coach** — all behind JWT authentication.

```
Next.js 15 (dashboard)  ─►  Express API (REST, auth, security)  ─►  PostgreSQL
                                          │
                                          └─►  FastAPI + scikit-learn (ML engine)
```

| Layer    | Stack                                            | Port |
|----------|--------------------------------------------------|------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind    | 3000 |
| Backend  | Node.js, Express, JWT, bcrypt, Helmet            | 5000 |
| ML       | Python, FastAPI, scikit-learn (GBR + RandomForest + TF-IDF) | 8000 |
| Database | PostgreSQL 16                                    | 5433 |

---

## Quick start (one command, Docker)

Requires Docker Desktop.

```bash
docker compose up --build
```

This builds and starts all four services, initialises the database schema + exercise
catalog, **trains the ML models into the image**, and seeds a demo account. When it
finishes:

- App:        http://localhost:3000
- Backend:    http://localhost:5000/health
- AI service: http://localhost:8000/health

**Demo login:** `demo@aifitness.app` / `Demo1234!`

> For production, set strong secrets first: copy `.env.example` to `.env` and fill in
> `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (compose reads them automatically).

---

## Manual / development setup

Run each service in its own terminal. Requires Node 20+, Python 3.11+, and a PostgreSQL
instance (or `docker run` one).

### 1. PostgreSQL

```bash
docker run -d --name aifit-db \
  -e POSTGRES_USER=fitness_user -e POSTGRES_PASSWORD=fitness_password \
  -e POSTGRES_DB=ai_fitness_platform -p 5433:5432 \
  -v "$(pwd)/database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro" \
  -v "$(pwd)/database/seed.sql:/docker-entrypoint-initdb.d/02-seed.sql:ro" \
  postgres:16-alpine
```

> Host port **5433** is used so the project never clashes with a PostgreSQL
> instance already running on 5432. The mounted SQL files initialise the schema
> and exercise catalog automatically on first start.

### 2. AI / ML service

```bash
cd ai-service
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m app.ml.train          # generates datasets + trains models into app/data/
uvicorn app.main:app --reload --port 8000
```

### 3. Backend (Express)

```bash
cd backend
cp .env.example .env            # defaults work for local dev
npm install
npm run migrate                 # applies database/schema.sql + seed.sql
npm run seed                    # creates the demo account + 14 days of history
npm run dev                     # http://localhost:5000
```

### 4. Frontend (Next.js)

```bash
cd frontend
cp .env.example .env.local      # NEXT_PUBLIC_API_URL=http://localhost:5000
npm install
npm run dev                     # http://localhost:3000
```

---

## Features

- **Authentication** — register, login, JWT access tokens (15 min) + rotating refresh
  tokens (7 days), bcrypt password hashing, protected routes, transparent token refresh.
- **Fitness assessment & onboarding** — multi-step wizard capturing body metrics, goals,
  activity, experience, diet and availability; persisted and validated.
- **AI recommendation engine** (scikit-learn):
  - `GradientBoostingRegressor` → personalised daily calorie & macro targets.
  - `GradientBoostingRegressor` → weeks-to-goal timeline.
  - `RandomForestClassifier` → training split, expanded into a full multi-day plan.
  - `TfidfVectorizer` + cosine similarity → retrieval-based AI coach.
- **Smart logging** — natural-language food/activity parsing (calories, steps, duration).
- **Dashboard & analytics** — BMI, calorie/macro targets, steps, weight trend, goal
  progress, 14-day charts, active workout plan, daily recommendations.
- **Modern UX** — responsive (mobile-first), dark mode, loading/empty/error/skeleton
  states, accessible components.
- **Security** — Helmet headers, per-route rate limiting, input validation/sanitisation,
  parameterised SQL (injection-safe), strict CORS.

---

## Documentation

- [docs/AUDIT_AND_FIXES.md](docs/AUDIT_AND_FIXES.md) — repository audit & fix report
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture & data flow
- [docs/API.md](docs/API.md) — REST + ML endpoint reference with schemas
- [docs/DATABASE.md](docs/DATABASE.md) — tables, relationships, constraints

---

## Project structure

```
AI-FITNESS-PLATFORM/
├── docker-compose.yml          # one-command full-stack startup
├── database/
│   ├── schema.sql              # tables, indexes, triggers
│   └── seed.sql                # exercise catalog (reference data)
├── ai-service/                 # FastAPI + scikit-learn
│   └── app/
│       ├── main.py             # API endpoints
│       ├── schemas.py          # pydantic models
│       └── ml/                 # datasets, train, engine, nlp, coach
├── backend/                    # Express API
│   ├── src/
│   │   ├── index.js            # app entry
│   │   ├── routes/             # auth, profile, dashboard, logs, weight, workout, …
│   │   ├── middleware/         # auth, validate, rateLimit, errorHandler
│   │   └── utils/              # jwt, aiClient, planning, helpers
│   └── scripts/                # migrate.js, seed.js
└── frontend/                   # Next.js App Router
    ├── app/                    # login, register, onboarding, dashboard/*
    ├── components/             # ui, dashboard, providers
    └── lib/                    # api client, types, token store
```

## License

MIT (demo / portfolio use).
