const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

const seedDoctors = [
  {
    id: "narantsengel",
    name: "Б.Наранцэнгэл",
    role: "Анагаах ухааны докторант, Нүүр амны гажиг заслын их эмч",
    branch: "Салбар 1",
    hours: "Даваа-Баасан · 10:00-18:00",
    availability: "available",
    note: "Гажиг заслын оношилгоо, аппаратын хяналт, урт хугацааны төлөвлөгөө."
  },
  {
    id: "lkhagvadorj",
    name: "Э.Лхагвадорж",
    role: "Нүүр амны мэс заслын их эмч",
    branch: "Салбар 2",
    hours: "Мягмар, Пүрэв, Бямба · 10:00-18:00",
    availability: "limited",
    note: "Нүүр амны мэс заслын үзлэг, шүд авалт, мэс заслын зөвлөгөө."
  },
  {
    id: "mandakhnaran",
    name: "З.Мандахнаран",
    role: "Нүүр амны эмчилгээний их эмч",
    branch: "Салбар 1",
    hours: "Даваа-Бямба · 11:00-18:00",
    availability: "available",
    note: "Анатомын бүтэц дагасан байгалийн мэт ломбо, шүд цоорох өвчлөлийн нарийн эмчилгээ."
  }
];

const legacyDoctorMap = {
  anu: "narantsengel",
  togoldor: "lkhagvadorj",
  nomin: "mandakhnaran"
};

function generateSlots(days = 3, startHour = 8, endHour = 18) {
  const slots = [];

  for (let d = 0; d < days; d += 1) {
    const date = new Date();
    date.setDate(date.getDate() + d);

    const label = date.toLocaleDateString("mn-MN", { weekday: "long" });
    const dateStr = date.toISOString().split("T")[0];

    for (let h = startHour; h < endHour; h += 1) {
      const time = `${String(h).padStart(2, "0")}:00`;

      slots.push({
        label,
        date: dateStr,
        time
      });
    }
  }

  return slots;
}

function getSeedSlots(doctorId) {
  if (doctorId === "narantsengel") return generateSlots(5, 10, 19);
  if (doctorId === "lkhagvadorj") return generateSlots(4, 10, 19);
  if (doctorId === "mandakhnaran") return generateSlots(6, 11, 19);
  return generateSlots(3, 10, 18);
}

function initDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    DROP INDEX IF EXISTS idx_appointments_unique_live;

    CREATE TABLE IF NOT EXISTS doctors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      branch TEXT NOT NULL,
      hours TEXT NOT NULL,
      availability TEXT NOT NULL,
      note TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS doctor_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      slot_date TEXT NOT NULL,
      slot_time TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      patient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      branch TEXT NOT NULL,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_unique_live
    ON appointments (doctor_id, appointment_date, appointment_time)
    WHERE status IN ('confirmed', 'completed');

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      signature TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const upsertDoctor = db.prepare(`
    INSERT INTO doctors (id, name, role, branch, hours, availability, note)
    VALUES (@id, @name, @role, @branch, @hours, @availability, @note)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      role = excluded.role,
      branch = excluded.branch,
      hours = excluded.hours,
      availability = excluded.availability,
      note = excluded.note
  `);

  const deleteDoctorSlots = db.prepare("DELETE FROM doctor_slots WHERE doctor_id = ?");
  const insertSlot = db.prepare(`
    INSERT INTO doctor_slots (doctor_id, label, slot_date, slot_time)
    VALUES (@doctor_id, @label, @slot_date, @slot_time)
  `);

  const syncSeedData = db.transaction(() => {
    seedDoctors.forEach((doctor) => {
      upsertDoctor.run(doctor);
    });

    Object.entries(legacyDoctorMap).forEach(([legacyId, nextId]) => {
      db.prepare(`
        UPDATE appointments
        SET doctor_id = ?, updated_at = ?
        WHERE doctor_id = ?
      `).run(nextId, new Date().toISOString(), legacyId);

      deleteDoctorSlots.run(legacyId);
      db.prepare("DELETE FROM doctors WHERE id = ?").run(legacyId);
    });

    seedDoctors.forEach((doctor) => {
      deleteDoctorSlots.run(doctor.id);

      getSeedSlots(doctor.id).forEach((slot) => {
        insertSlot.run({
          doctor_id: doctor.id,
          label: slot.label,
          slot_date: slot.date,
          slot_time: slot.time
        });
      });
    });
  });

  syncSeedData();

  return db;
}

module.exports = {
  initDatabase,
  DB_PATH
};
