# AI Fitness Ecosystem (Autonomous AI Edition)

Production-style local monorepo: Next.js + TypeScript frontend, Express REST API, PostgreSQL, and a FastAPI/scikit-learn AI service. Registered users use the backend/database/AI services. Guest mode remains local-first in Dexie/IndexedDB and can work offline after the app shell has loaded.

## Architecture and repository layout

```text
AI-FITNESS-PLATFORM/
├── docker-compose.yml
├── .env.example
├── database/
│   ├── schema.sql
│   └── seed.sql
├── frontend/                 # Next.js 15 App Router, TypeScript, PWA, Dexie guest store
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── public/
│   ├── .env.example
│   └── package.json
├── backend/                  # Express 4 REST API, JWT auth, PostgreSQL, AI client
│   ├── src/
│   ├── scripts/
│   ├── .env.example
│   └── package.json
└── ai-service/               # FastAPI package and scikit-learn models
    ├── app/
    │   ├── __init__.py
    │   ├── main.py           # canonical ASGI app: app.main:app
    │   ├── schemas.py
    │   └── ml/
    │       ├── __init__.py
    │       ├── train.py
    │       ├── engine.py
    │       ├── datasets.py
    │       ├── constants.py
    │       ├── nlp.py
    │       └── coach.py
    ├── main.py               # compatibility alias for `uvicorn main:app`
    ├── requirements.txt
    └── Dockerfile
```

The FastAPI package is `ai-service/app/`; it is not a missing dependency. `app/__init__.py` and `app/ml/__init__.py` already make the folders packages. `app.main` uses package-relative imports, so start Uvicorn from `ai-service` as `app.main:app`. Do not run `uvicorn main:app` from the repository root. A thin `ai-service/main.py` compatibility entry point is also included.

The AI code imports FastAPI, Pydantic, NumPy, pandas, SciPy, scikit-learn, and joblib. It currently does **not** import spaCy, sentence-transformers, or PyTorch; installing those large packages does not fix this service and is not part of the supported dependency set. Text logging and coaching are implemented with deterministic rules and scikit-learn TF-IDF, respectively. Pose inference uses the existing browser-side MediaPipe integration.

## Fastest Windows 10/11 setup: Docker Compose

Install Docker Desktop with the WSL 2 backend, start Docker Desktop, and use PowerShell in the repository root. The Docker path does not require local Python or Node installations.

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose config --quiet
docker compose up --build -d
docker compose ps
```

The first build needs a working connection to Docker Hub and PyPI. The database initializes `database/schema.sql` and `database/seed.sql` on an empty volume. Compose waits for PostgreSQL and FastAPI health checks before starting the API, then seeds a demo account before the backend listens. The frontend image embeds `http://localhost:5000` as its browser API URL.

Open:

- Frontend: http://localhost:3000
- Backend health (includes database status): http://localhost:5000/health
- FastAPI health: http://localhost:8000/health
- FastAPI interactive API docs: http://localhost:8000/docs

Demo account: `demo@aifitness.app` / `Demo1234!`. You can also choose **Continue as guest**; guest data stays in this browser's IndexedDB and is not sent to the server.

Useful commands:

```powershell
docker compose logs -f db
docker compose logs -f ai-service
docker compose logs -f backend
docker compose logs -f frontend
docker compose restart backend
docker compose down
```

`docker compose down` preserves PostgreSQL data. Do not use `docker compose down -v` unless you intentionally want to erase the local database volume.

## Manual Windows development (Python 3.12, Node 20+)

Use separate PowerShell terminals. Install Node.js 20 or newer and Python 3.12; verify with `node --version`, `npm --version`, and `py -3.12 --version`. Docker Desktop is still used here for PostgreSQL, so no local PostgreSQL service or port 5432 is required.

### 1. Start PostgreSQL

From the repository root:

```powershell
docker compose up -d db
docker compose ps db
```

The database is exposed to Windows as `localhost:5433`. Inside Compose, other containers connect to host name `db` and port `5432`.

### 2. Create the Python environment and start FastAPI

```powershell
Set-Location .\ai-service
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip setuptools wheel
.\.venv\Scripts\python.exe -m pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m app.ml.train
.\.venv\Scripts\python.exe -m uvicorn --env-file .env app.main:app --reload --host 127.0.0.1 --port 8000
```

Keep this terminal open. The equivalent import-path-safe command without reload is:

```powershell
.\.venv\Scripts\python.exe -m uvicorn --env-file .env app.main:app --host 127.0.0.1 --port 8000
```

Run it with the working directory set to `ai-service`. No custom `PYTHONPATH` is required: Python adds the current directory to the module search path. If you must start from the repo root, use `.\ai-service\.venv\Scripts\python.exe -m uvicorn --app-dir .\ai-service app.main:app --host 127.0.0.1 --port 8000`.

### 3. Configure, migrate, and start Express

In a second terminal:

```powershell
Set-Location .\backend
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm ci
npm run migrate
npm run seed
npm run dev
```

The checked-in `.env.example` uses PostgreSQL host port `5433` and AI URL `http://localhost:8000`. Schema initialization and migration are idempotent. Keep the API terminal open at http://localhost:5000.

### 4. Configure and start Next.js

In a third terminal:

```powershell
Set-Location .\frontend
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm ci
npm run dev
```

Open http://localhost:3000. `NEXT_PUBLIC_API_URL` is compiled into the browser bundle: restart the Next.js process after changing `.env.local`. For browser access it must be a URL reachable by the browser, normally `http://localhost:5000`, not the Compose-only hostname `http://backend:5000`.

## Verification and integration smoke tests

Run these from PowerShell after starting the services:

```powershell
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod http://localhost:5000/health
Invoke-RestMethod http://localhost:3000/manifest.webmanifest
```

