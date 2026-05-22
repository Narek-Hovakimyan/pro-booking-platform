/**
 * Pure helper functions and constants for booking logic.
 * No req, res, database writes, or external mutations.
 */

import {
  dateKeyPattern,
  formatDateKey,
  getArmeniaDateKey,
  getArmeniaMinutesOfDay,
  timeToMinutes,
} from "./bookingDateTime.js";

// ─── Default schedule values ───
export const defaultWorkingDaySchedule = {
  working: true,
  from: "09:00",
  to: "18:00",
  breakFrom: "",
  breakTo: "",
};

export const defaultWeeklySchedule = {
  mon: { ...defaultWorkingDaySchedule },
  tue: { ...defaultWorkingDaySchedule },
  wed: { ...defaultWorkingDaySchedule },
  thu: { ...defaultWorkingDaySchedule },
  fri: { ...defaultWorkingDaySchedule },
  sat: { ...defaultWorkingDaySchedule },
  sun: { ...defaultWorkingDaySchedule },
};

export const defaultPersonalSchedule = {
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
  breakStart: "",
  breakEnd: "",
};

// ─── Status constants ───
export const monthKeyPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
export const blockingBookingStatuses = ["pending", "accepted", "confirmed"];
export const incomeBookingStatuses = ["pending", "accepted", "completed"];
export const maxRejectionReasonLength = 300;
export const maxCancellationReasonLength = 300;

// ─── ID helpers ───
export const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

// ─── Slot / schedule helpers ───

export const getScheduleSlotError = (daySchedule, time, duration) => {
  if (!daySchedule?.working) return "Barber is not working this day";

  const start = timeToMinutes(daySchedule.from);
  const end = timeToMinutes(daySchedule.to);
  const slotStart = timeToMinutes(time);
  const slotDuration = Number(duration);

  if (
    start === null ||
    end === null ||
    slotStart === null ||
    !Number.isFinite(slotDuration) ||
    slotDuration <= 0
  ) {
    return "This time is outside working hours";
  }

  const slotEnd = slotStart + slotDuration;
  const breakStart = timeToMinutes(daySchedule.breakFrom);
  const breakEnd = timeToMinutes(daySchedule.breakTo);
  const crossesBreak =
    breakStart !== null &&
    breakEnd !== null &&
    slotStart < breakEnd &&
    slotEnd > breakStart;

  if (slotStart < start || slotStart >= end) {
    return "This time is outside working hours";
  }

  if (slotEnd > end || crossesBreak) {
    return "Not enough time for selected service";
  }

  return "";
};

export const getDayScheduleFromDefaultSchedule = (defaultSchedule = defaultPersonalSchedule) => ({
  working: true,
  from: defaultSchedule.startTime || defaultPersonalSchedule.startTime,
  to: defaultSchedule.endTime || defaultPersonalSchedule.endTime,
  breakFrom: defaultSchedule.hasBreak ? defaultSchedule.breakStart || "" : "",
  breakTo: defaultSchedule.hasBreak ? defaultSchedule.breakEnd || "" : "",
});

export const isMeaningfulWeeklyDay = (daySchedule) =>
  Boolean(daySchedule?.working) &&
  timeToMinutes(daySchedule.from) !== null &&
  timeToMinutes(daySchedule.to) !== null;

const getExplicitWeeklyDayOff = (daySchedule) =>
  daySchedule?.working === false
    ? {
        working: false,
        from: daySchedule.from || "",
        to: daySchedule.to || "",
        breakFrom: daySchedule.breakFrom || "",
        breakTo: daySchedule.breakTo || "",
      }
    : null;

