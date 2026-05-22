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
