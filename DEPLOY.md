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

## Frontend-only deployment on Vercel

Import the repository into Vercel and set the project root directory to
`frontend`. Guest mode works locally in the browser: profiles and fitness data
stay in that browser's IndexedDB and are not synchronized or backed up.

Registered-account features use the Express API, PostgreSQL, and FastAPI AI
service. They require the full stack; a frontend-only deployment does not
provide those services. For a separately hosted API, set `NEXT_PUBLIC_API_URL`
to its public URL as a Vercel build-time environment variable.

HTTPS is required for PWA installation and camera access. Keep JWT and database
credentials in server-side environment variables; never put them in
`NEXT_PUBLIC_*` variables or commit real credentials. Google sign-in and Dexie
Cloud sync are not configured; they require separate provider configuration
and an explicit account-linking flow.