export const getScheduleForDate = (schedule, dateKey, dayKey, defaultSchedule) => {
  const override = schedule?.scheduleOverrides?.[dateKey];

  if (override) {
    return {
      working: Boolean(override.isWorking),
      from: override.startTime || "",
      to: override.endTime || "",
      breakFrom: override.breakStart || "",
      breakTo: override.breakEnd || "",
    };
  }

  const weeklyDaySchedule = schedule?.weeklySchedule?.[dayKey];
  const explicitWeeklyDayOff = getExplicitWeeklyDayOff(weeklyDaySchedule);

  if (explicitWeeklyDayOff) {
    return explicitWeeklyDayOff;
  }

  if (isMeaningfulWeeklyDay(weeklyDaySchedule)) {
    return weeklyDaySchedule;
  }

  return (
    getDayScheduleFromDefaultSchedule(defaultSchedule) ||
    defaultWeeklySchedule[dayKey] ||
    defaultWorkingDaySchedule
  );
};

// ─── Time / overlap helpers ───

export const isPastBookingTime = (dateKey, time) => {
  const todayKey = getArmeniaDateKey(new Date());

  if (dateKey < todayKey) return true;
  if (dateKey > todayKey) return false;

  const slotMinutes = timeToMinutes(time);
  const nowMinutes = getArmeniaMinutesOfDay(new Date());

  return slotMinutes !== null && slotMinutes <= nowMinutes;
};

export const slotOverlaps = (booking, time, duration) => {
  const bookingStart = timeToMinutes(booking.time);
  const bookingDuration = Number(booking.duration);
  const nextStart = timeToMinutes(time);
  const nextDuration = Number(duration);

  if (
    bookingStart === null ||
    nextStart === null ||
    !Number.isFinite(bookingDuration) ||
    !Number.isFinite(nextDuration)
  ) {
    return false;
  }

  return nextStart < bookingStart + bookingDuration &&
    nextStart + nextDuration > bookingStart;
};

// ─── Booking date helpers ───

export const getBookingMonthKey = (booking) => {
  const bookingDate = booking?.bookingDate || "";
  const dayKey = booking?.dayKey || "";

  if (typeof bookingDate === "string" && dateKeyPattern.test(bookingDate)) {
    return bookingDate.slice(0, 7);
  }

  if (typeof dayKey === "string" && dateKeyPattern.test(dayKey)) {
    return dayKey.slice(0, 7);
  }

  if (booking?.completedAt) {
    return formatDateKey(new Date(booking.completedAt)).slice(0, 7);
  }

  return "";
};

export const getBookingDate = (booking) =>
  booking.bookingDate || booking.dayLabel || booking.dayKey;

// ─── Status helpers ───

export const normalizeBookingStatus = (status) =>
  status === "confirmed" ? "accepted" : status;

// ─── Formatting helpers ───

export const formatBookedMessage = (clientName, booking) => {
  const service = booking.serviceName ? `${booking.serviceName} ` : "";
  return `${clientName} booked ${service}on ${getBookingDate(booking)} at ${booking.time}`;
};

export const formatStatusMessage = (barberName, booking, status) =>
  `Your booking with ${barberName} on ${getBookingDate(booking)} at ${booking.time} was ${status}`;

export const formatRejectedMessage = (barberName, booking) => {
  const reason = (booking.rejectionReason || "").trim();
  const message = formatStatusMessage(barberName, booking, "rejected");

  return reason ? `${message}. Reason: ${reason}` : message;
};

export const formatCancelledMessage = (clientName, booking) => {
  const reason = (booking.cancelReason || "").trim();
  const message = `${clientName} cancelled booking on ${getBookingDate(booking)} at ${booking.time}.`;

  return reason ? `${message} Reason: ${reason}` : message;
};

// ─── Booking key helpers ───

export const getBookingCreationLockKey = ({ barberId, bookingDate }) =>
  `${String(barberId)}:${bookingDate}`;

// ─── Serialization ───

export const serializeAvailabilityBooking = (booking, viewerUserId) => {
  const isOwnClientBooking =
    booking?.clientId && String(booking.clientId) === String(viewerUserId);

  return {
    _id: booking._id,
    id: booking._id,
    barberId: booking.barberId,
    clientId: isOwnClientBooking ? booking.clientId : null,
    salonId: booking?.salonId || null,
    bookingDate: booking.bookingDate,
    dayKey: booking.dayKey,
    time: booking.time,
    duration: booking.duration,
    status: booking.status,
  };
};
