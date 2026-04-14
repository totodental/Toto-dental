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

const config = getConfig();
const database = initDatabase();

const doctorModel = createDoctorModel(database);
const appointmentModel = createAppointmentModel(database);
const sessionModel = createSessionModel(database);
const authHelpers = createAuthHelpers(config, sessionModel);
const applyRateLimit = createRateLimiter();

const publicController = createPublicController({
  doctorModel,
  appointmentModel
});

const adminController = createAdminController({
  config,
  doctorModel,
  appointmentModel,
  sessionModel,
  authHelpers
});

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

// CORS + security headers
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

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({ limit: "1mb" }));

// API routes
app.use("/api", createPublicRoutes(publicController, applyRateLimit, config));
app.use("/api", createAdminRoutes(adminController, authHelpers.requireAdmin, applyRateLimit, config));

// Root check
app.get("/", (req, res) => {
  res.send("API running...");
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || "Server error"
  });
});

// Start server
const PORT = process.env.PORT || config.port || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  if (database.type === "supabase") {
    console.log("Database provider: Supabase");
  } else {
    console.log(`SQLite database path: ${database.path}`);
  }
});
