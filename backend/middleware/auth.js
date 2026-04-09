const crypto = require("node:crypto");
const { createError } = require("../utils/http");

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((acc, pair) => {
    const [key, ...rest] = pair.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function createAuthHelpers(config, sessionModel) {
  function signValue(value) {
    return crypto.createHmac("sha256", config.sessionSecret).update(value).digest("hex");
  }

  function hashPassword(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
  }

  function safeCompare(a, b) {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
  }

  function createSessionToken() {
    return crypto.randomBytes(24).toString("hex");
  }

  function setSessionCookie(res, token) {
    const isProduction = process.env.NODE_ENV === "production";
    const cookieParts = [
      `${config.sessionCookie}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      `Max-Age=${Math.floor(config.sessionMaxAgeMs / 1000)}`,
      isProduction ? "Secure" : "",
      "SameSite=Lax"
    ].filter(Boolean);

    res.setHeader("Set-Cookie", cookieParts.join("; "));
  }

  function clearSessionCookie(res) {
    const isProduction = process.env.NODE_ENV === "production";
    const sameSite = isProduction ? "SameSite=Lax; Secure" : "SameSite=Lax";
    res.setHeader("Set-Cookie", `${config.sessionCookie}=; Path=/; HttpOnly; Max-Age=0; ${sameSite}`);
  }

  function requireAdmin(req, res, next) {
    const cookies = parseCookies(req);
    const token = cookies[config.sessionCookie];
    if (!token) {
      next(createError(401, "Нэвтрэх шаардлагатай."));
      return;
    }

    const signature = signValue(token);
    const session = sessionModel.findValid(token, signature);

    if (!session) {
      clearSessionCookie(res);
      next(createError(401, "Нэвтрэх шаардлагатай."));
      return;
    }

    const age = Date.now() - new Date(session.created_at).getTime();
    if (Number.isNaN(age) || age > config.sessionMaxAgeMs) {
      sessionModel.deleteByToken(token);
      clearSessionCookie(res);
      next(createError(401, "Session хугацаа дууссан байна."));
      return;
    }

    req.adminSession = { token };
    next();
  }

  return {
    parseCookies,
    signValue,
    hashPassword,
    safeCompare,
    createSessionToken,
    setSessionCookie,
    clearSessionCookie,
    requireAdmin
  };
}

module.exports = {
  createAuthHelpers
};
