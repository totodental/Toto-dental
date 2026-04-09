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

## Frontend deployment on Vercel

Use the repository root for Vercel.
The frontend files are served from `frontend/`.

Build command:

```bash
npm run build
```

Environment variable:

```bash
VITE_API_URL=https://toto-dental.onrender.com/api
```
