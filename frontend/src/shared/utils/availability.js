import { formatDateKey, isToday, parseDateKey } from "@/shared/utils/dates";
import {
  getSalonSlotAvailabilitySummary,
  normalizeSchedule,
} from "@/shared/utils/slots";
import { timeToMinutes } from "@/shared/utils/time";

/**
 * Read a field from a schedule/salon object, handling Mongoose _doc nesting.
 */
function readField(obj, field, fallback) {
  if (!obj) return fallback;
  if (obj._doc && obj._doc[field] !== undefined) return obj._doc[field];
  if (obj[field] !== undefined) return obj[field];
  return fallback;
}

/**
 * Get working hours for a salon on a specific date.
 * Checks: salonEntry.scheduleOverrides → salonSchedule.scheduleOverrides → entry/salon nonWorkingDays
 * Falls back to defaultSchedule from salonEntry → salonSchedule → barberSchedule.
 */
function getSalonHoursForDate(salonEntry, salonSchedule, dateKey) {
  // 1. Check schedule overrides (salonEntry overrides take priority over salonSchedule)
  const entryOverrides = salonEntry.scheduleOverrides || {};
  const scheduleOverrides = (salonSchedule && salonSchedule.scheduleOverrides) || {};
  const mergedOverrides = { ...scheduleOverrides, ...entryOverrides };
  const override = mergedOverrides[dateKey];

  if (override) {
    const isWorking = readField(override, "isWorking", true);
    if (!isWorking) return null;
    return normalizeSchedule({
      working: true,
      from: readField(override, "from"),
      to: readField(override, "to"),
      breakFrom: readField(override, "breakFrom"),
      breakTo: readField(override, "breakTo"),
      startTime: readField(override, "startTime", "09:00"),
      endTime: readField(override, "endTime", "18:00"),
      hasBreak: Boolean(readField(override, "hasBreak", false)),
      breakStart: readField(override, "breakStart", ""),
      breakEnd: readField(override, "breakEnd", ""),
    });
  }

  // 2. Check non-working days (combine both sources)
  const entryNonWorking = salonEntry.nonWorkingDays || [];
  const scheduleNonWorking = (salonSchedule && salonSchedule.nonWorkingDays) || [];
  const mergedNonWorking = [...new Set([...scheduleNonWorking, ...entryNonWorking])];
  if (mergedNonWorking.includes(dateKey)) return null;

  // 3. Get default schedule (priority: salonEntry → salonSchedule → fallback)
  const ds1 = salonEntry.defaultSchedule || {};
  const ds2 = (salonSchedule && salonSchedule.defaultSchedule) || {};

  return normalizeSchedule({
    working: true,
    from: readField(ds1, "from") || readField(ds2, "from"),
    to: readField(ds1, "to") || readField(ds2, "to"),
    breakFrom: readField(ds1, "breakFrom") || readField(ds2, "breakFrom"),
    breakTo: readField(ds1, "breakTo") || readField(ds2, "breakTo"),
    startTime: readField(ds1, "startTime") || readField(ds2, "startTime") || "09:00",
    endTime: readField(ds1, "endTime") || readField(ds2, "endTime") || "18:00",
    hasBreak: Boolean(readField(ds1, "hasBreak")) || Boolean(readField(ds2, "hasBreak")),
    breakStart: readField(ds1, "breakStart") || readField(ds2, "breakStart") || "",
    breakEnd: readField(ds1, "breakEnd") || readField(ds2, "breakEnd") || "",
  });
}

function getSalonName(salonEntry) {
  if (!salonEntry) return "Salon";
  if (salonEntry.salon && typeof salonEntry.salon === "object") {
    return salonEntry.salon.name || "Salon";
  }
  return salonEntry.name || "Salon";
}

