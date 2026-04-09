const fs = require("node:fs");
const path = require("node:path");

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

  return {
    port: Number(process.env.PORT || 3000),
    sessionSecret: process.env.SESSION_SECRET || "change-this-secret",
    sessionCookie: "toto_admin_session",
    sessionMaxAgeMs: 1000 * 60 * 60 * 12,
    adminRouteId: process.env.ADMIN_ROUTE_ID || "ashdgfaskfashjfgyuyfgywegiwgu",
    adminUsername: process.env.ADMIN_USERNAME || "admin",
    adminPassword: process.env.ADMIN_PASSWORD || "admin123",
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 1000 * 60 * 10),
    loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
    publicRateLimitMax: Number(process.env.PUBLIC_RATE_LIMIT_MAX || 40),
    allowedOrigins: new Set(
      (process.env.FRONTEND_ORIGINS ||
        [
          "https://toto-dental.vercel.app",
          "http://127.0.0.1:3000",
          "http://localhost:3000",
          "http://127.0.0.1:5173",
          "http://localhost:5173"
        ].join(","))
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  };
}

module.exports = {
  getConfig
};
