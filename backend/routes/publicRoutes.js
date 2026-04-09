const express = require("express");

function createPublicRoutes(publicController, applyRateLimit, config) {
  const router = express.Router();

  router.get("/health", publicController.getHealth);
  router.get("/public/booking", publicController.getBooking);
  router.post(
    "/public/requests",
    applyRateLimit("public-requests", config.publicRateLimitMax, config.rateLimitWindowMs),
    publicController.createRequest
  );

  return router;
}

module.exports = {
  createPublicRoutes
};
