export function timeToMinutes(time) {
  if (!isTimeKey(time)) return null;

  const [h, m] = time.split(":").map(Number);
  if (
    !Number.isFinite(h) ||
    !Number.isFinite(m) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59
  ) {
    return null;
  }

  return h * 60 + m;
}

export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");

  return `${h}:${m}`;
}

export function isTimeKey(time) {
  return typeof time === "string" && /^\d{2}:\d{2}$/.test(time);
}

export function formatTimeInput(value, previousValue = "") {
  const digits = value.replace(/\D/g, "").slice(0, 4);

  if (!digits) return "";
  if (digits.length <= 2) return digits;

  if (digits.length === 3) {
    const firstTwoAsHours = Number(digits.slice(0, 2));

    if (firstTwoAsHours <= 23) {
      return `${digits.slice(0, 2)}:${digits.slice(2)}`;
    }

    const minutes = Number(digits.slice(1));

    if (minutes > 59) return previousValue;

    return `0${digits[0]}:${digits.slice(1)}`;
  }

  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2));

  if (hours > 23 || minutes > 59) return previousValue;

  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
