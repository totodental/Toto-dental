async function runSupabaseQuery(queryPromise) {
  const { data, error } = await queryPromise;
  if (error) throw error;
  return data;
}

function createSessionModel(database) {
  const db = database.client;

  if (database.type === "supabase") {
    return {
      async findValid(token, signature) {
        const rows = await runSupabaseQuery(
          db.from("admin_sessions")
            .select("token, signature, created_at")
            .eq("token", token)
            .eq("signature", signature)
            .limit(1)
        );
        return rows[0] || null;
      },
      async create(token, signature, createdAt) {
        await runSupabaseQuery(
          db.from("admin_sessions").insert({
            token,
            signature,
            created_at: createdAt
          })
        );
      },
      async deleteByToken(token) {
        const rows = await runSupabaseQuery(
          db.from("admin_sessions")
            .delete()
            .eq("token", token)
            .select("token")
        );
        return { changes: rows.length };
      },
      async cleanupExpired(cutoffIso) {
        const rows = await runSupabaseQuery(
          db.from("admin_sessions")
            .delete()
            .lt("created_at", cutoffIso)
            .select("token")
        );
        return { changes: rows.length };
      }
    };
  }

  const getValidStmt = db.prepare(`
    SELECT token, signature, created_at
    FROM admin_sessions
    WHERE token = ? AND signature = ?
  `);
  const createStmt = db.prepare(`
    INSERT INTO admin_sessions (token, signature, created_at)
    VALUES (?, ?, ?)
  `);
  const deleteByTokenStmt = db.prepare(`DELETE FROM admin_sessions WHERE token = ?`);
  const cleanupStmt = db.prepare(`DELETE FROM admin_sessions WHERE created_at < ?`);

  return {
    async findValid(token, signature) {
      return getValidStmt.get(token, signature) || null;
    },
    async create(token, signature, createdAt) {
      createStmt.run(token, signature, createdAt);
    },
    async deleteByToken(token) {
      return deleteByTokenStmt.run(token);
    },
    async cleanupExpired(cutoffIso) {
      return cleanupStmt.run(cutoffIso);
    }
  };
}

module.exports = {
  createSessionModel
};
