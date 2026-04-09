function createSessionModel(db) {
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
    findValid(token, signature) {
      return getValidStmt.get(token, signature);
    },
    create(token, signature, createdAt) {
      createStmt.run(token, signature, createdAt);
    },
    deleteByToken(token) {
      deleteByTokenStmt.run(token);
    },
    cleanupExpired(cutoffIso) {
      cleanupStmt.run(cutoffIso);
    }
  };
}

module.exports = {
  createSessionModel
};
