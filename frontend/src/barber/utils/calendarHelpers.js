import { timeToMinutes } from "@/shared/utils/time";
import { getDayScheduleFromDefaultSchedule } from "@/shared/data/schedule";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const TIMELINE_INTERVAL_MINUTES = 10;
export const FALLBACK_DEFAULT_SCHEDULE = {
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
  breakStart: "",
  breakEnd: "",
};

// Default visible range when no schedule data exists
const FALLBACK_VISIBLE_START = "08:00";
const FALLBACK_VISIBLE_END = "22:00";

/**
 * Compute the visible time range for a calendar view.
 *
 * @param {object} options
 * @param {Array<{from?:string, to?:string}>} options.schedules – day schedule objects (each has from/to)
 * @param {Array} options.bookings – booking objects (uses getBookingTime/getBookingDuration)
 * @param {string} [options.fallbackStart="08:00"] – fallback start time when no schedules
 * @param {string} [options.fallbackEnd="22:00"]   – fallback end time when no schedules
 * @returns {{ start: number, end: number, hours: number }}
 */
export function getVisibleTimeRange({
  schedules = [],
  bookings = [],
  fallbackStart = FALLBACK_VISIBLE_START,
  fallbackEnd = FALLBACK_VISIBLE_END,
} = {}) {
  let startMin, endMin;

  if (schedules.length > 0) {
    // Use schedule as base — start from extremes, contract to actual range
    startMin = Infinity;
    endMin = -Infinity;
    for (const s of schedules) {
      if (s?.from && s?.to) {
        const f = timeToMinutes(s.from);
        const t = timeToMinutes(s.to);
        if (f !== null && t !== null && f < t) {
          if (f < startMin) startMin = f;
          if (t > endMin) endMin = t;
        }
      }
    }
    // If all schedules were invalid, fall back
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) {
      startMin = timeToMinutes(fallbackStart);
      endMin = timeToMinutes(fallbackEnd);
      if (startMin === null) startMin = 8 * 60;
      if (endMin === null) endMin = 22 * 60;
    }
  } else {
    // No schedules — use fallback
    startMin = timeToMinutes(fallbackStart);
    endMin = timeToMinutes(fallbackEnd);
    if (startMin === null) startMin = 8 * 60;
    if (endMin === null) endMin = 22 * 60;
  }

  // Expand range to include all bookings (start + duration)
  for (const b of bookings) {
    const bStart = timeToMinutes(getBookingTime(b));
    if (bStart !== null) {
      startMin = Math.min(startMin, bStart);
      endMin = Math.max(endMin, bStart + getBookingDuration(b));
    }
  }

  // Round to nearest hour
  startMin = Math.max(0, Math.floor(startMin / 60) * 60);
  endMin = Math.min(24 * 60, Math.ceil(endMin / 60) * 60);

  // Enforce minimum range (at least 2 hours)
  if (endMin - startMin < 120) {
    endMin = startMin + 120;
  }

  return { start: startMin, end: endMin, hours: (endMin - startMin) / 60 };
}

export function getMonthDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const cells = [];
  for (let i = 0; i < startPad; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export function getBookingColor(status) {
  switch (status) {
    case "pending":
      return "bg-amber-400";
    case "accepted":
      return "bg-emerald-500";
    case "completed":
      return "bg-blue-500";
    case "rejected":
    case "cancelled":
    case "expired":
    case "no_show":
    case "late_cancelled":
      return "bg-red-400";
    default:
      return "bg-neutral-300";
  }
}

export function getBookingId(booking) {
  return booking?.id || booking?._id || `${booking?.bookingDate || ""}-${booking?.time || ""}`;
}

export function getClientName(booking) {
  return booking?.client?.name || booking?.clientName || "Client";
}

export function getBookingTime(booking) {
  return booking?.time || "";
}

export function getBookingDuration(booking) {
  const duration = Number(booking?.duration || 20);
  return Number.isFinite(duration) && duration > 0 ? duration : 20;
}

export function getBookingServiceName(booking) {
  return booking?.service?.name || booking?.serviceName || "Service";
}

export function getBookingStatus(booking) {
  return booking?.status || "pending";
}

export function getEffectiveDaySchedule(scheduleEntry, selectedDateKey, defaultSchedule) {
  const scheduleOverrides = scheduleEntry?.scheduleOverrides || {};
  const nonWorkingDays = scheduleEntry?.nonWorkingDays || [];
  const selectedOverride = scheduleOverrides[selectedDateKey];
  const baseDefaultSchedule = defaultSchedule || FALLBACK_DEFAULT_SCHEDULE;

  const selectedDaySchedule = selectedOverride
    ? {
        working: Boolean(selectedOverride.isWorking),
        from: selectedOverride.startTime || "",
        to: selectedOverride.endTime || "",
        breakFrom: selectedOverride.breakStart || "",
        breakTo: selectedOverride.breakEnd || "",
      }
    : getDayScheduleFromDefaultSchedule(baseDefaultSchedule);

  return {
    selectedDaySchedule,
    isNonWorkingDay:
      nonWorkingDays.includes(selectedDateKey) || !selectedDaySchedule?.working,
  };
}

export function getTimelineRowType({
  slotMinutes,
  breakStartMinutes,
  breakEndMinutes,
  bookingStartingAtSlot,
  overlappingBooking,
}) {
  if (
    breakStartMinutes !== null &&
    breakEndMinutes !== null &&
    slotMinutes >= breakStartMinutes &&
    slotMinutes < breakEndMinutes
  ) {
    return slotMinutes === breakStartMinutes ? "break-start" : "break-continue";
  }

  if (bookingStartingAtSlot) {
    return "booking-start";
  }

  if (overlappingBooking) {
    return "booking-continue";
  }

  return "free";
}

export function isDayToday(day, viewYear, viewMonth, todayKey) {
  if (day === null) return false;
  const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return dateStr === todayKey;
}

export function isDaySelected(day, viewYear, viewMonth, selectedDateKey) {
  if (day === null) return false;
  const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return dateStr === selectedDateKey;
}

export function getDayDateStr(day, viewYear, viewMonth) {
  if (day === null) return "";
  return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
