const { createError } = require("../utils/http");

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function createRateLimiter() {
  const store = new Map();

  return function applyRateLimit(limitKey, maxRequests, windowMs) {
    return (req, res, next) => {
      const now = Date.now();
      const key = `${limitKey}:${getClientIp(req)}`;
      const existing = store.get(key);

      if (!existing || now > existing.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        next();
        return;
      }

      existing.count += 1;
      store.set(key, existing);

      if (existing.count > maxRequests) {
        res.setHeader("Retry-After", String(Math.ceil((existing.resetAt - now) / 1000)));
        next(createError(429, "Хэт олон хүсэлт илгээгдсэн байна. Түр хүлээгээд дахин оролдоно уу."));
        return;
      }

      next();
    };
  };
}

module.exports = {
  createRateLimiter
};
