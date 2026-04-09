function createDoctorModel(db) {
  const getByIdStmt = db.prepare(`
    SELECT id, name, role, branch, hours, availability, note
    FROM doctors
    WHERE id = ?
  `);

  const getAllStmt = db.prepare(`
    SELECT id, name, role, branch, hours, availability, note
    FROM doctors
    ORDER BY branch, name
  `);

  const getSlotsStmt = db.prepare(`
    SELECT doctor_id, label, slot_date, slot_time
    FROM doctor_slots
    ORDER BY slot_date, slot_time
  `);

  const updateAvailabilityStmt = db.prepare(`
    UPDATE doctors
    SET availability = ?
    WHERE id = ?
  `);

  return {
    getById(id) {
      return getByIdStmt.get(id);
    },
    getAll() {
      return getAllStmt.all();
    },
    getAllSlots() {
      return getSlotsStmt.all();
    },
    updateAvailability(id, availability) {
      return updateAvailabilityStmt.run(availability, id);
    }
  };
}

module.exports = {
  createDoctorModel
};
