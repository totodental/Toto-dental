const fs = require("node:fs");
const path = require("node:path");

function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function isAllowedOrigin(origin, allowedOrigins) {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;
  return allowedOrigins.has(normalizedOrigin);
}

function ensureProductionReady(config) {
  if (process.env.NODE_ENV !== "production") return;

  const missing = [];

  if (!process.env.SESSION_SECRET || config.sessionSecret === "change-this-secret") {
    missing.push("SESSION_SECRET");
  }

  if (!process.env.ADMIN_ROUTE_ID || config.adminRouteId === "ashdgfaskfashjfgyuyfgywegiwgu") {
    missing.push("ADMIN_ROUTE_ID");
  }

  if (!process.env.ADMIN_USERNAME || config.adminUsername === "admin") {
    missing.push("ADMIN_USERNAME");
  }

  const hasPasswordHash = Boolean(process.env.ADMIN_PASSWORD_HASH);
  const hasStrongPassword = Boolean(process.env.ADMIN_PASSWORD) && config.adminPassword !== "admin123";

  if (!hasPasswordHash && !hasStrongPassword) {
    missing.push("ADMIN_PASSWORD or ADMIN_PASSWORD_HASH");
  }

  if (missing.length) {
    const message = `Production configuration is incomplete. Set secure values for: ${missing.join(", ")}`;
    throw new Error(message);
  }
}

function loadEnvFiles() {
  const candidates = [
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", "..", ".env")
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;

    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;

      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function getConfig() {
  loadEnvFiles();

  const allowedOrigins = new Set(
    (process.env.FRONTEND_ORIGINS ||
      [
        "https://toto-dental.vercel.app",
        "https://totodental.mn",
        "https://www.totodental.mn",
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://localhost:5173"
      ].join(","))
      .split(",")
      .map((item) => normalizeOrigin(item))
      .filter(Boolean)
  );

  const config = {
    port: Number(process.env.PORT || 3000),
    sessionSecret: process.env.SESSION_SECRET || "D2uaz6F838SDucf9TNRwe",
    sessionCookie: "toto_admin_session",
    sessionMaxAgeMs: 1000 * 60 * 60 * 12,
    adminRouteId: process.env.ADMIN_ROUTE_ID || "b73fd8c5-4a70-49a3-bed1-86c24799950d",
    adminUsername: process.env.ADMIN_USERNAME || "toto-admin",
    adminPassword: process.env.ADMIN_PASSWORD || "TotoDental@2026-Strong-Admin!",
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 1000 * 60 * 10),
    loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
    publicRateLimitMax: Number(process.env.PUBLIC_RATE_LIMIT_MAX || 40),
    allowedOrigins,
    isAllowedOrigin: (origin) => isAllowedOrigin(origin, allowedOrigins)
  };

  ensureProductionReady(config);

  return config;
}

module.exports = {
  getConfig
};
