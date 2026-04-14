async function runSupabaseQuery(queryPromise) {
  const { data, error } = await queryPromise;
  if (error) throw error;
  return data;
}

function createDoctorModel(database) {
  const db = database.client;

  if (database.type === "supabase") {
    return {
      async getById(id) {
        const rows = await runSupabaseQuery(
          db.from("doctors")
            .select("id, name, role, branch, hours, availability, note")
            .eq("id", id)
            .limit(1)
        );
        return rows[0] || null;
      },
      async getAll() {
        return runSupabaseQuery(
          db.from("doctors")
            .select("id, name, role, branch, hours, availability, note")
            .order("branch")
            .order("name")
        );
      },
      async getAllSlots() {
        return runSupabaseQuery(
          db.from("doctor_slots")
            .select("doctor_id, label, slot_date, slot_time")
            .order("slot_date")
            .order("slot_time")
        );
      },
      async updateAvailability(id, availability) {
        const rows = await runSupabaseQuery(
          db.from("doctors")
            .update({ availability })
            .eq("id", id)
            .select("id")
        );
        return { changes: rows.length };
      }
    };
  }

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
    async getById(id) {
      return getByIdStmt.get(id) || null;
    },
    async getAll() {
      return getAllStmt.all();
    },
    async getAllSlots() {
      return getSlotsStmt.all();
    },
    async updateAvailability(id, availability) {
      return updateAvailabilityStmt.run(availability, id);
    }
  };
}

module.exports = {
  createDoctorModel
};
