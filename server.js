const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

const { initDatabase } = require("./backend/database");

const serverApp = express();
serverApp.disable("x-powered-by");
serverApp.set("trust proxy", 1);

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

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

loadEnvFile();

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret";
const SESSION_COOKIE = "toto_admin_session";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12;
const ADMIN_ROUTE_ID = process.env.ADMIN_ROUTE_ID || "ashdgfaskfashjfgyuyfgywegiwgu";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const allowedOrigins = new Set(
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
);

const db = initDatabase();

serverApp.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
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

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((acc, pair) => {
    const [key, ...rest] = pair.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function signValue(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function createSessionToken() {
  return crypto.randomBytes(24).toString("hex");
}

function setSessionCookie(res, token) {
  const isProduction = process.env.NODE_ENV === "production";
  const cookieParts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`,
    isProduction ? "Secure" : "",
    isProduction ? "SameSite=None" : "SameSite=Lax"
  ].filter(Boolean);

  res.setHeader("Set-Cookie", cookieParts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`);
}

function getDoctorById(doctorId) {
  return db.prepare(`
    SELECT id, name, role, branch, hours, availability, note
    FROM doctors
    WHERE id = ?
  `).get(doctorId);
}

function normalizeDate(input) {
  if (!input || typeof input !== "string") {
    throw createError(400, "Өдөр буруу байна.");
  }

  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[1]}-${match[2]}`;
  }

  throw createError(400, "Өдрийн формат буруу байна.");
}

function normalizeTime(input) {
  if (!input || typeof input !== "string") {
    throw createError(400, "Цаг буруу байна.");
  }

  const trimmed = input.trim().toUpperCase();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) {
    throw createError(400, "Цагийн формат буруу байна.");
  }

  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3];

  if (meridiem === "AM") {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function mapAppointment(row) {
  return {
    id: row.id,
    patientName: row.patient_name,
    phone: row.phone,
    doctorId: row.doctor_id,
    branch: row.branch,
    date: row.appointment_date,
    time: row.appointment_time,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function listAppointments() {
  return db.prepare(`
    SELECT id, patient_name, phone, doctor_id, branch, appointment_date, appointment_time, notes, status, created_at, updated_at
    FROM appointments
    ORDER BY datetime(created_at) DESC, id DESC
  `).all().map(mapAppointment);
}

function getAppointmentById(id) {
  const row = db.prepare(`
    SELECT id, patient_name, phone, doctor_id, branch, appointment_date, appointment_time, notes, status, created_at, updated_at
    FROM appointments
    WHERE id = ?
  `).get(id);

  return row ? mapAppointment(row) : null;
}

function ensureNoConfirmedConflict(payload, ignoreId = "") {
  if (!["confirmed", "completed"].includes(payload.status)) return;

  const conflict = db.prepare(`
    SELECT id
    FROM appointments
    WHERE doctor_id = ?
      AND appointment_date = ?
      AND appointment_time = ?
      AND status IN ('confirmed', 'completed')
      AND id != ?
    LIMIT 1
  `).get(payload.doctorId, payload.date, payload.time, ignoreId || "");

  if (conflict) {
    throw createError(409, "Энэ эмч дээр энэ цаг аль хэдийн баталгаажсан байна.");
  }
}

function buildAppointmentPayload(input, existing = null) {
  const patientName = (input.patientName ?? existing?.patientName ?? "").trim();
  const phone = (input.phone ?? existing?.phone ?? "").trim();
  const doctorId = input.doctorId ?? existing?.doctorId ?? "";
  const notes = (input.notes ?? existing?.notes ?? "").trim();
  const status = input.status ?? existing?.status ?? "pending";
  const date = normalizeDate(input.date ?? existing?.date ?? "");
  const time = normalizeTime(input.time ?? existing?.time ?? "");

  if (!patientName) throw createError(400, "Өвчтөний нэр шаардлагатай.");
  if (!phone) throw createError(400, "Утасны дугаар шаардлагатай.");

  const doctor = getDoctorById(doctorId);
  if (!doctor) throw createError(400, "Эмч олдсонгүй.");

  if (!["pending", "confirmed", "cancelled", "completed"].includes(status)) {
    throw createError(400, "Төлөв буруу байна.");
  }

  return {
    patientName,
    phone,
    doctorId: doctor.id,
    branch: doctor.branch,
    date,
    time,
    notes,
    status
  };
}

function requireAdmin(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) {
    next(createError(401, "Нэвтрэх шаардлагатай."));
    return;
  }

  const signature = signValue(token);
  const session = db.prepare(`
    SELECT token, signature, created_at
    FROM admin_sessions
    WHERE token = ? AND signature = ?
  `).get(token, signature);

  if (!session) {
    clearSessionCookie(res);
    next(createError(401, "Нэвтрэх шаардлагатай."));
    return;
  }

  const age = Date.now() - new Date(session.created_at).getTime();
  if (Number.isNaN(age) || age > SESSION_MAX_AGE_MS) {
    db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
    clearSessionCookie(res);
    next(createError(401, "Session хугацаа дууссан байна."));
    return;
  }

  req.adminSession = { token };
  next();
}

function buildDoctorsResponse() {
  const doctors = db.prepare(`
    SELECT id, name, role, branch, hours, availability, note
    FROM doctors
    ORDER BY branch, name
  `).all();

  const slotRows = db.prepare(`
    SELECT doctor_id, label, slot_date, slot_time
    FROM doctor_slots
    ORDER BY slot_date, slot_time
  `).all();

  const bookedRows = db.prepare(`
    SELECT doctor_id, appointment_date, appointment_time
    FROM appointments
    WHERE status IN ('confirmed', 'completed')
  `).all();

  const bookedSet = new Set(
    bookedRows.map((row) => `${row.doctor_id}|${row.appointment_date}|${row.appointment_time}`)
  );

  return doctors.map((doctor) => {
    const doctorSlots = slotRows.filter((slot) => slot.doctor_id === doctor.id);
    const grouped = new Map();

    doctorSlots.forEach((slot) => {
      const key = `${slot.slot_date}|${slot.label}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          label: slot.label,
          date: slot.slot_date,
          times: []
        });
      }

      if (!bookedSet.has(`${doctor.id}|${slot.slot_date}|${slot.slot_time}`)) {
        grouped.get(key).times.push(slot.slot_time);
      }
    });

    return {
      ...doctor,
      slots: Array.from(grouped.values()).filter((slot) => slot.times.length > 0)
    };
  });
}

