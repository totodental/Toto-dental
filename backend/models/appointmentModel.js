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

async function runSupabaseQuery(queryPromise) {
  const { data, error } = await queryPromise;
  if (error) throw error;
  return data;
}

function toAppointmentRow(id, payload, now) {
  return {
    id,
    patient_name: payload.patientName,
    phone: payload.phone,
    doctor_id: payload.doctorId,
    branch: payload.branch,
    appointment_date: payload.date,
    appointment_time: payload.time,
    notes: payload.notes,
    status: payload.status,
    created_at: now,
    updated_at: now
  };
}

function toAppointmentUpdate(payload, now) {
  return {
    patient_name: payload.patientName,
    phone: payload.phone,
    doctor_id: payload.doctorId,
    branch: payload.branch,
    appointment_date: payload.date,
    appointment_time: payload.time,
    notes: payload.notes,
    status: payload.status,
    updated_at: now
  };
}

function createAppointmentModel(database) {
  const db = database.client;

  if (database.type === "supabase") {
    return {
      async listAll() {
        const rows = await runSupabaseQuery(
          db.from("appointments")
            .select("id, patient_name, phone, doctor_id, branch, appointment_date, appointment_time, notes, status, created_at, updated_at")
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
        );
        return rows.map(mapAppointment);
      },
      async getById(id) {
        const rows = await runSupabaseQuery(
          db.from("appointments")
            .select("id, patient_name, phone, doctor_id, branch, appointment_date, appointment_time, notes, status, created_at, updated_at")
            .eq("id", id)
            .limit(1)
        );
        return rows[0] ? mapAppointment(rows[0]) : null;
      },
      async create(id, payload, now) {
        await runSupabaseQuery(db.from("appointments").insert(toAppointmentRow(id, payload, now)));
      },
      async update(id, payload, now) {
        await runSupabaseQuery(
          db.from("appointments")
            .update(toAppointmentUpdate(payload, now))
            .eq("id", id)
        );
      },
      async archiveById(id, now) {
        const rows = await runSupabaseQuery(
          db.from("appointments")
            .update({ status: "archived", updated_at: now })
            .eq("id", id)
            .select("id")
        );
        return { changes: rows.length };
      },
      async archiveAll(now) {
        const rows = await runSupabaseQuery(
          db.from("appointments")
            .update({ status: "archived", updated_at: now })
            .neq("status", "archived")
            .select("id")
        );
        return { changes: rows.length };
      },
      async getConfirmedConflict(doctorId, date, time, ignoreId = "") {
        const rows = await runSupabaseQuery(
          db.from("appointments")
            .select("id")
            .eq("doctor_id", doctorId)
            .eq("appointment_date", date)
            .eq("appointment_time", time)
            .in("status", ["confirmed", "completed"])
            .neq("id", ignoreId || "")
            .limit(1)
        );
        return rows[0] || null;
      },
      async getBookedSlots() {
        return runSupabaseQuery(
          db.from("appointments")
            .select("doctor_id, appointment_date, appointment_time")
            .in("status", ["confirmed", "completed"])
        );
      }
    };
  }

  const selectBase = `
    SELECT id, patient_name, phone, doctor_id, branch, appointment_date, appointment_time, notes, status, created_at, updated_at
    FROM appointments
  `;

  const listStmt = db.prepare(`${selectBase} ORDER BY datetime(created_at) DESC, id DESC`);
  const getByIdStmt = db.prepare(`${selectBase} WHERE id = ?`);
  const createStmt = db.prepare(`
    INSERT INTO appointments (
      id, patient_name, phone, doctor_id, branch, appointment_date, appointment_time, notes, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateStmt = db.prepare(`
    UPDATE appointments
    SET patient_name = ?, phone = ?, doctor_id = ?, branch = ?, appointment_date = ?, appointment_time = ?, notes = ?, status = ?, updated_at = ?
    WHERE id = ?
  `);
  const archiveByIdStmt = db.prepare(`
    UPDATE appointments
    SET status = 'archived', updated_at = ?
    WHERE id = ?
  `);
  const archiveAllStmt = db.prepare(`
    UPDATE appointments
    SET status = 'archived', updated_at = ?
    WHERE status != 'archived'
  `);
  const confirmedConflictStmt = db.prepare(`
    SELECT id
    FROM appointments
    WHERE doctor_id = ?
      AND appointment_date = ?
      AND appointment_time = ?
      AND status IN ('confirmed', 'completed')
      AND id != ?
    LIMIT 1
  `);
  const bookedSlotsStmt = db.prepare(`
    SELECT doctor_id, appointment_date, appointment_time
    FROM appointments
    WHERE status IN ('confirmed', 'completed')
  `);
  return {
    async listAll() {
      return listStmt.all().map(mapAppointment);
    },
    async getById(id) {
      const row = getByIdStmt.get(id);
      return row ? mapAppointment(row) : null;
    },
    async create(id, payload, now) {
      createStmt.run(
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
    },
    async update(id, payload, now) {
      updateStmt.run(
        payload.patientName,
        payload.phone,
        payload.doctorId,
        payload.branch,
        payload.date,
        payload.time,
        payload.notes,
        payload.status,
        now,
        id
      );
    },
    async archiveById(id, now) {
      return archiveByIdStmt.run(now, id);
    },
    async archiveAll(now) {
      return archiveAllStmt.run(now);
    },
    async getConfirmedConflict(doctorId, date, time, ignoreId = "") {
      return confirmedConflictStmt.get(doctorId, date, time, ignoreId || "");
    },
    async getBookedSlots() {
      return bookedSlotsStmt.all();
    }
  };
}

module.exports = {
  createAppointmentModel
};
