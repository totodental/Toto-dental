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

function createAppointmentModel(db) {
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
  const migrateDoctorStmt = db.prepare(`
    UPDATE appointments
    SET doctor_id = ?, updated_at = ?
    WHERE doctor_id = ?
  `);

  return {
    listAll() {
      return listStmt.all().map(mapAppointment);
    },
    getById(id) {
      const row = getByIdStmt.get(id);
      return row ? mapAppointment(row) : null;
    },
    create(id, payload, now) {
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
    update(id, payload, now) {
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
    archiveById(id, now) {
      return archiveByIdStmt.run(now, id);
    },
    archiveAll(now) {
      return archiveAllStmt.run(now);
    },
    getConfirmedConflict(doctorId, date, time, ignoreId = "") {
      return confirmedConflictStmt.get(doctorId, date, time, ignoreId || "");
    },
    getBookedSlots() {
      return bookedSlotsStmt.all();
    },
    migrateDoctor(legacyId, nextId, updatedAt) {
      migrateDoctorStmt.run(nextId, updatedAt, legacyId);
    }
  };
}

module.exports = {
  createAppointmentModel
};