serverApp.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

serverApp.get("/api/public/booking", (req, res) => {
  res.json({ doctors: buildDoctorsResponse() });
});

serverApp.post("/api/public/requests", (req, res, next) => {
  try {
    const payload = buildAppointmentPayload({ ...req.body, status: "pending" });
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO appointments (
        id, patient_name, phone, doctor_id, branch, appointment_date, appointment_time, notes, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      payload.patientName,
      payload.phone,
      payload.doctorId,
      payload.branch,
      payload.date,
      payload.time,
      payload.notes,
      payload.status,
      now,
      now
    );

    res.status(201).json({ ok: true, appointment: getAppointmentById(id) });
  } catch (error) {
    next(error);
  }
});

serverApp.get("/api/admin/session", (req, res) => {
  const routeValid = (req.query.id || "") === ADMIN_ROUTE_ID;
  if (!routeValid) {
    res.json({ routeValid: false, authenticated: false });
    return;
  }

  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) {
    res.json({ routeValid: true, authenticated: false });
    return;
  }

  const signature = signValue(token);
  const session = db.prepare(`
    SELECT token
    FROM admin_sessions
    WHERE token = ? AND signature = ?
  `).get(token, signature);

  res.json({ routeValid: true, authenticated: Boolean(session) });
});

serverApp.post("/api/admin/login", (req, res, next) => {
  try {
    const { routeId = "", username = "", password = "" } = req.body || {};

    if (routeId !== ADMIN_ROUTE_ID) {
      throw createError(403, "Admin link буруу байна.");
    }

    if (username.trim() !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      throw createError(401, "Invalid credentials");
    }

    const token = createSessionToken();
    const signature = signValue(token);
    const now = new Date().toISOString();

    db.prepare("DELETE FROM admin_sessions WHERE created_at < ?")
      .run(new Date(Date.now() - SESSION_MAX_AGE_MS).toISOString());

    db.prepare(`
      INSERT INTO admin_sessions (token, signature, created_at)
      VALUES (?, ?, ?)
    `).run(token, signature, now);

    setSessionCookie(res, token);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

serverApp.post("/api/admin/logout", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(req.adminSession.token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

serverApp.get("/api/admin/dashboard", requireAdmin, (req, res) => {
  const doctors = db.prepare(`
    SELECT id, name, role, branch, hours, availability, note
    FROM doctors
    ORDER BY branch, name
  `).all();

  res.json({
    doctors,
    requests: listAppointments()
  });
});

serverApp.post("/api/admin/appointments", requireAdmin, (req, res, next) => {
  try {
    const payload = buildAppointmentPayload(req.body || {});
    ensureNoConfirmedConflict(payload);

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO appointments (
        id, patient_name, phone, doctor_id, branch, appointment_date, appointment_time, notes, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      payload.patientName,
      payload.phone,
      payload.doctorId,
      payload.branch,
      payload.date,
      payload.time,
      payload.notes,
      payload.status,
      now,
      now
    );

    res.status(201).json({ ok: true, appointment: getAppointmentById(id) });
  } catch (error) {
    next(error);
  }
});

serverApp.patch("/api/admin/appointments/:id", requireAdmin, (req, res, next) => {
  try {
    const existing = getAppointmentById(req.params.id);
    if (!existing) throw createError(404, "Захиалга олдсонгүй.");

    const payload = buildAppointmentPayload(req.body || {}, existing);
    ensureNoConfirmedConflict(payload, existing.id);

    db.prepare(`
      UPDATE appointments
      SET patient_name = ?, phone = ?, doctor_id = ?, branch = ?, appointment_date = ?, appointment_time = ?, notes = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      payload.patientName,
      payload.phone,
      payload.doctorId,
      payload.branch,
      payload.date,
      payload.time,
      payload.notes,
      payload.status,
      new Date().toISOString(),
      existing.id
    );

    res.json({ ok: true, appointment: getAppointmentById(existing.id) });
  } catch (error) {
    next(error);
  }
});

serverApp.delete("/api/admin/appointments/:id", requireAdmin, (req, res, next) => {
  try {
    const result = db.prepare("DELETE FROM appointments WHERE id = ?").run(req.params.id);
    if (!result.changes) throw createError(404, "Захиалга олдсонгүй.");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

serverApp.delete("/api/admin/requests/:id", requireAdmin, (req, res, next) => {
  try {
    const result = db.prepare("DELETE FROM appointments WHERE id = ?").run(req.params.id);
    if (!result.changes) throw createError(404, "Хүсэлт олдсонгүй.");
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

serverApp.delete("/api/admin/requests", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM appointments").run();
  res.status(204).end();
});

serverApp.patch("/api/admin/doctors/:id", requireAdmin, (req, res, next) => {
  try {
    const availability = req.body?.availability;
    if (!["available", "limited", "busy"].includes(availability)) {
      throw createError(400, "Эмчийн төлөв буруу байна.");
    }

    const result = db.prepare(`
      UPDATE doctors
      SET availability = ?
      WHERE id = ?
    `).run(availability, req.params.id);

    if (!result.changes) throw createError(404, "Эмч олдсонгүй.");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

serverApp.use("/assets", express.static(path.join(ROOT, "assets")));
serverApp.use("/admin", express.static(path.join(ROOT, "admin")));
serverApp.use("/booking", express.static(path.join(ROOT, "booking")));
serverApp.use(express.static(ROOT));

serverApp.get("/", (req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

serverApp.get("/booking", (req, res) => {
  res.sendFile(path.join(ROOT, "booking", "index.html"));
});

serverApp.get("/booking/", (req, res) => {
  res.sendFile(path.join(ROOT, "booking", "index.html"));
});

serverApp.get("/admin", (req, res) => {
  res.sendFile(path.join(ROOT, "admin", "index.html"));
});

serverApp.get("/admin/", (req, res) => {
  res.sendFile(path.join(ROOT, "admin", "index.html"));
});

serverApp.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.status(404).sendFile(path.join(ROOT, "index.html"));
});

serverApp.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || "Server error"
  });
});

serverApp.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
