# Toto Dental

Landing page plus appointment booking backend for Toto Dental.

## Local development

```powershell
cd "C:\Users\1021019180\Documents\Code\Toto Dental"
node .\server.js
```

Open `http://127.0.0.1:3000`.

## Backend stack

- Node.js + Express
- SQLite via `better-sqlite3`
- Static frontend served by the same Node app

Appointment data is stored in `data/app.db` and is created automatically on first run.

## Environment variables

- `PORT`
- `ADMIN_ROUTE_ID`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

## Production deployment

Deploy this project to a Node host such as Railway, Render, Fly.io, or a VPS.

1. Push this folder to a Git repository.
2. Create the environment variables from `.env.example`.
3. Set the start command to `node server.js`.
4. Attach your custom domain.
5. Enable HTTPS on the hosting platform.

## Files

- `index.html` main page
- `style.css` styles
- `script.js` patient booking UI
- `server.js` API and static server
- `backend/database.js` SQLite schema and seed data
- `admin/` private reception dashboard
- `assets/` images