function getSalonId(salonEntry) {
  if (!salonEntry) return null;
  // Populated salon reference: { salon: { _id: "...", name: "..." }, status: "approved" }
  if (salonEntry.salon && typeof salonEntry.salon === "object") {
    const doc = salonEntry.salon._doc || salonEntry.salon;
    return doc._id?.toString?.() || doc.id?.toString?.();
  }
  // Direct salon object: { _id: "...", name: "..." }
  const doc = salonEntry._doc || salonEntry;
  return doc._id?.toString?.() || doc.id?.toString?.() || null;
}

/**
 * Search for the first available slot across all of a barber's approved salons.
 *
 * Day-by-day search. For each day, checks EVERY salon for that day first
 * before moving to the next day. This ensures the absolute earliest slot wins.
 *
 * @param {Object} barber - The barber object (with services, salons array)
 * @param {Object} options
 * @param {Array} options.bookings - All bookings for this barber
 * @param {number} options.serviceDuration - Duration to check (uses shortest service if not set)
 * @param {number} options.daysToSearch - How many days to look ahead (default 30)
 * @param {Object} options.schedules - Per-salon schedules keyed by salonId (from Redux)
 * @param {Array} options.salons - Array of approved salon entries from barber.salons
 * @returns {Object|null} { dateKey, time, salonId, salonName } or null
 */
export function getFirstAvailableSlot(barber, options = {}) {
  const { bookings = [], serviceDuration, daysToSearch = 30, schedules = {}, salons = [] } = options || {};

  if (!barber) return null;

  const services = barber.services || [];
  if (services.length === 0) return null;

  const durations = services
    .map((s) => Number(s?.duration || 20))
    .filter((d) => Number.isFinite(d) && d > 0);
  if (durations.length === 0) return null;
  const duration = Number(serviceDuration) || Math.min(...durations);

  // Use passed salons param, or fall back to barber.salons
  const salonsToSearch = (Array.isArray(salons) && salons.length > 0 ? salons : barber.salons || [])
    .filter((s) => s?.status === "approved" || s?.status === undefined);
  if (salonsToSearch.length === 0) return null;

  // Current date
  const now = new Date();

  // Filter bookings for this barber
  const barberId = barber._id?.toString?.() || barber.id?.toString?.();
  const allBarberBookings = (Array.isArray(bookings) ? bookings : []).filter((b) => {
    const bid = b?.barber?._id?.toString?.() ||
      b?.barber?.id?.toString?.() ||
      b?.barber?.toString?.() ||
      b?.barberId?.toString?.();
    return bid === barberId;
  });

  let result = null;

  // Search day by day, across all salons
  for (let dayOffset = 0; dayOffset < daysToSearch; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    const dateKey = formatDateKey(date);

    let dayResult = null;
    let dayResultMinutes = null;

    for (const salonEntry of salonsToSearch) {
      const salonId = getSalonId(salonEntry);
      if (!salonId) continue;

      const salonSchedule = schedules[salonId] || {};
      const hours = getSalonHoursForDate(salonEntry, salonSchedule, dateKey);
      if (!hours?.working) continue;

      const time = getSalonSlotAvailabilitySummary(
        hours,
        duration,
        allBarberBookings,
        null,
        { selectedDate: dateKey }
      ).availableSlots[0];

      if (time) {
        const minutes = timeToMinutes(time);
        if (minutes === null) continue;

        if (dayResult === null || minutes < dayResultMinutes) {
          dayResult = {
            dateKey,
            time,
            salonId,
            salonName: getSalonName(salonEntry),
          };
          dayResultMinutes = minutes;
        }
      }
    }

    if (dayResult) {
      result = dayResult;
      break;
    }
  }

  return result;
}


export function formatAvailabilityLabel(result) {
  if (!result) return "No availability today";

  const salonPart = result.salonName ? ` at ${result.salonName}` : "";

  if (isToday(result.dateKey)) {
    return `Available today at ${result.time}${salonPart}`;
  }

  const date = parseDateKey(result.dateKey);
  const dateLabel = date
    ? date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : result.dateKey;

  return `Next available: ${dateLabel}, ${result.time}${salonPart}`;
}

export function getAvailabilityTone(result) {
  if (!result) return "none";
  return isToday(result.dateKey) ? "today" : "future";
}
