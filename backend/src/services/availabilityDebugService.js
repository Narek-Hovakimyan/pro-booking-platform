import Booking from "../models/Booking.js";
import Salon from "../models/Salon.js";
import Schedule from "../models/Schedule.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import {
  getApprovedUserSalonIds,
} from "./salon/salonMembershipService.js";
import {
  normalizeScheduleForAvailability,
  serializeDefaultSchedule,
} from "../utils/scheduleUtils.js";
import {
  blockingBookingStatuses,
  getDayScheduleFromDefaultSchedule,
  getScheduleForDate,
  getScheduleSlotError,
  isPastBookingTime,
  normalizeBookingStatus,
  slotOverlaps,
} from "../utils/bookingUtils.js";
import {
  getDayKeyFromDate,
  isDateKey,
  isTimeKey,
} from "../utils/bookingDateTime.js";
import {
  canUserManageSalon,
  isUserApprovedForSalon,
} from "./salon/salonMembershipService.js";

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

/**
 * Authorize a user to debug availability for a barber+salon combination.
 *
 * - Non-barbers are rejected (403).
 * - A barber can debug their own availability only for approved salons.
 * - A salon owner/admin can debug any approved barber in a managed salon.
 * - A regular employee can only debug themselves.
 */
export const authorizeDebugAccess = async ({ requester, barberId, salonId }) => {
  const requesterId = getIdString(requester);

  if (requester.role !== "barber") {
    return { allowed: false, status: 403, message: "Only barbers can debug availability" };
  }

  const salon = await Salon.findById(salonId);

  if (!salon) {
    return { allowed: false, status: 400, message: "Salon not found" };
  }

  // Barber debugging self — allowed only for salons they are approved for.
  if (requesterId === getIdString(barberId)) {
    const requesterSalonUser = await User.findById(barberId).select("salon salonStatus salons role");

    if (!requesterSalonUser || requesterSalonUser.role !== "barber") {
      return { allowed: false, status: 404, message: "Barber not found" };
    }

    if (!isUserApprovedForSalon(requesterSalonUser, salonId)) {
      return {
        allowed: false,
        status: 400,
        message: "Barber does not work in selected salon",
      };
    }

    return { allowed: true };
  }

  // Barber is debugging another barber — check salon owner/admin
  const canManage = canUserManageSalon(requester, salon);

  if (!canManage) {
    return { allowed: false, status: 403, message: "You can only debug your own availability" };
  }

  // Owner/admin — check target barber is approved for this salon
  const targetBarber = await User.findById(barberId).select("salon salonStatus salons role");

  if (!targetBarber || targetBarber.role !== "barber") {
    return { allowed: false, status: 404, message: "Barber not found" };
  }

  if (!isUserApprovedForSalon(targetBarber, salonId)) {
    return { allowed: false, status: 400, message: "Barber is not approved for this salon" };
  }

  return { allowed: true };
};

/**
 * Validate incoming debug request body.
 */
export const validateDebugRequest = ({ barberId, salonId, date, time, serviceId }) => {
  const errors = [];

  if (!barberId) errors.push("barberId is required");
  if (!salonId) errors.push("salonId is required");
  if (!date) errors.push("date is required");
  if (!serviceId) errors.push("serviceId is required");

  if (errors.length > 0) {
    return { valid: false, status: 400, message: errors.join("; ") };
  }

  if (!isDateKey(date)) {
    return { valid: false, status: 400, message: "date must be YYYY-MM-DD" };
  }

  if (time !== undefined && time !== null && time !== "" && !isTimeKey(time)) {
    return { valid: false, status: 400, message: "time must be HH:mm" };
  }

  return { valid: true };
};

/**
 * Load service and check availability.
 */
export const loadDebugService = async ({ serviceId, barberId }) => {
  const service = await Service.findOne({ _id: serviceId, barberId });

  if (!service) {
    return { found: false, status: 400, message: "Service is not available for this barber" };
  }

  return {
    found: true,
    service: {
      id: service._id,
      name: service.name,
      duration: service.duration,
      isActive: service.active,
    },
  };
};

