# Toto Dental

Refactored structure:

- `backend/` Express API, SQLite database, routes, controllers, models
- `frontend/` static website, booking UI, admin panel, doctors page, assets

## Backend local development

```powershell
cd "\backend"
npm install
node server.js
```

Open `http://127.0.0.1:3000`.

## Backend deployment on Render

Use `backend/` as the Render root directory.

- Install command: `npm install`
- Start command: `node server.js`

To keep appointments and reception calendar data after redeploy/restart, mount a Render Persistent Disk and set:

```bash
RENDER_DISK_PATH=/var/data
```

The backend will automatically store SQLite at:

```bash
/var/data/toto-dental-data/app.db
```

You can also override the database folder manually:

```bash
DATA_DIR=/absolute/path/to/storage
```

## Frontend deployment on Vercel

Use `frontend/` as the Vercel root directory.

- Root Directory: `frontend`
- Build Command: `npm run build`

Environment variable:

```bash
VITE_API_URL=https://toto-dental.onrender.com/api
```

## One-click style deployment files

This repo now includes:

- `render.yaml` for Render backend deployment
- `frontend/vercel.json` for Vercel frontend routing/headers
- `frontend/package.json` for Vercel build step
