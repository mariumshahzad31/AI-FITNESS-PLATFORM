# Deployment

## Full-stack deployment on Render

The repository includes a Render Blueprint in `render.yaml` for PostgreSQL,
the FastAPI AI service, the Express API, and the Next.js frontend.

1. Push this repository to GitHub.
2. In the Render dashboard, choose **New → Blueprint** and connect this
   repository.
3. Review the four resources defined by `render.yaml`, then apply the Blueprint.
   Render wires service URLs and generates the JWT secrets.
4. Wait for the services to deploy, then verify `/health` on the backend and AI
   service URLs and open the frontend URL.

Render's free web services may sleep when idle, so the first request after a
period of inactivity can take longer.

## Full-stack multi-service deployment on Vercel

The root `vercel.json` defines three Vercel Services. Import the repository as a
single Vercel project and keep the project root at the repository root; do not
set it to `frontend`.

| Service | Root | Exposure |
| --- | --- | --- |
| `frontend` | `frontend/` | Public at `/` and all non-API paths |
| `backend` | `backend/` | Public through `/api/*` |
| `ai-service` | `ai-service/` | Internal; no public rewrite |

The `/api/(.*)` rewrite preserves the original path, matching the Express
`/api/...` routes. Browser API requests use the same origin, so leave
`NEXT_PUBLIC_API_URL` unset for this deployment. The backend-to-AI service
binding injects `AI_SERVICE_URL`; do not configure that binding variable
manually. The AI service has no inbound public route.

Configure backend secrets in Vercel's server-side environment settings:
`DATABASE_URL`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET`. Use independent,
strong secrets and never put credentials in `NEXT_PUBLIC_*` variables. Vercel
does not provision PostgreSQL: choose an external PostgreSQL provider, confirm
it supports the `pgcrypto` extension used by `database/schema.sql`, and provide
its connection URL as `DATABASE_URL`. Run the migration from a repository
checkout with the backend dependencies installed and `DATABASE_URL` set in the
local environment. `npm run migrate` applies both `database/schema.sql` and
`database/seed.sql`; review seed data and target the intended database before
running it.

The PostgreSQL pool currently allows up to 20 connections per backend process.
Serverless instances can multiply that pool, so confirm the provider's connection
limits and consider its pooler or a smaller application pool before production
traffic. Nearby search also calls the external Overpass API.

The AI service is pinned to Python 3.12 and uses NumPy, SciPy, pandas,
scikit-learn, and joblib. Its committed model artifacts and training datasets
must remain available to the service. If artifacts are missing, the current
code attempts to train and write them at runtime, which may not work in a
read-only serverless deployment. Validate dependency installation, artifact
inclusion, cold starts, and function limits on Vercel before relying on this
service in production.

Vercel Services are currently a beta feature. No hosted database connection or
Vercel deployment is verified by this repository configuration alone. See
[Vercel Services](https://vercel.com/docs/services),
[service bindings](https://vercel.com/docs/services/bindings), and
[service routing](https://vercel.com/docs/services/routing) for current
platform requirements.

Guest mode continues to store profiles and fitness data in that browser's
IndexedDB; it is not synchronized or backed up. HTTPS is required for PWA
installation and camera access. Google sign-in and Dexie Cloud sync are not
configured; they require separate provider configuration and an explicit
account-linking flow.
