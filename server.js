const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const cors = require("cors");

const { initDatabase } = require("./backend/database");

const app = express();

// ✅ CORS FIX (хамгийн чухал)
app.use(cors({
  origin: ["https://toto-dental.vercel.app"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.options("*", cors());

// middleware
app.use(express.json({ limit: "1mb" }));

// security headers
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// ENV load
function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile();

// CONFIG
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;

const SESSION_SECRET = process.env.SESSION_SECRET || "secret";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12;

// DB
const db = initDatabase();

// ================= API =================

// ✅ PUBLIC
app.get("/api/public/booking", (req, res) => {
  const doctors = db.prepare(`
    SELECT id, name, role, branch, hours, availability, note
    FROM doctors
  `).all();

  res.json({ doctors });
});

// ================= STATIC =================
app.use("/assets", express.static(path.join(ROOT, "assets")));
app.use("/admin", express.static(path.join(ROOT, "admin")));
app.use("/booking", express.static(path.join(ROOT, "booking")));
app.use(express.static(ROOT));

// ROUTES
app.get("/", (req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

app.get("/booking/", (req, res) => {
  res.sendFile(path.join(ROOT, "booking", "index.html"));
});

// ================= ERROR =================
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    error: err.message || "Server error"
  });
});

// START
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});