Exercise a FastAPI model endpoint:

```powershell
$body = @{
  user_id = 1
  age = 30
  gender = "male"
  height_cm = 175
  weight_kg = 80
  activity_level = "moderate"
  goal = "weight_loss"
} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8000/calorie-target -Method Post -ContentType "application/json" -Body $body
```

Verify login and the Express-to-PostgreSQL path:

```powershell
$login = @{ email = "demo@aifitness.app"; password = "Demo1234!" } | ConvertTo-Json
$session = Invoke-RestMethod -Uri http://localhost:5000/api/auth/login -Method Post -ContentType "application/json" -Body $login
$headers = @{ Authorization = "Bearer $($session.accessToken)" }
Invoke-RestMethod -Uri http://localhost:5000/api/dashboard -Headers $headers
```

The dashboard request calls the FastAPI calorie and timeline models through the Express `AI_SERVICE_URL`. Also test signup/onboarding, food/activity logging, workout generation, coach messaging, weight logging, and progress charts from the UI.

## Configuration reference

| Setting | Local value | Used by |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://fitness_user:fitness_password@localhost:5433/ai_fitness_platform` | Backend on Windows |
| Compose database URL | `postgres://fitness_user:<password>@db:5432/ai_fitness_platform` | Backend container |
| `AI_SERVICE_URL` | `http://localhost:8000` | Backend on Windows |
| Compose AI URL | `http://ai-service:8000` | Backend container |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000` | Browser frontend |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | Express and FastAPI CORS |
| `PORT` / `AI_SERVICE_PORT` | `5000` / `8000` | Express / FastAPI |

The root `.env.example` is for Docker Compose variables. `backend/.env.example` is for manual Express startup. `ai-service/.env.example` supplies the Uvicorn CORS settings. `frontend/.env.example` is copied to `.env.local` and contains the browser-visible API origin only. Never put private secrets in a `NEXT_PUBLIC_` variable.

## Windows/network recovery

### Python install times out, DNS fails, or a cached wheel hash fails

First verify network/DNS access to PyPI, confirm system date/time, and retry without cached wheels:

```powershell
Resolve-DnsName pypi.org
Test-NetConnection pypi.org -Port 443
Set-Location .\ai-service
.\.venv\Scripts\python.exe -m pip cache purge
.\.venv\Scripts\python.exe -m pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt
```

If DNS resolution fails, fix the active network/VPN/proxy/DNS configuration first; increasing pip timeouts cannot repair DNS. On a managed network, configure the approved proxy/CA with your administrator rather than disabling TLS verification. Do not edit dependency hashes to bypass a real integrity error. No hashes are pinned in this project's requirements file.

### Virtual environment or Python version confusion

Use the explicit interpreter path `.\.venv\Scripts\python.exe` for install, training and Uvicorn. This avoids PowerShell execution-policy activation issues and prevents Anaconda/other Python versions from receiving the packages. Recreate only the project environment if it is contaminated:

```powershell
Set-Location .\ai-service
Remove-Item .venv -Recurse -Force
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip setuptools wheel
.\.venv\Scripts\python.exe -m pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt
```

### `ModuleNotFoundError: app` / Uvicorn import errors

Check `Get-Location` is the `ai-service` directory and launch:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Do not launch `app.main:app` from a different working directory without `--app-dir`. Do not move `app/main.py` out of the package: its relative imports depend on the package.

### PostgreSQL won't start or backend gets connection refused

```powershell
docker compose ps
docker compose logs db
Test-NetConnection localhost -Port 5433
```

Port `5433` is intentional to avoid conflicting with a Windows PostgreSQL installation using `5432`. If `5433` is occupied, change the host side of the Compose mapping (for example, `5434:5432`) and update the manual `DATABASE_URL` to use `5434`; do not change the container-side port.

The database init scripts run only when the PostgreSQL data directory is empty. For an existing volume, apply schema changes with `Set-Location .\backend; npm run migrate`. Preserve data by default; only reset a volume after backing it up and explicitly deciding the data can be lost.

### Frontend cannot reach backend / CORS errors

Check `frontend/.env.local` contains `NEXT_PUBLIC_API_URL=http://localhost:5000`, `backend/.env` contains `FRONTEND_ORIGIN=http://localhost:3000`, and `http://localhost:5000/health` responds. Restart Next.js after changing the public URL. CORS origins must match the exact scheme, host, and port.

### Compose says no configuration file

Run `docker compose` from the repository root (where `docker-compose.yml` is located), or specify it explicitly:

```powershell
docker compose -f .\docker-compose.yml up --build
```

### Docker build cannot reach PyPI

This is a host/container DNS or proxy issue, not a Python module path issue. Check Docker Desktop networking and host DNS, then retry `docker compose build --no-cache ai-service`. `--no-cache` forces fresh downloads but does not fix unavailable DNS; use it only when cached build layers are suspected to be stale.

## Production notes

- Replace the development JWT and PostgreSQL passwords with unique secret-manager values; set `NODE_ENV=production`. Do not use the local demo account in production.
- Use HTTPS, exact CORS origins, restricted database/network exposure, database backups, and managed PostgreSQL credentials.
- `NEXT_PUBLIC_API_URL` is public and baked into the frontend bundle. For deployment, point it at the public HTTPS backend origin; never place secrets there.
- Add an authenticated Google OAuth/account-linking flow and a configured Dexie Cloud deployment only if cross-device sync is required. Guest IndexedDB data is device/browser-local.
- The Overpass service is a public best-effort dependency; rate limits and outages should not block core logging/training flows.
- Python model artifacts are generated during the container image build and lazily retrained in development if absent. Do not load user-supplied joblib files.

## License

MIT (demo / portfolio use).
