const crypto = require("node:crypto");
const { createError, normalizeDate, normalizeTime } = require("../utils/http");

function createPublicController({ doctorModel, appointmentModel }) {
  function buildDoctorsResponse() {
    const doctors = doctorModel.getAll();
    const slotRows = doctorModel.getAllSlots();
    const bookedRows = appointmentModel.getBookedSlots();

    const bookedSet = new Set(
      bookedRows.map((row) => `${row.doctor_id}|${row.appointment_date}|${row.appointment_time}`)
    );

    return doctors.map((doctor) => {
      const doctorSlots = slotRows.filter((slot) => slot.doctor_id === doctor.id);
      const grouped = new Map();

      doctorSlots.forEach((slot) => {
        const key = `${slot.slot_date}|${slot.label}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            label: slot.label,
            date: slot.slot_date,
            times: []
          });
        }

        if (!bookedSet.has(`${doctor.id}|${slot.slot_date}|${slot.slot_time}`)) {
          grouped.get(key).times.push(slot.slot_time);
        }
      });

      return {
        ...doctor,
        slots:
          doctor.availability === "busy"
            ? []
            : Array.from(grouped.values()).filter((slot) => slot.times.length > 0)
      };
    });
  }

  function buildAppointmentPayload(input) {
    const patientName = (input.patientName || "").trim();
    const phone = (input.phone || "").trim();
    const doctorId = input.doctorId || "";
    const notes = (input.notes || "").trim();
    const date = normalizeDate(input.date || "");
    const time = normalizeTime(input.time || "");

    if (!patientName) throw createError(400, "Ó¨Ð²Ñ‡Ñ‚Ó©Ð½Ð¸Ð¹ Ð½ÑÑ€ ÑˆÐ°Ð°Ñ€Ð´Ð»Ð°Ð³Ð°Ñ‚Ð°Ð¹.");
    if (!phone) throw createError(400, "Ð£Ñ‚Ð°ÑÐ½Ñ‹ Ð´ÑƒÐ³Ð°Ð°Ñ€ ÑˆÐ°Ð°Ñ€Ð´Ð»Ð°Ð³Ð°Ñ‚Ð°Ð¹.");
    if (patientName.length > 80) throw createError(400, "Ó¨Ð²Ñ‡Ñ‚Ó©Ð½Ð¸Ð¹ Ð½ÑÑ€ Ñ…ÑÑ‚ ÑƒÑ€Ñ‚ Ð±Ð°Ð¹Ð½Ð°.");
    if (phone.length > 32) throw createError(400, "Ð£Ñ‚Ð°ÑÐ½Ñ‹ Ð´ÑƒÐ³Ð°Ð°Ñ€ Ñ…ÑÑ‚ ÑƒÑ€Ñ‚ Ð±Ð°Ð¹Ð½Ð°.");
    if (notes.length > 1000) throw createError(400, "Ð¢Ð°Ð¹Ð»Ð±Ð°Ñ€ Ñ…ÑÑ‚ ÑƒÑ€Ñ‚ Ð±Ð°Ð¹Ð½Ð°.");

    const doctor = doctorModel.getById(doctorId);
    if (!doctor) throw createError(400, "Ð­Ð¼Ñ‡ Ð¾Ð»Ð´ÑÐ¾Ð½Ð³Ò¯Ð¹.");
    if (doctor.availability === "busy") {
      throw createError(409, "Ð¡Ð¾Ð½Ð³Ð¾ÑÐ¾Ð½ ÑÐ¼Ñ‡ Ó©Ð½Ó©Ó©Ð´Ó©Ñ€ Ð·Ð°Ð²Ð³Ò¯Ð¹ Ð±Ð°Ð¹Ð½Ð°. Ó¨Ó©Ñ€ Ñ†Ð°Ð³ ÑÑÐ²ÑÐ» Ó©Ó©Ñ€ ÑÐ¼Ñ‡ ÑÐ¾Ð½Ð³Ð¾Ð½Ð¾ ÑƒÑƒ.");
    }

    return {
      patientName,
      phone,
      doctorId: doctor.id,
      branch: doctor.branch,
      date,
      time,
      notes,
      status: "pending"
    };
  }

  return {
    getHealth(req, res) {
      res.json({ ok: true });
    },
    getBooking(req, res) {
      res.setHeader("Cache-Control", "no-store");
      res.json({ doctors: buildDoctorsResponse() });
    },
    createRequest(req, res, next) {
      try {
        const payload = buildAppointmentPayload(req.body || {});
        const now = new Date().toISOString();
        const id = crypto.randomUUID();

        appointmentModel.create(id, payload, now);
        res.status(201).json({ ok: true, appointment: appointmentModel.getById(id) });
      } catch (error) {
        next(error);
      }
    }
  };
}

module.exports = {
  createPublicController
};
