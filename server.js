const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

const cors = require("cors");

const app = express();  // 👈 ЭНЭ ДУТАЖ БАЙНА

app.use(cors());

const { initDatabase } = require("./backend/database");

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;

const ADMIN_ROUTE_ID = process.env.ADMIN_ROUTE_ID || "ashdgfaskfashjfgyuyfgywegiwgu";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "reception";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "TotoAdmin2026!";
const SESSION_SECRET = process.env.SESSION_SECRET || "toto-dental-session-secret";
const SESSION_COOKIE = "toto_admin_session";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12;

const app = express();
const db = initDatabase();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

const getDoctorStmt = db.prepare(`
  SELECT id, name, role, branch, hours, availability, note
  FROM doctors
  WHERE id = ?
`);

const getDoctorsStmt = db.prepare(`
  SELECT id, name, role, branch, hours, availability, note
  FROM doctors
  ORDER BY branch, name
`);

const getDoctorSlotsStmt = db.prepare(`
  SELECT doctor_id, label, slot_date, slot_time
  FROM doctor_slots
  ORDER BY slot_date, slot_time
`);

const getDoctorSlotsByDoctorStmt = db.prepare(`
  SELECT doctor_id, label, slot_date, slot_time
  FROM doctor_slots
  WHERE doctor_id = ?
  ORDER BY slot_date, slot_time
`);

const getLiveAppointmentsStmt = db.prepare(`
  SELECT doctor_id, appointment_date, appointment_time
  FROM appointments
  WHERE status IN ('confirmed', 'completed')
`);

const getAppointmentsStmt = db.prepare(`
  SELECT
    a.id,
    a.patient_name AS patientName,
    a.phone,
    a.doctor_id AS doctorId,
    d.name AS doctorName,
    a.branch,
    a.appointment_date AS date,
    a.appointment_time AS time,
    a.notes,
    a.status,
    a.created_at AS createdAt,
    a.updated_at AS updatedAt
  FROM appointments a
  JOIN doctors d ON d.id = a.doctor_id
  ORDER BY a.appointment_date ASC, a.appointment_time ASC, a.created_at DESC
`);

const insertAppointmentStmt = db.prepare(`
  INSERT INTO appointments (
    id,
    patient_name,
    phone,
    doctor_id,
    branch,
    appointment_date,
    appointment_time,
    notes,
    status,
    created_at,
    updated_at
  ) VALUES (
    @id,
    @patient_name,
    @phone,
    @doctor_id,
    @branch,
    @appointment_date,
    @appointment_time,
    @notes,
    @status,
    @created_at,
    @updated_at
  )
`);

const getAppointmentByIdStmt = db.prepare(`
  SELECT
    id,
    patient_name AS patientName,
    phone,
    doctor_id AS doctorId,
    branch,
    appointment_date AS date,
    appointment_time AS time,
    notes,
    status,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM appointments
  WHERE id = ?
`);

const updateAppointmentStatusStmt = db.prepare(`
  UPDATE appointments
  SET status = @status, updated_at = @updated_at
  WHERE id = @id
`);

const deleteAppointmentStmt = db.prepare(`
  DELETE FROM appointments
  WHERE id = ?
`);

const clearAppointmentsStmt = db.prepare(`
  DELETE FROM appointments
`);

const updateDoctorAvailabilityStmt = db.prepare(`
  UPDATE doctors
  SET availability = @availability
  WHERE id = @id
`);

const deleteSessionStmt = db.prepare(`
  DELETE FROM admin_sessions
  WHERE token = ?
`);

const insertSessionStmt = db.prepare(`
  INSERT INTO admin_sessions (token, signature, created_at)
  VALUES (@token, @signature, @created_at)
`);

const getSessionStmt = db.prepare(`
  SELECT token, signature, created_at
  FROM admin_sessions
  WHERE token = ?
`);

const pruneSessionsStmt = db.prepare(`
  DELETE FROM admin_sessions
  WHERE created_at < ?
`);

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || "";
  return cookieHeader.split(";").reduce((acc, item) => {
    const [rawKey, ...rest] = item.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function signToken(token) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(token).digest("hex");
}

function createSession() {
  const token = crypto.randomBytes(24).toString("hex");
  const signature = signToken(token);
  const createdAt = new Date().toISOString();
  insertSessionStmt.run({ token, signature, created_at: createdAt });
  return `${token}.${signature}`;
}

function clearSessionCookie(res) {
  res.cookie(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0
  });
}

function setSessionCookie(res, value) {
  res.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: SESSION_MAX_AGE_MS
  });
}

