# Toto Dental

Production structure:

- `backend/` Express API, persistent database layer, routes, controllers, models
- `frontend/` static website, booking UI, admin panel, doctors page, assets

## Production URLs

- Frontend: `https://toto-dental.vercel.app/`
- Backend API: `https://toto-dental-production-3d62.up.railway.app`
- Future Supabase project URL: `https://awnizykbxxhvqfooxuvy.supabase.co`

## Backend local development

```powershell
cd ".\backend"
npm install
node server.js
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Backend deployment on Railway

Use `backend/` as the Railway root directory.

- Install command: `npm install`
- Start command: `node server.js`

Recommended Railway variables:

```bash
PORT=3000
NODE_ENV=production
SESSION_SECRET=change-this-secret
ADMIN_ROUTE_ID=your-private-admin-route
ADMIN_USERNAME=admin
ADMIN_PASSWORD=strong-password
FRONTEND_ORIGINS=https://toto-dental.vercel.app,https://totodental.mn,https://www.totodental.mn
RAILWAY_VOLUME_MOUNT_PATH=/data
```

Production note:

- `FRONTEND_ORIGINS` should contain only frontend URLs you control.
- Wildcard Vercel preview origins are not trusted by default.
- In production, the API will fail to start unless `SESSION_SECRET`, `ADMIN_ROUTE_ID`, `ADMIN_USERNAME`, and either `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH` are set to non-default secure values.
- If you prefer not to store a plain admin password in hosting settings, set `ADMIN_PASSWORD_HASH` instead.
- Keep `SUPABASE_SERVICE_ROLE_KEY` only in Railway/backend variables. Never add it to Vercel/frontend variables.

To keep appointments and reception calendar data after redeploy/restart, attach a Railway volume. The backend stores SQLite under:

```bash
/data/toto-dental-data/app.db
```

You can override storage manually:

```bash
SQLITE_DB_PATH=/absolute/path/to/app.db
```

or:

```bash
DATA_DIR=/absolute/path/to/storage
```

## Frontend deployment on Vercel

Use `frontend/` as the Vercel root directory.

- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`

The frontend uses `/api` and Vercel rewrites requests to Railway:

```text
/api/* -> https://toto-dental-production-3d62.up.railway.app/api/*
```

## Supabase-ready migration

The backend currently works with SQLite by default. It auto-switches to Supabase when both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.

Create the Supabase schema from:

- `backend/sql/supabase-schema.sql`

Future Supabase variables:

```bash
SUPABASE_URL=https://awnizykbxxhvqfooxuvy.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=
```

### Supabase setup

1. Open the Supabase project.
2. Open `SQL Editor` and run `backend/sql/supabase-schema.sql`.
3. In `Project Settings -> API`, copy:
   - `Project URL` -> `SUPABASE_URL`
   - `service_role` key -> `SUPABASE_SERVICE_ROLE_KEY`
4. In Railway `Variables`, add Supabase variables only when you are ready to switch the backend from SQLite to Supabase:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Keep these Railway variables too:
   - `SESSION_SECRET`
   - `ADMIN_ROUTE_ID`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH`
   - `FRONTEND_ORIGINS`
6. Redeploy Railway. On startup the server log will say `Database provider: Supabase`.
7. After confirming new appointments save correctly, SQLite can remain as rollback/fallback.

### Optional data migration from SQLite

If you already have production data in SQLite, export these tables and import them into Supabase in this order:

1. `doctors`
2. `doctor_slots`
3. `appointments`
4. `admin_sessions`

## Included deployment files

- `render.yaml` legacy Render blueprint
- `vercel.json` root Vercel routing for monorepo-style deployment
- `frontend/vercel.json` Vercel frontend routing and headers
- `frontend/package.json` frontend build step

## Client handoff checklist

- Backend deploy has persistent volume attached and `RAILWAY_VOLUME_MOUNT_PATH` configured.
- Production secrets are set with non-default values.
- `FRONTEND_ORIGINS` contains `https://toto-dental.vercel.app`, `https://totodental.mn`, and `https://www.totodental.mn`.
- Vercel rewrites `/api/*` to `https://toto-dental-production-3d62.up.railway.app/api/*`.
- Frontend is rebuilt so `frontend/dist/` matches the latest source before final deployment.
- Admin and public pages have CSP/security headers, and user-submitted content is escaped before rendering.
