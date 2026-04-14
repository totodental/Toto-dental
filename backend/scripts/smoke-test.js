const assert = require("node:assert/strict");
const path = require("node:path");
const Database = require("better-sqlite3");

const { createDoctorModel } = require("../models/doctorModel");
const { createAppointmentModel } = require("../models/appointmentModel");
const { createPublicController } = require("../controllers/publicController");

function createInMemoryDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE doctors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      branch TEXT NOT NULL,
      hours TEXT NOT NULL,
      availability TEXT NOT NULL,
      note TEXT NOT NULL
    );

    CREATE TABLE doctor_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id TEXT NOT NULL,
      label TEXT NOT NULL,
      slot_date TEXT NOT NULL,
      slot_time TEXT NOT NULL
    );

    CREATE TABLE appointments (
      id TEXT PRIMARY KEY,
      patient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      doctor_id TEXT NOT NULL,
      branch TEXT NOT NULL,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  return db;
}

async function testBusyDoctorBookingProtection() {
  const db = createInMemoryDb();
  db.prepare(`
    INSERT INTO doctors (id, name, role, branch, hours, availability, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run("busy-doc", "Busy Doctor", "Dentist", "Branch 1", "10:00-18:00", "busy", "note");
  db.prepare(`
    INSERT INTO doctor_slots (doctor_id, label, slot_date, slot_time)
    VALUES (?, ?, ?, ?)
  `).run("busy-doc", "Monday", "2026-04-20", "10:00");

  const doctorModel = createDoctorModel({ type: "sqlite", client: db });
  const appointmentModel = createAppointmentModel({ type: "sqlite", client: db });
  const publicController = createPublicController({ doctorModel, appointmentModel });

  let bookingPayload;
  await publicController.getBooking(
    {},
    {
      setHeader() {},
      json(payload) {
        bookingPayload = payload;
      }
    }
  );

  assert.equal(bookingPayload.doctors[0].availability, "busy");
  assert.deepEqual(bookingPayload.doctors[0].slots, []);

  let caughtError;
  await publicController.createRequest(
    {
      body: {
        patientName: "Test Patient",
        phone: "99112233",
        doctorId: "busy-doc",
        date: "2026-04-20",
        time: "10:00",
        notes: ""
      }
    },
    {
      status() {
        throw new Error("Busy doctor request should not succeed");
      }
    },
    (error) => {
      caughtError = error;
    }
  );

  assert.ok(caughtError);
  assert.equal(caughtError.statusCode, 409);
}

function loadDatabaseModuleWithEnv(overrides) {
  const databasePath = require.resolve("../database");
  delete require.cache[databasePath];

  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const loaded = require("../database");

  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  delete require.cache[databasePath];
  return loaded;
}

function testPersistentDirectoryResolution() {
  const explicit = loadDatabaseModuleWithEnv({
    SQLITE_DB_PATH: null,
    DATA_DIR: "/tmp/toto-data",
    RAILWAY_VOLUME_MOUNT_PATH: null,
    RENDER_DISK_PATH: null,
    VOLUME_MOUNT_PATH: null
  });

  assert.equal(explicit.DATA_DIR, path.resolve("/tmp/toto-data", "toto-dental-data"));

  const explicitSuffix = loadDatabaseModuleWithEnv({
    SQLITE_DB_PATH: null,
    DATA_DIR: "/tmp/toto-dental-data",
    RAILWAY_VOLUME_MOUNT_PATH: null,
    RENDER_DISK_PATH: null,
    VOLUME_MOUNT_PATH: null
  });

  assert.equal(explicitSuffix.DATA_DIR, path.resolve("/tmp/toto-dental-data"));
}

async function run() {
  await testBusyDoctorBookingProtection();
  testPersistentDirectoryResolution();
  console.log("backend smoke tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