function deleteSessionByToken(token) {
  if (token) {
    deleteSessionStmt.run(token);
  }
}

function getSessionToken(req) {
  const cookies = parseCookies(req);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  const [token, signature] = raw.split(".");
  if (!token || !signature) return null;
  if (signToken(token) !== signature) return null;

  const row = getSessionStmt.get(token);
  if (!row || row.signature !== signature) return null;

  const createdAtMs = Date.parse(row.created_at);
  if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > SESSION_MAX_AGE_MS) {
    deleteSessionByToken(token);
    return null;
  }

  return token;
}

function isAdminAuthorized(req) {
  return Boolean(getSessionToken(req));
}

function requireAdmin(req, res, next) {
  if (!isAdminAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

function getDoctorsWithSlots() {
  const doctors = getDoctorsStmt.all();
  const rawSlots = getDoctorSlotsStmt.all();
  const bookedRows = getLiveAppointmentsStmt.all();
  const booked = new Set(bookedRows.map((row) => `${row.doctor_id}|${row.appointment_date}|${row.appointment_time}`));

  return doctors.map((doctor) => {
    const grouped = new Map();
    for (const slot of rawSlots) {
      if (slot.doctor_id !== doctor.id) continue;
      const slotKey = `${doctor.id}|${slot.slot_date}|${slot.slot_time}`;
      if (booked.has(slotKey)) continue;
      if (!grouped.has(slot.slot_date)) {
        grouped.set(slot.slot_date, {
          label: slot.label,
          date: slot.slot_date,
          times: []
        });
      }
      grouped.get(slot.slot_date).times.push(slot.slot_time);
    }

    return {
      ...doctor,
      slots: Array.from(grouped.values())
    };
  });
}

function getAppointments(filters = {}) {
  const rows = getAppointmentsStmt.all();
  return rows.filter((row) => {
    if (filters.doctorId && row.doctorId !== filters.doctorId) return false;
    if (filters.date && row.date !== filters.date) return false;
    if (filters.status && row.status !== filters.status) return false;
    return true;
  });
}

function getAdminPayload(filters = {}) {
  return {
    doctors: getDoctorsWithSlots().map((doctor) => ({
      id: doctor.id,
      name: doctor.name,
      role: doctor.role,
      branch: doctor.branch,
      hours: doctor.hours,
      availability: doctor.availability,
      note: doctor.note,
      slots: doctor.slots
    })),
    requests: getAppointments(filters)
  };
}

function normalizeAppointmentPayload(body) {
  return {
    patientName: String(body.patientName || "").trim(),
    phone: String(body.phone || "").trim(),
    doctorId: String(body.doctorId || "").trim(),
    branch: String(body.branch || "").trim(),
    date: String(body.date || "").trim(),
    time: String(body.time || "").trim(),
    notes: String(body.notes || "").trim()
  };
}

function ensureAppointmentInput(payload) {
  const requiredFields = ["patientName", "phone", "doctorId", "date", "time"];
  const missingField = requiredFields.find((field) => !payload[field]);
  if (missingField) {
    const error = new Error(`Missing field: ${missingField}`);
    error.statusCode = 400;
    throw error;
  }
}

function ensureDoctorAndSlot(payload) {
  const forConfirmation = payload.status === "confirmed" || payload.status === "completed";
  const doctor = getDoctorStmt.get(payload.doctorId);
  if (!doctor) {
    const error = new Error("Selected doctor not found");
    error.statusCode = 400;
    throw error;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    const error = new Error("Invalid appointment date");
    error.statusCode = 400;
    throw error;
  }

  if (!/^\d{2}:\d{2}$/.test(payload.time)) {
    const error = new Error("Invalid appointment time");
    error.statusCode = 400;
    throw error;
  }

  if (!forConfirmation && doctor.availability === "busy") {
    const error = new Error("This doctor is currently unavailable");
    error.statusCode = 409;
    throw error;
  }

  return doctor;
}

function ensureNoConfirmedConflict(payload, excludeAppointmentId = "") {
  if (!["confirmed", "completed"].includes(payload.status)) return;

  const conflictStmt = db.prepare(`
    SELECT id
    FROM appointments
    WHERE doctor_id = ?
      AND appointment_date = ?
      AND appointment_time = ?
      AND status IN ('confirmed', 'completed')
      AND id <> ?
    LIMIT 1
  `);

  const conflict = conflictStmt.get(
    payload.doctorId,
    payload.date,
    payload.time,
    excludeAppointmentId || ""
  );

  if (conflict) {
    const error = new Error("This time slot has already been booked");
    error.statusCode = 409;
    throw error;
  }
}

function createAppointment(payload) {
  ensureAppointmentInput(payload);
  const doctor = ensureDoctorAndSlot(payload);
  ensureNoConfirmedConflict(payload);

  const appointment = {
    id: crypto.randomUUID(),
    patient_name: payload.patientName,
    phone: payload.phone,
    doctor_id: payload.doctorId,
    branch: doctor.branch,
    appointment_date: payload.date,
    appointment_time: payload.time,
    notes: payload.notes,
    status: payload.status || "pending",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    insertAppointmentStmt.run(appointment);
  } catch (error) {
    if (
      error.code === "SQLITE_CONSTRAINT_UNIQUE" ||
      error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
      String(error.message).includes("UNIQUE constraint failed") ||
      String(error.message).includes("idx_appointments_unique_live")
    ) {
      const conflict = new Error("This time slot has already been booked");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }

  return getAppointmentByIdStmt.get(appointment.id);
}

function updateAppointment(id, patch) {
  const existing = getAppointmentByIdStmt.get(id);
  if (!existing) {
    const error = new Error("Appointment not found");
    error.statusCode = 404;
    throw error;
  }

  const next = {
    patientName: patch.patientName !== undefined ? String(patch.patientName).trim() : existing.patientName,
    phone: patch.phone !== undefined ? String(patch.phone).trim() : existing.phone,
    doctorId: patch.doctorId !== undefined ? String(patch.doctorId).trim() : existing.doctorId,
    branch: patch.branch !== undefined ? String(patch.branch).trim() : existing.branch,
    date: patch.date !== undefined ? String(patch.date).trim() : existing.date,
    time: patch.time !== undefined ? String(patch.time).trim() : existing.time,
    notes: patch.notes !== undefined ? String(patch.notes).trim() : existing.notes,
    status: patch.status !== undefined ? String(patch.status).trim() : existing.status
  };

  if (!["pending", "confirmed", "cancelled", "completed"].includes(next.status)) {
    const error = new Error("Invalid appointment status");
    error.statusCode = 400;
    throw error;
  }

  ensureAppointmentInput(next);
  const doctor = ensureDoctorAndSlot(next);
  next.branch = doctor.branch;
  ensureNoConfirmedConflict(next, id);

  const updateStmt = db.prepare(`
    UPDATE appointments
    SET
      patient_name = @patient_name,
      phone = @phone,
      doctor_id = @doctor_id,
      branch = @branch,
      appointment_date = @appointment_date,
      appointment_time = @appointment_time,
      notes = @notes,
      status = @status,
      updated_at = @updated_at
    WHERE id = @id
  `);

  try {
    updateStmt.run({
      id,
      patient_name: next.patientName,
      phone: next.phone,
      doctor_id: next.doctorId,
      branch: next.branch,
      appointment_date: next.date,
      appointment_time: next.time,
      notes: next.notes,
      status: next.status,
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    if (
      error.code === "SQLITE_CONSTRAINT_UNIQUE" ||
      error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
      String(error.message).includes("UNIQUE constraint failed") ||
      String(error.message).includes("idx_appointments_unique_live")
    ) {
      const conflict = new Error("This time slot has already been booked");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }

  return getAppointmentByIdStmt.get(id);
}

function deleteAppointment(id) {
  const existing = getAppointmentByIdStmt.get(id);
  if (!existing) {
    const error = new Error("Appointment not found");
    error.statusCode = 404;
    throw error;
  }

  deleteAppointmentStmt.run(id);
}

function pruneExpiredSessions() {
  const cutoff = new Date(Date.now() - SESSION_MAX_AGE_MS).toISOString();
  pruneSessionsStmt.run(cutoff);
}

app.get("/api/public/booking", (req, res) => {
  res.json({ doctors: getDoctorsWithSlots() });
});

app.post("/api/public/requests", (req, res, next) => {
  try {
    const payload = normalizeAppointmentPayload(req.body || {});
    const appointment = createAppointment(payload);
    res.status(201).json({ ok: true, request: appointment });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/login", (req, res) => {
  const routeId = String(req.body?.routeId || "");
  const username = String(req.body?.username || "");
  const password = String(req.body?.password || "");

  if (routeId !== ADMIN_ROUTE_ID) {
    return res.status(403).json({ error: "Invalid admin route" });
  }

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  pruneExpiredSessions();
  const sessionValue = createSession();
  setSessionCookie(res, sessionValue);
  return res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  const token = getSessionToken(req);
  deleteSessionByToken(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/admin/session", (req, res) => {
  const routeId = String(req.query.id || "");
  if (routeId !== ADMIN_ROUTE_ID) {
    return res.json({ authenticated: false, routeValid: false });
  }

  pruneExpiredSessions();
  return res.json({ authenticated: isAdminAuthorized(req), routeValid: true });
});

app.get("/api/admin/dashboard", requireAdmin, (req, res) => {
  res.json(
    getAdminPayload({
      doctorId: String(req.query.doctorId || ""),
      date: String(req.query.date || ""),
      status: String(req.query.status || "")
    })
  );
});

app.post("/api/admin/appointments", requireAdmin, (req, res, next) => {
  try {
    const payload = normalizeAppointmentPayload(req.body || {});
    const status = String(req.body?.status || "confirmed").trim() || "confirmed";
    if (!["pending", "confirmed", "cancelled", "completed"].includes(status)) {
      const error = new Error("Invalid appointment status");
      error.statusCode = 400;
      throw error;
    }

    const appointment = createAppointment({ ...payload, status });
    if (status !== "pending") {
      const updated = updateAppointment(appointment.id, { status });
      return res.status(201).json({ ok: true, appointment: updated });
    }
    return res.status(201).json({ ok: true, appointment });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/appointments", requireAdmin, (req, res) => {
  res.json({
    appointments: getAppointments({
      doctorId: String(req.query.doctorId || ""),
      date: String(req.query.date || ""),
      status: String(req.query.status || "")
    })
  });
});

app.get("/api/admin/doctors/:id/schedule", requireAdmin, (req, res, next) => {
  try {
    const doctor = getDoctorStmt.get(req.params.id);
    if (!doctor) {
      const error = new Error("Doctor not found");
      error.statusCode = 404;
      throw error;
    }

    const slots = getDoctorsWithSlots().find((item) => item.id === doctor.id)?.slots || [];
    const appointments = getAppointments({ doctorId: doctor.id });
    res.json({ doctor, slots, appointments });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/requests/:id", requireAdmin, (req, res, next) => {
  try {
    const status = String(req.body?.status || "");
    if (!["pending", "confirmed", "rejected"].includes(status)) {
      const error = new Error("Invalid request status");
      error.statusCode = 400;
      throw error;
    }

    const mappedStatus = status === "rejected" ? "cancelled" : status;
    const request = updateAppointment(req.params.id, { status: mappedStatus });
    res.json({ ok: true, request });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/requests/:id", requireAdmin, (req, res, next) => {
  try {
    deleteAppointment(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/requests", requireAdmin, (req, res) => {
  clearAppointmentsStmt.run();
  res.status(204).end();
});

app.patch("/api/admin/doctors/:id", requireAdmin, (req, res, next) => {
  try {
    const availability = String(req.body?.availability || "");
    if (!["available", "limited", "busy"].includes(availability)) {
      const error = new Error("Invalid doctor availability");
      error.statusCode = 400;
      throw error;
    }

    const doctor = getDoctorStmt.get(req.params.id);
    if (!doctor) {
      const error = new Error("Doctor not found");
      error.statusCode = 404;
      throw error;
    }

    updateDoctorAvailabilityStmt.run({ id: doctor.id, availability });
    const updated = getDoctorStmt.get(doctor.id);
    res.json({ ok: true, doctor: updated });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/appointments/:id", requireAdmin, (req, res, next) => {
  try {
    const appointment = updateAppointment(req.params.id, req.body || {});
    res.json({ ok: true, appointment });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/appointments/:id", requireAdmin, (req, res, next) => {
  try {
    deleteAppointment(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use("/assets", express.static(path.join(ROOT, "assets"), { maxAge: "1h" }));
app.use("/admin", express.static(path.join(ROOT, "admin"), { extensions: ["html"] }));
app.use("/booking", express.static(path.join(ROOT, "booking"), { extensions: ["html"] }));
app.use(express.static(ROOT, { extensions: ["html"] }));

app.get("/", (req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

app.get("/booking/", (req, res) => {
  res.sendFile(path.join(ROOT, "booking", "index.html"));
});

app.get("/admin/", (req, res) => {
  res.sendFile(path.join(ROOT, "admin", "index.html"));
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({ error: error.message || "Server error" });
});

if (!fs.existsSync(path.join(ROOT, "data"))) {
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
}

app.listen(PORT, () => {
  console.log(`Toto Dental server running on http://127.0.0.1:${PORT}`);
});
