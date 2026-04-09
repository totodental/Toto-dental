const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

const { initDatabase } = require("./database");
const { getConfig } = require("./utils/env");
const { createError } = require("./utils/http");
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
const db = initDatabase();

const doctorModel = createDoctorModel(db);
const appointmentModel = createAppointmentModel(db);
const sessionModel = createSessionModel(db);
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

const serverApp = express();
serverApp.disable("x-powered-by");
serverApp.set("trust proxy", 1);

serverApp.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && config.allowedOrigins.has(origin)) {
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
    res.status(204).end();
    return;
  }

  next();
});

serverApp.use(express.json({ limit: "1mb" }));
serverApp.use("/api", createPublicRoutes(publicController, applyRateLimit, config));
serverApp.use("/api", createAdminRoutes(adminController, authHelpers.requireAdmin, applyRateLimit, config));

const frontendRoot = path.join(__dirname, "..", "frontend");
if (fs.existsSync(frontendRoot)) {
  serverApp.use("/assets", express.static(path.join(frontendRoot, "assets")));
  serverApp.use("/admin", express.static(path.join(frontendRoot, "admin")));
  serverApp.use("/booking", express.static(path.join(frontendRoot, "booking")));
  serverApp.use("/doctors", express.static(path.join(frontendRoot, "doctors")));
  serverApp.use(express.static(frontendRoot));

  serverApp.get("/", (req, res) => {
    res.sendFile(path.join(frontendRoot, "index.html"));
  });

  serverApp.get(["/booking", "/booking/"], (req, res) => {
    res.sendFile(path.join(frontendRoot, "booking", "index.html"));
  });

  serverApp.get(["/admin", "/admin/"], (req, res) => {
    res.sendFile(path.join(frontendRoot, "admin", "index.html"));
  });

  serverApp.get(["/doctors", "/doctors/"], (req, res) => {
    res.sendFile(path.join(frontendRoot, "doctors", "index.html"));
  });
}

serverApp.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (fs.existsSync(frontendRoot)) {
    res.status(404).sendFile(path.join(frontendRoot, "index.html"));
    return;
  }

  res.status(404).json({ error: "Not found" });
});

serverApp.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || "Server error"
  });
});

serverApp.listen(config.port, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${config.port}`);
});
