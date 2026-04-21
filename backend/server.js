const express = require("express");

const { initDatabase } = require("./database");
const { getConfig } = require("./utils/env");
const { createRateLimiter } = require("./middleware/rateLimit");
const { createDoctorModel } = require("./models/doctorModel");
const { createAppointmentModel } = require("./models/appointmentModel");
const { createSessionModel } = require("./models/sessionModel");
const { createAuthHelpers } = require("./middleware/auth");
const { createPublicController } = require("./controllers/publicController");
const { createAdminController } = require("./controllers/adminController");
const { createPublicRoutes } = require("./routes/publicRoutes");
const { createAdminRoutes } = require("./routes/adminRoutes");

async function startServer() {
  const config = getConfig();
  const database = await initDatabase();
  const bookingCache = {
    ttlMs: 5000,
    entry: null,
    get() {
      if (!this.entry) return null;
      if (Date.now() > this.entry.expiresAt) {
        this.entry = null;
        return null;
      }
      return this.entry.value;
    },
    set(value) {
      this.entry = {
        value,
        expiresAt: Date.now() + this.ttlMs
      };
    },
    invalidate() {
      this.entry = null;
    }
  };

  const doctorModel = createDoctorModel(database);
  const appointmentModel = createAppointmentModel(database);
  const sessionModel = createSessionModel(database);
  const authHelpers = createAuthHelpers(config, sessionModel);
  const applyRateLimit = createRateLimiter();

  const publicController = createPublicController({
    doctorModel,
    appointmentModel,
    bookingCache
  });

  const adminController = createAdminController({
    config,
    doctorModel,
    appointmentModel,
    sessionModel,
    authHelpers,
    bookingCache
  });

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin && config.isAllowedOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Vary", "Origin");
    }

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    next();
  });

  app.use(express.json({ limit: "1mb" }));
  app.use("/api", createPublicRoutes(publicController, applyRateLimit, config));
  app.use("/api", createAdminRoutes(adminController, authHelpers.requireAdmin, applyRateLimit, config));

  app.get("/", (req, res) => {
    res.send("API running...");
  });

  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      error: statusCode >= 500 && process.env.NODE_ENV === "production"
        ? "Server error"
        : err.message || "Server error"
    });
  });

  const PORT = process.env.PORT || config.port || 5000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    if (database.type === "supabase") {
      console.log("Database provider: Supabase");
    } else {
      console.log(`SQLite database path: ${database.path}`);
    }
  });
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
