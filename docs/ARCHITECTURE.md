# Architecture

## Overview

```
┌────────────┐   HTTPS/JSON    ┌────────────┐   SQL    ┌────────────┐
│  Next.js   │ ──────────────► │  Express   │ ───────► │ PostgreSQL │
│  (browser) │ ◄────────────── │   API      │ ◄─────── │            │
└────────────┘   JWT + SWR     └────────────┘          └────────────┘
                                     │ HTTP/JSON
                                     ▼
                               ┌────────────┐
                               │  FastAPI   │  scikit-learn models
                               │ ML service │  (joblib artifacts)
                               └────────────┘
```

The browser only ever talks to the Express API. Express is the trust boundary: it
authenticates requests, validates input, talks to PostgreSQL with parameterised queries,
and calls the FastAPI ML service server-to-server. The ML service is stateless — it never
touches the database; the backend supplies the features and persists the results.

## Frontend (Next.js 15, App Router)

- **Routing**: public (`/`, `/login`, `/register`), `/onboarding` (auth-gated), and
  `/dashboard/*` (auth + onboarding-gated via `dashboard/layout.tsx`).
- **State/data**: `AuthProvider` holds the session; `ThemeProvider` handles dark mode; SWR
  fetches and revalidates dashboard data.
- **API client** (`lib/api.ts`): axios instance with a request interceptor that attaches
  the access token and a response interceptor that transparently refreshes on `401` and
  replays the request, redirecting to `/login` if refresh fails.
- **Design system**: Tailwind tokens (CSS variables for light/dark), reusable UI primitives
  (`components/ui`), and consistent loading/empty/error/skeleton states.

## Backend (Express)

- **Entry** `src/index.js`: Helmet, CORS (single origin), JSON body limit, request logging,
  rate limiters, routers, 404 + central error handler, retrying DB connection on boot.
- **Auth** (`utils/jwt.js`): short-lived access JWTs; opaque refresh tokens stored **hashed**
  (SHA-256) in `refresh_tokens`, rotated on every refresh and revocable on logout.
- **Planning** (`utils/planning.js`): orchestrates ML calls (calorie target, goal timeline,
  workout plan) and persists workout plans transactionally.
- **AI client** (`utils/aiClient.js`): wraps calls to FastAPI, mapping connection/timeout
  failures to `503`/`504` and keeping the rest of the app resilient if ML is down (the
  dashboard falls back to a formula-based estimate).

## ML service (FastAPI + scikit-learn)

- **datasets.py** — generates physiologically grounded synthetic datasets (Mifflin-St Jeor
  TDEE, safe weekly weight-change rates) with controlled noise.
- **train.py** — fits and persists three models with joblib:
  - calorie target — `GradientBoostingRegressor`
  - goal timeline — `GradientBoostingRegressor`
  - workout split — `RandomForestClassifier`
- **engine.py** — loads models (auto-trains if missing) and converts predictions into
  calorie/macro targets, multi-day workout plans (split → exercise pool expansion), diet
  recommendations and insights.
- **coach.py** — TF-IDF + cosine similarity retrieval over a curated coaching corpus, with a
  safety overlay for injury-related messages.
- **nlp.py** — rule-based parser extracting intent, food, exercise, duration, calories, steps.

## Data flow examples

**Assessment → plan**: onboarding `POST /api/profile/assessment` → backend saves profile →
calls ML `/calorie-target`, `/goal-estimate`, `/workout/plan` → persists goals + plan →
returns to the client.

**Dashboard load**: `GET /api/dashboard` → backend aggregates today's logs, computes BMI,
calls ML for calorie/macro targets + timeline (fallback to formula on failure), reads the
active plan and weight progress → single JSON payload consumed by SWR.

**Natural-language log**: `POST /api/food-log {text}` → backend calls ML `/nlp/parse` →
inserts a food row and, if an activity was detected, an activity row too.
