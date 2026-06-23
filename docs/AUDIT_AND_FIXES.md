# Repository Audit & Fix Report

## 1. What the project intended to be

Reverse-engineering the code (treated as source of truth) revealed a **3-tier AI fitness
platform**: a Next.js dashboard talking to an Express REST API backed by PostgreSQL, with a
separate FastAPI service intended to host the ML/AI features (NLP log parsing, exercise/diet
recommendations, health insights, an AI coach). The data model and route names made the
product vision clear: profile-driven nutrition/activity tracking with AI guidance.

The original README described a richer aspirational vision (embeddings, gradient boosting,
RandomForest ranking, MediaPipe posture). The actual implemented code was a simpler, coherent
MVP — so the build below **completes the implemented MVP into a production product** rather
than the aspirational README, while honouring the ML intent with real scikit-learn models.

## 2. What was found broken or missing

### Critical
| # | Issue | Resolution |
|---|-------|-----------|
| 1 | **No authentication** — schema had `password_hash` but zero auth endpoints; frontend hard-coded `userId=1`. | Full JWT auth: register/login/refresh/logout/me, bcrypt, rotating refresh tokens, protected routes. |
| 2 | **`seed.sql` referenced a non-existent schema** (`daily_logs`, `preferences` jsonb) → would crash on run. | Rewritten to seed the exercise catalog only; demo account moved to a bcrypt-aware Node seed script. |
| 3 | **No `docker-compose.yml`** despite README/backend depending on it. | Added full 4-service compose with healthchecks + auto DB init + demo seed. |
| 4 | **DB credential mismatch** across `.env`, `db.js`, README. | Standardised on `fitness_user / ai_fitness_platform` everywhere. |
| 5 | **ML was 100% mock** — `requirements.txt` listed scikit-learn but `main.py` imported none. | Real models: GradientBoosting (calories, timeline), RandomForest (workout split), TF-IDF coach, with dataset generation + training pipeline. |
| 6 | **ai-service Dockerfile referenced `app/main.py` + spaCy** that didn't exist → build failure. | Restructured into an `app/` package; Dockerfile pre-trains models; removed spaCy. |
| 7 | **backend Dockerfile EXPOSEd port 8000** (app runs on 5000). | Corrected to 5000 with a healthcheck. |

### Functional gaps
- No onboarding/assessment workflow → added a 3-step wizard + `/api/profile/assessment`.
- No workout-plan generation or persistence → ML-generated plans saved to
  `workout_plans` / `workout_plan_exercises`.
- No weight history table or progress tracking UI → added `weight_logs` + analytics.
- `PosturePanel` was an explicit placeholder; `.glass` CSS class was undefined; fonts
  (`--font-geist`) were referenced but never loaded → replaced with a real design system.
- Duplicate coach endpoints; chat history saved only on one path → unified `/api/coach`.
- Two conflicting `next.config` files; unused `ErrorBoundary`, `speech.d.ts` → removed.
- `db.js` crashed the process at import time with misleading error text → replaced with a
  retrying `verifyConnection()` and accurate logging.

## 3. What was repaired & implemented

- **Database** — clean idempotent schema with 12 tables, FKs with `ON DELETE CASCADE`,
  check constraints, indexes, an `updated_at` trigger, and a reference exercise catalog.
- **ML service** — dataset generation grounded in sports-science formulas, a training
  pipeline producing joblib artifacts (self-bootstrapping on first run), and an inference
  engine that turns predictions into calorie/macro targets, full workout plans, goal
  timelines, diet recommendations and coach replies.
- **Backend** — modular Express app (config, db, middleware, routes, utils), JWT auth,
  Helmet, rate limiting, express-validator, an AI client with timeout/connection handling,
  and a planning service that orchestrates the ML calls and persists results.
- **Frontend** — auth flow, onboarding wizard, and a 7-section dashboard (overview,
  workout, nutrition, progress, coach, nearby, profile) with a cohesive Tailwind design
  system, dark mode, and loading/empty/error/skeleton states.
- **DevOps** — Dockerfiles for all services, docker-compose with healthchecks and
  dependency ordering, `.dockerignore`s, `.env.example`s, and DB migrate/seed scripts.

## 4. Verification

- Frontend production build: **passes** (15 routes, types valid).
- Backend: all modules syntax-checked; **30/30 end-to-end API tests pass** against a live
  PostgreSQL + ML service (auth, dashboard, ML plan generation, NLP logging, weight, coach,
  assessment, validation/error paths).
- ML pipeline: trains successfully (calorie MAE ≈ 57 kcal, timeline MAE ≈ 1.4 weeks,
  workout-split accuracy ≈ 0.97).
- Python modules: compile cleanly.
