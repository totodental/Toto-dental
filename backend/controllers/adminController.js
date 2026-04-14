const crypto = require("node:crypto");
const { createError, normalizeDate, normalizeTime } = require("../utils/http");

function createAdminController({
  config,
  doctorModel,
  appointmentModel,
  sessionModel,
  authHelpers,
  bookingCache
}) {
  async function archiveAppointment(id, notFoundMessage) {
    const result = await appointmentModel.archiveById(id, new Date().toISOString());
    if (!result.changes) {
      throw createError(404, notFoundMessage);
    }
  }

  async function ensureNoConfirmedConflict(payload, ignoreId = "") {
    if (!["confirmed", "completed"].includes(payload.status)) return;

    const conflict = await appointmentModel.getConfirmedConflict(
      payload.doctorId,
      payload.date,
      payload.time,
      ignoreId
    );

    if (conflict) {
      throw createError(409, "Энэ эмч дээр энэ цаг аль хэдийн баталгаажсан байна.");
    }
  }

  async function buildAppointmentPayload(input, existing = null) {
    const patientName = (input.patientName ?? existing?.patientName ?? "").trim();
    const phone = (input.phone ?? existing?.phone ?? "").trim();
    const doctorId = input.doctorId ?? existing?.doctorId ?? "";
    const notes = (input.notes ?? existing?.notes ?? "").trim();
    const status = input.status ?? existing?.status ?? "pending";
    const date = normalizeDate(input.date ?? existing?.date ?? "");
    const time = normalizeTime(input.time ?? existing?.time ?? "");

    if (!patientName) throw createError(400, "Өвчтөний нэр шаардлагатай.");
    if (!phone) throw createError(400, "Утасны дугаар шаардлагатай.");
    if (patientName.length > 80) throw createError(400, "Өвчтөний нэр хэт урт байна.");
    if (phone.length > 32) throw createError(400, "Утасны дугаар хэт урт байна.");
    if (notes.length > 1000) throw createError(400, "Тайлбар хэт урт байна.");

    const doctor = await doctorModel.getById(doctorId);
    if (!doctor) throw createError(400, "Эмч олдсонгүй.");

    if (!["pending", "confirmed", "cancelled", "completed", "archived"].includes(status)) {
      throw createError(400, "Төлөв буруу байна.");
    }

    return {
      patientName,
      phone,
      doctorId: doctor.id,
      branch: doctor.branch,
      date,
      time,
      notes,
      status
    };
  }

  return {
    async getSession(req, res, next) {
      try {
        res.setHeader("Cache-Control", "no-store");
        const routeValid = (req.query.id || "") === config.adminRouteId;
        if (!routeValid) {
          res.json({ routeValid: false, authenticated: false });
          return;
        }

        const cookies = authHelpers.parseCookies(req);
        const token = cookies[config.sessionCookie];
        if (!token) {
          res.json({ routeValid: true, authenticated: false });
          return;
        }

        const signature = authHelpers.signValue(token);
        const session = await sessionModel.findValid(token, signature);
        res.json({ routeValid: true, authenticated: Boolean(session) });
      } catch (error) {
        next(error);
      }
    },

    async login(req, res, next) {
      try {
        const { routeId = "", username = "", password = "" } = req.body || {};

        if (routeId !== config.adminRouteId) {
          throw createError(403, "Admin холбоос буруу байна.");
        }

        const usernameValid = authHelpers.safeCompare(username.trim(), config.adminUsername);
        const passwordValid = config.adminPasswordHash
          ? authHelpers.safeCompare(authHelpers.hashPassword(password), config.adminPasswordHash)
          : authHelpers.safeCompare(password, config.adminPassword);

        if (!usernameValid || !passwordValid) {
          throw createError(401, "Нэвтрэх нэр эсвэл нууц үг буруу байна.");
        }

        const token = authHelpers.createSessionToken();
        const signature = authHelpers.signValue(token);
        const now = new Date().toISOString();

        await sessionModel.cleanupExpired(new Date(Date.now() - config.sessionMaxAgeMs).toISOString());
        await sessionModel.create(token, signature, now);
        authHelpers.setSessionCookie(res, token);
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },

    async logout(req, res, next) {
      try {
        await sessionModel.deleteByToken(req.adminSession.token);
        authHelpers.clearSessionCookie(res);
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },

    async getDashboard(req, res, next) {
      try {
        res.setHeader("Cache-Control", "no-store");
        res.json({
          doctors: await doctorModel.getAll(),
          requests: await appointmentModel.listAll()
        });
      } catch (error) {
        next(error);
      }
    },

    async createAppointment(req, res, next) {
      res.setHeader("Cache-Control", "no-store");
      try {
        const payload = await buildAppointmentPayload(req.body || {});
        await ensureNoConfirmedConflict(payload);
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        await appointmentModel.create(id, payload, now);
        bookingCache?.invalidate?.();
        res.status(201).json({ ok: true, appointment: await appointmentModel.getById(id) });
      } catch (error) {
        next(error);
      }
    },

    async updateAppointment(req, res, next) {
      res.setHeader("Cache-Control", "no-store");
      try {
        const existing = await appointmentModel.getById(req.params.id);
        if (!existing) throw createError(404, "Захиалга олдсонгүй.");

        const payload = await buildAppointmentPayload(req.body || {}, existing);
        await ensureNoConfirmedConflict(payload, existing.id);
        await appointmentModel.update(existing.id, payload, new Date().toISOString());
        bookingCache?.invalidate?.();
        res.json({ ok: true, appointment: await appointmentModel.getById(existing.id) });
      } catch (error) {
        next(error);
      }
    },

    async deleteAppointment(req, res, next) {
      res.setHeader("Cache-Control", "no-store");
      try {
        await archiveAppointment(req.params.id, "Захиалга олдсонгүй.");
        bookingCache?.invalidate?.();
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    },

    async deleteRequest(req, res, next) {
      res.setHeader("Cache-Control", "no-store");
      try {
        await archiveAppointment(req.params.id, "Хүсэлт олдсонгүй.");
        bookingCache?.invalidate?.();
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    },

    async deleteAllRequests(req, res, next) {
      try {
        res.setHeader("Cache-Control", "no-store");
        await appointmentModel.archiveAll(new Date().toISOString());
        bookingCache?.invalidate?.();
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    },

    async updateDoctor(req, res, next) {
      res.setHeader("Cache-Control", "no-store");
      try {
        const availability = req.body?.availability;
        if (!["available", "limited", "busy"].includes(availability)) {
          throw createError(400, "Эмчийн төлөв буруу байна.");
        }

        const result = await doctorModel.updateAvailability(req.params.id, availability);
        if (!result.changes) throw createError(404, "Эмч олдсонгүй.");
        bookingCache?.invalidate?.();
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    }
  };
}

module.exports = {
  createAdminController
};
