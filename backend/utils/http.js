function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeDate(input) {
  if (!input || typeof input !== "string") {
    throw createError(400, "Өдөр буруу байна.");
  }

  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[1]}-${match[2]}`;
  }

  throw createError(400, "Өдрийн формат буруу байна.");
}

function normalizeTime(input) {
  if (!input || typeof input !== "string") {
    throw createError(400, "Цаг буруу байна.");
  }

  const trimmed = input.trim().toUpperCase();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) {
    throw createError(400, "Цагийн формат буруу байна.");
  }

  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3];

  if (meridiem === "AM") {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

module.exports = {
  createError,
  normalizeDate,
  normalizeTime
};
