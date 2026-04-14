# Toto Dental

Production structure:

- `backend/` Express API, persistent database layer, routes, controllers, models
- `frontend/` static website, booking UI, admin panel, doctors page, assets

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

Recommended environment variables:

```bash
PORT=3000
SESSION_SECRET=change-this-secret
ADMIN_ROUTE_ID=your-private-admin-route
ADMIN_USERNAME=admin
ADMIN_PASSWORD=strong-password
FRONTEND_ORIGINS=https://toto-dental.vercel.app,https://toto-dental-hjbv.vercel.app
RAILWAY_VOLUME_MOUNT_PATH=/data
```

Production note:

- Set `FRONTEND_ORIGINS` to the exact frontend URLs you control. Wildcard Vercel preview origins are no longer trusted.
- In production, the API logs a warning unless `SESSION_SECRET`, `ADMIN_ROUTE_ID`, `ADMIN_USERNAME`, and either `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH` are set to non-default secure values.
- If you want the deployment to fail hard until all secure values are configured, set `STRICT_PRODUCTION_CONFIG=true`.
- If you prefer not to store a plain admin password in hosting settings, set `ADMIN_PASSWORD_HASH` instead.

To keep appointments and reception calendar data after redeploy/restart, attach a Railway volume. The backend will automatically store SQLite under:

```bash
/data/toto-dental-data/app.db
```

You can also override storage manually:

```bash
SQLITE_DB_PATH=/absolute/path/to/app.db
```

or

```bash
DATA_DIR=/absolute/path/to/storage
```

If you deploy with Render, set:

```bash
DATA_DIR=/var/data/toto-dental-data
```

## Frontend deployment on Vercel

Use `frontend/` as the Vercel root directory.

- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`

The frontend uses `/api` and Vercel rewrites requests to Railway.

## Supabase-ready migration

If you want to replace SQLite with Supabase Postgres later, the backend now auto-switches to Supabase when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. Create the schema from:

- `backend/sql/supabase-schema.sql`

Recommended future variables:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=
```

### Supabase setup

1. Create a new Supabase project.
2. Open `SQL Editor` and run [backend/sql/supabase-schema.sql](/C:/Users/1021019180/Documents/Code/Toto%20Dental/backend/sql/supabase-schema.sql:1).
3. In `Project Settings -> API`, copy:
   - `Project URL` -> `SUPABASE_URL`
   - `service_role` key -> `SUPABASE_SERVICE_ROLE_KEY`
4. In Railway `Variables`, add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Keep these existing Railway variables too:
   - `SESSION_SECRET`
   - `ADMIN_ROUTE_ID`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD` or `ADMIN_PASSWORD_HASH`
   - `FRONTEND_ORIGINS`
6. Redeploy Railway. On startup the server log will say `Database provider: Supabase`.
7. After confirming new appointments save correctly, you can keep SQLite only as rollback/fallback.

### Optional data migration from SQLite

If you already have production data in SQLite, export these tables and import them into Supabase in this order:

1. `doctors`
2. `doctor_slots`
3. `appointments`
4. `admin_sessions`

## Included deployment files

- `render.yaml` legacy Render blueprint
- `frontend/vercel.json` Vercel frontend routing and headers
- `frontend/package.json` frontend build step

## Client handoff checklist

- Backend deploy has persistent volume attached and `RAILWAY_VOLUME_MOUNT_PATH` configured.
- Production secrets are set with non-default values.
- `FRONTEND_ORIGINS` contains only the final Vercel production domain and any intentionally approved preview domains.
- Frontend is rebuilt so `frontend/dist/` matches the latest source before final deployment.
