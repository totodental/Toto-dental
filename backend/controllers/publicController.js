const crypto = require("node:crypto");
const { createError, normalizeDate, normalizeTime } = require("../utils/http");

function createPublicController({ doctorModel, appointmentModel }) {
  async function buildDoctorsResponse() {
    const doctors = await doctorModel.getAll();
    const slotRows = await doctorModel.getAllSlots();
    const bookedRows = await appointmentModel.getBookedSlots();

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

        const isBooked = bookedSet.has(`${doctor.id}|${slot.slot_date}|${slot.slot_time}`);
        grouped.get(key).times.push({
          value: slot.slot_time,
          isBooked,
          state: isBooked ? "booked" : doctor.availability === "limited" ? "limited" : "available"
        });
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

  async function buildAppointmentPayload(input) {
    const patientName = (input.patientName || "").trim();
    const phone = (input.phone || "").trim();
    const doctorId = input.doctorId || "";
    const notes = (input.notes || "").trim();
    const date = normalizeDate(input.date || "");
    const time = normalizeTime(input.time || "");

    if (!patientName) throw createError(400, "Өвчтөний нэр шаардлагатай.");
    if (!phone) throw createError(400, "Утасны дугаар шаардлагатай.");
    if (patientName.length > 80) throw createError(400, "Өвчтөний нэр хэт урт байна.");
    if (phone.length > 32) throw createError(400, "Утасны дугаар хэт урт байна.");
    if (notes.length > 1000) throw createError(400, "Тайлбар хэт урт байна.");

    const doctor = await doctorModel.getById(doctorId);
    if (!doctor) throw createError(400, "Эмч олдсонгүй.");
    if (doctor.availability === "busy") {
      throw createError(409, "Сонгосон эмч өнөөдөр завгүй байна. Өөр цаг эсвэл өөр эмч сонгоно уу.");
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
    async getBooking(req, res, next) {
      try {
        res.setHeader("Cache-Control", "no-store");
        res.json({ doctors: await buildDoctorsResponse() });
      } catch (error) {
        next(error);
      }
    },
    async createRequest(req, res, next) {
      try {
        const payload = await buildAppointmentPayload(req.body || {});
        const now = new Date().toISOString();
        const id = crypto.randomUUID();

        await appointmentModel.create(id, payload, now);
        res.status(201).json({ ok: true, appointment: await appointmentModel.getById(id) });
      } catch (error) {
        next(error);
      }
    }
  };
}

module.exports = {
  createPublicController
};
