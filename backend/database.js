const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

function resolvePersistentDataDir() {
  const envPath = process.env.DATA_DIR
    || process.env.RAILWAY_VOLUME_MOUNT_PATH
    || process.env.RENDER_DISK_PATH
    || process.env.VOLUME_MOUNT_PATH;

  if (envPath) {
    return path.resolve(envPath, envPath.endsWith("toto-dental-data") ? "" : "toto-dental-data");
  }

  const platformCandidates = ["/data", "/var/data"];
  for (const candidate of platformCandidates) {
    if (fs.existsSync(candidate)) {
      return path.join(candidate, "toto-dental-data");
    }
  }

  return path.join(__dirname, "data");
}

function createSupabaseClient() {
  if (!process.env.SUPABASE_URL) return null;

  if (process.env.NODE_ENV === "production" && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Production Supabase mode requires SUPABASE_SERVICE_ROLE_KEY on the backend service.");
  }

  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_ANON_KEY;

  if (!supabaseKey) {
    throw new Error("SUPABASE_URL is set but no SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY was provided.");
  }

  // Lazy-load so local SQLite development does not require the package.
  const { createClient } = require("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : "";

const DATA_DIR = SQLITE_DB_PATH ? path.dirname(SQLITE_DB_PATH) : resolvePersistentDataDir();

const DB_PATH = SQLITE_DB_PATH || path.join(DATA_DIR, "app.db");
const SLOT_SEED_VERSION = "2";

const seedDoctors = [
  {
    id: "narantsengel",
    name: "Б.Наранцэнгэл",
    role: "Анагаах ухааны докторант, Нүүр амны гажиг заслын их эмч",
    branch: "Салбар 1",
    hours: "Даваа-Баасан · 10:00-18:00",
    availability: "available",
    note: "Гажиг заслын оношилгоо, аппаратын хяналт, урт хугацааны эмчилгээний төлөвлөгөөг боловсруулан ажиллана."
  },
  {
    id: "lkhagvadorj",
    name: "Э.Лхагвадорж",
    role: "Нүүр амны мэс заслын их эмч",
    branch: "Салбар 2",
    hours: "Мягмар, Пүрэв, Бямба · 10:00-18:00",
    availability: "limited",
    note: "Нүүр амны мэс заслын үзлэг, шүд авалт, мэс заслын зөвлөгөө, дараах хяналтыг хариуцна."
  },
  {
    id: "mandakhnaran",
    name: "З.Мандахнаран",
    role: "Нүүр амны эмчилгээний их эмч",
    branch: "Салбар 1",
    hours: "Даваа-Бямба · 11:00-18:00",
    availability: "available",
    note: "Шүд цоорох өвчлөлийн нарийн эмчилгээ, анатомын бүтцэд нийцсэн ломбо, нөхөн сэргээх эмчилгээг хийнэ."
  }
];

const legacyDoctorMap = {
  anu: "narantsengel",
  togoldor: "lkhagvadorj",
  nomin: "mandakhnaran"
};

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function generateSlots(days = 3, startHour = 8, endHour = 18) {
  const slots = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);

    const label = date.toLocaleDateString("mn-MN", { weekday: "long" });
    const dateStr = formatLocalDate(date);

    for (let hour = startHour; hour < endHour; hour += 1) {
      const time = `${String(hour).padStart(2, "0")}:00`;
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

async function runSupabaseQuery(queryPromise) {
  const { data, error } = await queryPromise;
  if (error) throw error;
  return data;
}

async function syncSupabaseSeedData(supabase) {
  for (const doctor of seedDoctors) {
    const existingDoctors = await runSupabaseQuery(
      supabase.from("doctors")
        .select("id")
        .eq("id", doctor.id)
        .limit(1)
    );

    if (existingDoctors.length > 0) {
      await runSupabaseQuery(
        supabase.from("doctors")
          .update({
            name: doctor.name,
            role: doctor.role,
            branch: doctor.branch,
            hours: doctor.hours,
            note: doctor.note
          })
          .eq("id", doctor.id)
      );
    } else {
      await runSupabaseQuery(
        supabase.from("doctors").insert({
          id: doctor.id,
          name: doctor.name,
          role: doctor.role,
          branch: doctor.branch,
          hours: doctor.hours,
          availability: doctor.availability,
          note: doctor.note
        })
      );
    }
  }

  for (const doctor of seedDoctors) {
    const existingSlots = await runSupabaseQuery(
      supabase.from("doctor_slots")
        .select("id", { count: "exact" })
        .eq("doctor_id", doctor.id)
        .limit(1)
    );

    if (existingSlots.length > 0) {
      continue;
    }

    await runSupabaseQuery(
      supabase.from("doctor_slots").insert(
        getSeedSlots(doctor.id).map((slot) => ({
          doctor_id: doctor.id,
          label: slot.label,
          slot_date: slot.date,
          slot_time: slot.time
        }))
      )
    );
  }
}

async function initDatabase() {
  const supabase = createSupabaseClient();
  if (supabase) {
    await syncSupabaseSeedData(supabase);
    return {
      type: "supabase",
      client: supabase,
      path: null
    };
  }

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

    CREATE UNIQUE INDEX IF NOT EXISTS idx_doctor_slots_unique
    ON doctor_slots (doctor_id, slot_date, slot_time);

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

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
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
      note = excluded.note
  `);

  const deleteDoctorSlots = db.prepare("DELETE FROM doctor_slots WHERE doctor_id = ?");
  const insertSlot = db.prepare(`
    INSERT INTO doctor_slots (doctor_id, label, slot_date, slot_time)
    VALUES (@doctor_id, @label, @slot_date, @slot_time)
  `);
  const getMeta = db.prepare("SELECT value FROM app_meta WHERE key = ?");
  const setMeta = db.prepare(`
    INSERT INTO app_meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const migrateLegacyAppointments = db.prepare(`
    UPDATE appointments
    SET doctor_id = ?, updated_at = ?
    WHERE doctor_id = ?
  `);

  const deleteDoctor = db.prepare("DELETE FROM doctors WHERE id = ?");

  const syncSeedData = db.transaction(() => {
    const slotSeedVersion = getMeta.get("slot_seed_version")?.value || "";
    const shouldRefreshSeedSlots = slotSeedVersion !== SLOT_SEED_VERSION;

    seedDoctors.forEach((doctor) => {
      upsertDoctor.run(doctor);
    });

    Object.entries(legacyDoctorMap).forEach(([legacyId, nextId]) => {
      migrateLegacyAppointments.run(nextId, new Date().toISOString(), legacyId);
      deleteDoctorSlots.run(legacyId);
      deleteDoctor.run(legacyId);
    });

    seedDoctors.forEach((doctor) => {
      if (!shouldRefreshSeedSlots) return;

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

    setMeta.run("slot_seed_version", SLOT_SEED_VERSION);
  });

  syncSeedData();

  return {
    type: "sqlite",
    client: db,
    path: DB_PATH
  };
}

module.exports = {
  initDatabase,
  DB_PATH,
  DATA_DIR
};