/**
 * Build the schedule portion of the debug response.
 */
export const buildScheduleContext = async ({ barberId, salonId, date }) => {
  const scheduleQuery = salonId ? { barberId, salonId } : { barberId };
  const barber = await User.findById(barberId).select("-password");
  const schedule = await Schedule.findOne(scheduleQuery);

  const dayKey = getDayKeyFromDate(date);
  const salonEntry = (barber?.salons || []).find(
    (s) => getIdString(s?.salon) === String(salonId || "")
  );
  const scheduleDefaults = serializeDefaultSchedule(
    schedule?.defaultSchedule,
    salonEntry?.defaultSchedule
  );
  const availabilitySchedule = normalizeScheduleForAvailability(schedule);

  const daySchedule = getScheduleForDate(
    availabilitySchedule,
    date,
    dayKey,
    scheduleDefaults
  );

  const isNonWorkingDay = availabilitySchedule?.nonWorkingDays?.includes(date);
  const hasOverride = Boolean(availabilitySchedule?.scheduleOverrides?.[date]);

  return {
    daySchedule,
    isNonWorkingDay,
    hasOverride,
    source: schedule ? (hasOverride ? "override" : "schedule") : "default",
  };
};

/**
 * Run all availability checks for a given time.
 * Returns the first failed check explanation, or null if available.
 */
export const checkSlotAvailability = ({
  barberId,
  salonId,
  date,
  time,
  duration,
  daySchedule,
  isNonWorkingDay,
  blockingBookings,
}) => {
  // 1) Past time check
  if (isPastBookingTime(date, time)) {
    return { available: false, explanation: "This time is already past" };
  }

  // 2) Non-working day
  if (isNonWorkingDay || !daySchedule?.working) {
    return { available: false, explanation: "Barber is not working this day" };
  }

  // 3) Outside working hours / break
  const scheduleSlotError = getScheduleSlotError(daySchedule, time, duration);

  if (scheduleSlotError) {
    if (
      scheduleSlotError === "This time is outside working hours"
    ) {
      return { available: false, explanation: "This time is outside working hours" };
    }

    return { available: false, explanation: "Not enough time for selected service" };
  }

  // 4) Booking conflict
  const hasOverlap = blockingBookings.some((booking) =>
    blockingBookingStatuses.includes(normalizeBookingStatus(booking?.status)) &&
    slotOverlaps(booking, time, duration)
  );

  if (hasOverlap) {
    return { available: false, explanation: "This time is already booked" };
  }

  return { available: true, explanation: "This time is available" };
};

/**
 * Load blocking bookings for a given date, excluding client details.
 */
export const loadBlockingBookings = async ({ barberId, date }) => {
  const bookings = await Booking.find({
    barberId,
    status: { $in: blockingBookingStatuses },
    bookingDate: date,
  }).lean();

  return bookings.map((booking) => ({
    id: booking._id,
    time: booking.time,
    duration: booking.duration,
    endTime: (() => {
      const minutes = (() => {
        const [h, m] = booking.time.split(":").map(Number);
        return h * 60 + m + (booking.duration || 0);
      })();
      return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    })(),
    status: booking.status,
    salonId: booking.salonId,
  }));
};

/**
 * Build the full checks context for the debug response.
 */
