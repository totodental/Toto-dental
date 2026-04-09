const express = require("express");

function createAdminRoutes(adminController, requireAdmin, applyRateLimit, config) {
  const router = express.Router();

  router.get("/admin/session", adminController.getSession);
  router.post(
    "/admin/login",
    applyRateLimit("admin-login", config.loginRateLimitMax, config.rateLimitWindowMs),
    adminController.login
  );
  router.post("/admin/logout", requireAdmin, adminController.logout);
  router.get("/admin/dashboard", requireAdmin, adminController.getDashboard);
  router.post("/admin/appointments", requireAdmin, adminController.createAppointment);
  router.patch("/admin/appointments/:id", requireAdmin, adminController.updateAppointment);
  router.delete("/admin/appointments/:id", requireAdmin, adminController.deleteAppointment);
  router.delete("/admin/requests/:id", requireAdmin, adminController.deleteRequest);
  router.delete("/admin/requests", requireAdmin, adminController.deleteAllRequests);
  router.patch("/admin/doctors/:id", requireAdmin, adminController.updateDoctor);

  return router;
}

module.exports = {
  createAdminRoutes
};
