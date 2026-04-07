const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

const seedDoctors = [
  {
    id: "anu",
    name: "Эмч Ану",
    role: "Хүүхдийн шүд, ерөнхий үзлэг",
    branch: "Салбар 1",
    hours: "Даваа, Лхагва, Баасан · 09:00-13:00",
    availability: "available",
    note: "Өглөөний цагт үзлэг авна.",
  },
  {
    id: "togoldor",
    name: "Эмч Төгөлдөр",
    role: "Гажиг засал, аппарат",
    branch: "Салбар 2",
    hours: "Мягмар, Пүрэв, Бямба · 10:00-18:00",
    availability: "limited",
    note: "Аппаратын хяналт, шинэ төлөвлөгөө.",
  },
  {
    id: "nomin",
    name: "Эмч Номин",
    role: "Согог засал, винир, циркон",
    branch: "Салбар 1",
    hours: "Даваа-Бямба · 14:00-18:00",
    availability: "busy",
    note: "Өнөөдрийн хуваарь дүүрсэн үед reception хаана.",
  }
];

function generateSlots(days = 3, startHour = 8, endHour = 18) {
  const slots = [];

  for (let d = 0; d < days; d++) {
    const date = new Date();
    date.setDate(date.getDate() + d);

    const label = date.toLocaleDateString("mn-MN", { weekday: "long" });
    const dateStr = date.toISOString().split("T")[0];

    for (let h = startHour; h < endHour; h++) {
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

  const doctorCount = db.prepare("SELECT COUNT(*) AS count FROM doctors").get().count;

  if (doctorCount === 0) {
    const insertDoctor = db.prepare(`
      INSERT INTO doctors (id, name, role, branch, hours, availability, note)
      VALUES (@id, @name, @role, @branch, @hours, @availability, @note)
    `);

    const insertSlot = db.prepare(`
      INSERT INTO doctor_slots (doctor_id, label, slot_date, slot_time)
      VALUES (@doctor_id, @label, @slot_date, @slot_time)
    `);

    const tx = db.transaction(() => {
      for (const doctor of seedDoctors) {
        insertDoctor.run(doctor);

        let slots;

        if (doctor.id === "anu") {
          slots = generateSlots(3, 9, 14); // 09–13 ✔
        } else if (doctor.id === "togoldor") {
          slots = generateSlots(3, 10, 19); // 10–18 ✔
        } else if (doctor.id === "nomin") {
          slots = generateSlots(3, 14, 19); // 14–18 ✔
        }

        for (const slot of slots) {
          insertSlot.run({
            doctor_id: doctor.id,
            label: slot.label,
            slot_date: slot.date,
            slot_time: slot.time
          });
        }
      }
    });

    tx();
  }

  return db;
}

module.exports = {
  initDatabase,
  DB_PATH
};