export const buildChecksContext = ({
  date,
  time,
  daySchedule,
  isNonWorkingDay,
  blockingBookings,
  duration,
}) => {
  const checks = {
    isPast: Boolean(time && isPastBookingTime(date, time)),
    outsideWorkingHours: false,
    exceedsWorkingHours: false,
    crossesBreak: false,
    hasBookingConflict: false,
  };

  if (time && daySchedule?.working && !isNonWorkingDay) {
    const start = (() => {
      const [h, m] = (daySchedule.from || "09:00").split(":").map(Number);
      return h * 60 + m;
    })();
    const end = (() => {
      const [h, m] = (daySchedule.to || "18:00").split(":").map(Number);
      return h * 60 + m;
    })();
    const slotStart = (() => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    })();
    const slotEnd = slotStart + duration;
    const breakStart = daySchedule.breakFrom
      ? (() => {
          const [h, m] = daySchedule.breakFrom.split(":").map(Number);
          return h * 60 + m;
        })()
      : null;
    const breakEnd = daySchedule.breakTo
      ? (() => {
          const [h, m] = daySchedule.breakTo.split(":").map(Number);
          return h * 60 + m;
        })()
      : null;

    checks.outsideWorkingHours = slotStart < start || slotStart >= end;
    checks.exceedsWorkingHours = slotEnd > end;
    checks.crossesBreak =
      breakStart !== null &&
      breakEnd !== null &&
      slotStart < breakEnd &&
      slotEnd > breakStart;

    const hasOverlap = blockingBookings.some((booking) =>
      blockingBookingStatuses.includes(normalizeBookingStatus(booking?.status)) &&
      slotOverlaps(booking, time, duration)
    );
    checks.hasBookingConflict = hasOverlap;
  }

  return checks;
};

/**
 * Main diagnostic function — run all checks and return the debug payload.
 */
export const debugAvailability = async ({
  barberId,
  salonId,
  date,
  time,
  serviceId,
}) => {
  // Load service
  const serviceResult = await loadDebugService({ serviceId, barberId });

  if (!serviceResult.found) {
    return serviceResult;
  }

  const { service } = serviceResult;
  const duration = service.duration;

  // Build schedule context
  const {
    daySchedule,
    isNonWorkingDay,
    hasOverride,
    source,
  } = await buildScheduleContext({ barberId, salonId, date });

  // Build blocking bookings
  const blockingBookings = await loadBlockingBookings({ barberId, date });

  if (service.isActive === false) {
    return {
      available: false,
      explanation: "Selected service is inactive.",
      barberId,
      salonId,
      service,
      date,
      time: time || null,
      schedule: {
        source,
        isWorking: daySchedule?.working ?? true,
        startTime: daySchedule?.from || "",
        endTime: daySchedule?.to || "",
        hasBreak: Boolean(daySchedule?.breakFrom),
        breakStart: daySchedule?.breakFrom || "",
        breakEnd: daySchedule?.breakTo || "",
        hasOverride,
        isNonWorkingDay,
      },
      checks: buildChecksContext({
        date,
        time: time || null,
        daySchedule,
        isNonWorkingDay,
        blockingBookings,
        duration,
      }),
      blockingBookings,
    };
  }

  // If no time provided, return context without slot-level check
  if (!time) {
    return {
      available: false,
      explanation: "Select a time to see slot-level availability.",
      barberId,
      salonId,
      service,
      date,
      time: null,
      schedule: {
        source,
        isWorking: daySchedule?.working ?? true,
        startTime: daySchedule?.from || "",
        endTime: daySchedule?.to || "",
        hasBreak: Boolean(daySchedule?.breakFrom),
        breakStart: daySchedule?.breakFrom || "",
        breakEnd: daySchedule?.breakTo || "",
        hasOverride,
        isNonWorkingDay,
      },
      checks: buildChecksContext({
        date,
        time: null,
        daySchedule,
        isNonWorkingDay,
        blockingBookings,
        duration,
      }),
      blockingBookings,
    };
  }

  // Run slot-level checks
  const slotResult = checkSlotAvailability({
    barberId,
    salonId,
    date,
    time,
    duration,
    daySchedule,
    isNonWorkingDay,
    blockingBookings,
  });

  return {
    available: slotResult.available,
    explanation: slotResult.explanation,
    barberId,
    salonId,
    service,
    date,
    time,
    schedule: {
      source,
      isWorking: daySchedule?.working ?? true,
      startTime: daySchedule?.from || "",
      endTime: daySchedule?.to || "",
      hasBreak: Boolean(daySchedule?.breakFrom),
      breakStart: daySchedule?.breakFrom || "",
      breakEnd: daySchedule?.breakTo || "",
      hasOverride,
      isNonWorkingDay,
    },
    checks: buildChecksContext({
      date,
      time,
      daySchedule,
      isNonWorkingDay,
      blockingBookings,
      duration,
    }),
    blockingBookings,
  };
};
