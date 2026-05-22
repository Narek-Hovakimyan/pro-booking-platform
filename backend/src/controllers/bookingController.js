import BarberProfile from "../models/BarberProfile.js";
import Booking from "../models/Booking.js";
import mongoose from "mongoose";
import Salon from "../models/Salon.js";
import Schedule from "../models/Schedule.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import {
  getApprovedUserSalonIds,
  getPrimaryApprovedSalonId,
} from "../services/salon/salonMembershipService.js";
import {
  authorizeDebugAccess,
  debugAvailability,
  validateDebugRequest,
} from "../services/availabilityDebugService.js";
import {
  normalizeScheduleForAvailability,
  serializeDefaultSchedule,
} from "../utils/scheduleUtils.js";
import {
  getAccessibleClientReliabilitySummary,
} from "../services/clientReliabilityService.js";
import { getBarberMonthlyIncomeSummary } from "../services/bookingAnalyticsService.js";
import {
  markBookingLateCancel,
  markBookingNoShow,
} from "../services/bookingOutcomeService.js";
import {
  getBarberBookingsForRequester,
  getClientBookingsForRequester,
} from "../services/bookingReadService.js";
import {
  emitBookingUpdated,
  notifyUsersForBookingStatusChange,
  notifyWaitlistForReleasedBookingSlot,
} from "../services/bookingSideEffectsService.js";
import { createNotification } from "./notificationController.js";
import { createCrudController } from "./crudController.js";
import {
  getDayKeyFromDate,
  isDateKey,
  isTimeKey,
  timeToMinutes,
} from "../utils/bookingDateTime.js";
import {
  blockingBookingStatuses,
  defaultPersonalSchedule,
  defaultWeeklySchedule,
  defaultWorkingDaySchedule,
  formatBookedMessage,
  getBookingCreationLockKey,
  getDayScheduleFromDefaultSchedule,
  getIdString,
  getScheduleForDate,
  getScheduleSlotError,
  isPastBookingTime,
  maxCancellationReasonLength,
  maxRejectionReasonLength,
  normalizeBookingStatus,
  slotOverlaps,
} from "../utils/bookingUtils.js";

const bookingCreationLocks = new Map();

export const bookingController = createCrudController(Booking, "Booking");

const isValidObjectId = (value) =>
  Boolean(value) && mongoose.Types.ObjectId.isValid(String(value));

const allowedBookingDelayMinutes = new Set([10, 20]);
const reschedulableBookingStatuses = new Set(["pending", "accepted"]);

const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");

  return `${hours}:${mins}`;
};

const dateKeyToDate = (dateKey) => {
  if (!isDateKey(dateKey)) return undefined;

  return new Date(`${dateKey}T00:00:00.000Z`);
};

const storedDateToDateKey = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    return isDateKey(value) ? value : value.slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return "";
};

const hasOwnBodyField = (body, field) =>
  Object.prototype.hasOwnProperty.call(body || {}, field);

const attemptsDateTimeChange = (body, booking) => {
  if (
    hasOwnBodyField(body, "bookingDate") &&
    storedDateToDateKey(body.bookingDate) !==
      storedDateToDateKey(booking.bookingDate)
  ) {
    return true;
  }

  if (
    hasOwnBodyField(body, "dayKey") &&
    String(body.dayKey || "") !== String(booking.dayKey || "")
  ) {
    return true;
  }

  if (
    hasOwnBodyField(body, "time") &&
    String(body.time || "") !== String(booking.time || "")
  ) {
    return true;
  }

  return false;
};

const isAssignedBarberForBooking = (requester, booking) =>
  requester?.role === "barber" &&
  String(requester._id) === String(booking.barberId);

const isClientForBooking = (requester, booking) =>
  requester?.role === "client" &&
  String(requester._id) === String(booking.clientId);

const hasPendingRescheduleRequest = (booking) =>
  booking?.rescheduleRequest?.status === "pending";

const createNotificationNonFatal = async (payload) => {
  try {
    await createNotification(payload);
  } catch (error) {
    console.error("Booking reschedule notification error:", error.message);
  }
};

const resolveBookingSalon = async ({ barberId, salonId }) => {
  const barber = await User.findById(barberId).select(
    "salon salonStatus salons role"
  );

  if (!barber || barber.role !== "barber") {
    return { message: "Barber not found" };
  }

  const requestedSalonId = salonId ? String(salonId) : "";

  if (requestedSalonId) {
    if (!isValidObjectId(requestedSalonId)) {
      return { message: "Invalid salon" };
    }

    const salonExists = await Salon.exists({ _id: requestedSalonId });

    if (!salonExists) {
      return { message: "Salon not found" };
    }

    const approvedSalonIds = getApprovedUserSalonIds(barber);

    if (!approvedSalonIds.includes(requestedSalonId)) {
      return { message: "Barber does not work in selected salon" };
    }

    return { barber, salonId: requestedSalonId };
  }

  const inferredSalonId = getPrimaryApprovedSalonId(barber);

  if (!inferredSalonId) {
    return { barber, salonId: null };
  }

  const inferredSalonExists = await Salon.exists({ _id: inferredSalonId });

  return {
    barber,
    salonId: inferredSalonExists ? inferredSalonId : null,
  };
};

const getClientName = async (booking, fallbackUser) => {
  if (booking.clientName) return booking.clientName;
  if (fallbackUser?.name) return fallbackUser.name;

  const client = await User.findById(booking.clientId).select("name");
  return client?.name || "Client";
};

const validateBookingSlot = async ({
  barberId,
  salonId,
  barber: providedBarber = null,
  bookingDate,
  dayKey,
  time,
  duration,
  ignoreBookingId = null,
}) => {
  if (!isDateKey(bookingDate)) {
    return { message: "bookingDate must be YYYY-MM-DD" };
  }

  if (!isTimeKey(time)) {
    return { message: "time must be HH:mm" };
  }

  if (isPastBookingTime(bookingDate, time)) {
    return { message: "This time is already past" };
  }

  const effectiveDayKey = getDayKeyFromDate(bookingDate) || dayKey;

  // Get per-salon schedule
  const scheduleQuery = salonId ? { barberId, salonId } : { barberId };
  const [schedule, barber] = await Promise.all([
    Schedule.findOne(scheduleQuery),
    providedBarber || User.findById(barberId).select("-password"),
  ]);

  // Prefer the selected salon's saved schedule, while keeping legacy salon-entry defaults.
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
    bookingDate,
    effectiveDayKey,
    scheduleDefaults
  );

  if (availabilitySchedule?.nonWorkingDays?.includes(bookingDate) || !daySchedule?.working) {
    return { message: "Barber is not working this day" };
  }

  const scheduleSlotError = getScheduleSlotError(daySchedule, time, duration);

  if (scheduleSlotError) {
    return { message: scheduleSlotError };
  }

  // Check barber slot overlap across all salons. Only blocking statuses reserve slots.
  const activeBookingQuery = {
    barberId,
    status: { $in: blockingBookingStatuses },
    bookingDate,
  };

  if (ignoreBookingId) {
    activeBookingQuery._id = { $ne: ignoreBookingId };
  }

  const activeBookings = await Booking.find(activeBookingQuery);
  const hasOverlap = activeBookings.some((booking) =>
    blockingBookingStatuses.includes(normalizeBookingStatus(booking?.status)) &&
    slotOverlaps(booking, time, duration)
  );

  if (hasOverlap) {
    return { message: "This time is already booked" };
  }

  return { effectiveDayKey };
};

const withBookingCreationLock = async (lockKey, task) => {
  const previousLock = bookingCreationLocks.get(lockKey) || Promise.resolve();
  let releaseCurrentLock;
  const currentLock = new Promise((resolve) => {
    releaseCurrentLock = resolve;
  });

  const queuedLock = previousLock.then(() => currentLock, () => currentLock);
  bookingCreationLocks.set(lockKey, queuedLock);

  await previousLock.catch(() => {});

  try {
    return await task();
  } finally {
    releaseCurrentLock();

    if (bookingCreationLocks.get(lockKey) === queuedLock) {
      bookingCreationLocks.delete(lockKey);
    }
  }
};

export const __bookingTestHooks = {
  allowedBookingDelayMinutes,
  blockingBookingStatuses,
  normalizeBookingStatus,
  slotOverlaps,
  validateBookingSlot,
  withBookingCreationLock,
};

export const createBooking = async (req, res) => {
  try {
    const {
      barberId,
      clientId,
      serviceId,
      dayKey,
      bookingDate,
      time,
      createdBy = "client",
    } = req.body;
    const isManualBooking = createdBy === "barber";
    const clientName = (req.body.clientName || "").trim();
    const clientPhone = (req.body.clientPhone || req.body.phone || "").trim();
    const status = isManualBooking ? "accepted" : "pending";

    if (!barberId || !serviceId || (!isManualBooking && !clientId)) {
      return res.status(400).json({
        message: "Select service first",
      });
    }

    if (!barberId || !bookingDate || !time) {
      return res.status(400).json({
        message: "barberId, bookingDate, and time are required",
      });
    }

    if (isManualBooking && !clientName) {
      return res.status(400).json({ message: "Client name is required" });
    }

    if (
      !isManualBooking &&
      (req.user?.role !== "client" || String(req.user._id) !== String(clientId))
    ) {
      return res.status(403).json({
        message: "You can create bookings only for yourself",
      });
    }

    if (
      isManualBooking &&
      (req.user?.role !== "barber" || String(req.user.id) !== String(barberId))
    ) {
      return res.status(403).json({
        message: "You can create bookings only for your own barber calendar",
      });
    }

    const service = await Service.findOne({ _id: serviceId, barberId });

    if (!service) {
      return res.status(400).json({
        message: "Service is not available for this barber",
      });
    }

    const bookingDuration = Number(service.duration);
    const bookingPrice = Number(service.price);
    const salonResolution = await resolveBookingSalon({
      barberId,
      salonId: req.body.salonId,
    });

    if (salonResolution.message) {
      return res.status(400).json({
        message: salonResolution.message,
      });
    }

    const slotValidation = await validateBookingSlot({
      barberId,
      salonId: salonResolution.salonId,
      barber: salonResolution.barber,
      bookingDate,
      dayKey,
      time,
      duration: bookingDuration,
    });

    if (slotValidation.message) {
      return res.status(400).json({
        message: slotValidation.message,
      });
    }

    const lockKey = getBookingCreationLockKey({ barberId, bookingDate });
    const createResult = await withBookingCreationLock(lockKey, async () => {
      const latestSlotValidation = await validateBookingSlot({
        barberId,
        salonId: salonResolution.salonId,
        barber: salonResolution.barber,
        bookingDate,
        dayKey,
        time,
        duration: bookingDuration,
      });

      if (latestSlotValidation.message) {
        return { message: latestSlotValidation.message };
      }

      const booking = await Booking.create({
        barberId,
        serviceId,
        clientId: isManualBooking ? null : clientId,
        clientName: isManualBooking ? clientName : req.body.clientName,
        clientPhone,
        phone: isManualBooking ? clientPhone : req.body.phone,
        createdBy: isManualBooking ? "barber" : "client",
        note: req.body.note || "",
        salonId: salonResolution.salonId,
        bookingDate,
        time,
        dayKey: latestSlotValidation.effectiveDayKey,
        serviceName: service.name,
        duration: bookingDuration,
        price: bookingPrice,
        status,
      });

      return { booking };
    });

    if (createResult.message) {
      return res.status(400).json({
        message: createResult.message,
      });
    }

    const { booking } = createResult;
    const notificationClientName = await getClientName(booking, req.user);

    if (!isManualBooking) {
      await createNotification({
        userId: barberId,
        type: "booking_created",
        message: formatBookedMessage(notificationClientName, booking),
      });
    }

    emitBookingUpdated(booking, "created");

    return res.status(201).json(booking);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not create booking",
    });
  }
};

export const updateBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const previousStatus = booking.status;
    const requestedStatus = req.body.status;
    const isAccepting = requestedStatus === "accepted";
    const isCompleting = requestedStatus === "completed";
    const isRejecting = requestedStatus === "rejected";
    const isCancelling = requestedStatus === "cancelled";
    const isRescheduling =
      req.body.time !== undefined ||
      req.body.dayKey !== undefined ||
      req.body.bookingDate !== undefined;
    const hasStatusAction =
      isAccepting || isCompleting || isRejecting || isCancelling;
    const isAssignedBarber =
      req.user?.role === "barber" &&
      String(req.user._id) === String(booking.barberId);
    const isBookingClient =
      req.user?.role === "client" &&
      String(req.user._id) === String(booking.clientId);
    const safeUpdates = {};
    let rescheduleSlotRequest = null;

    if (
      isBookingClient &&
      normalizeBookingStatus(booking.status) === "accepted" &&
      attemptsDateTimeChange(req.body, booking)
    ) {
      return res.status(400).json({
        message: "Accepted bookings must be rescheduled by request.",
      });
    }

    if (requestedStatus && !hasStatusAction) {
      return res.status(400).json({ message: "Invalid booking status" });
    }

    if (isRescheduling && hasStatusAction) {
      return res.status(400).json({
        message: "Update booking status and time separately",
      });
    }

    if (isAccepting) {
      if (!isAssignedBarber) {
        return res.status(403).json({
          message: "Only barber can accept booking",
        });
      }

      if (booking.status !== "pending") {
        return res.status(400).json({
          message: "Only pending bookings can be accepted",
        });
      }

      safeUpdates.status = "accepted";
    }

    if (isCompleting) {
      if (!isAssignedBarber) {
        return res.status(403).json({
          message: "Only barber can complete booking",
        });
      }

      if (booking.status !== "accepted") {
        return res.status(400).json({
          message: "Only accepted bookings can be completed",
        });
      }

      safeUpdates.status = "completed";
      safeUpdates.completedAt = new Date();
    }

    if (isRejecting) {
      const rejectionReason = (req.body.rejectionReason || "").trim();

      if (req.user?.role === "client") {
        return res.status(403).json({
          message: "Only barber can reject booking",
        });
      }

      if (!isAssignedBarber) {
        return res.status(403).json({
          message: "Only the assigned barber can reject this booking",
        });
      }

      if (booking.status !== "pending" && booking.status !== "accepted") {
        return res.status(400).json({
          message: "Only pending or accepted bookings can be rejected",
        });
      }

      if (!rejectionReason) {
        return res.status(400).json({
          message: "Please provide a rejection reason",
        });
      }

      if (rejectionReason.length > maxRejectionReasonLength) {
        return res.status(400).json({
          message: `Rejection reason must be ${maxRejectionReasonLength} characters or less`,
        });
      }

      safeUpdates.status = "rejected";
      safeUpdates.rejectionReason = rejectionReason;
      safeUpdates.rejectedAt = new Date();
      safeUpdates.rejectedBy = req.user._id;
    }

    if (isCancelling) {
      const cancelReason = (req.body.cancelReason || "").trim();

      if (req.user?.role === "barber") {
        return res.status(403).json({
          message: "Only client can cancel booking",
        });
      }

      if (!isBookingClient) {
        return res.status(403).json({
          message: "Only client can cancel booking",
        });
      }

      if (booking.status !== "pending" && booking.status !== "accepted") {
        return res.status(400).json({
          message: "Only pending or accepted bookings can be cancelled",
        });
      }

      if (!cancelReason) {
        return res.status(400).json({
          message: "Please provide a cancellation reason",
        });
      }

      if (cancelReason.length > maxCancellationReasonLength) {
        return res.status(400).json({
          message: `Cancellation reason must be ${maxCancellationReasonLength} characters or less`,
        });
      }

      safeUpdates.status = "cancelled";
      safeUpdates.cancelReason = cancelReason;
      safeUpdates.cancelledAt = new Date();
      safeUpdates.cancelledBy = req.user._id;
    }

    if (isRescheduling) {
      const isReschedulingClient =
        req.user?.role === "client" &&
        String(req.user._id) === String(booking.clientId);

      if (!isReschedulingClient) {
        return res.status(403).json({
          message: "Only the booking owner can reschedule",
        });
      }

      if (booking.status !== "pending" && booking.status !== "accepted") {
        return res.status(400).json({
          message: "Cannot reschedule a booking that is not pending or accepted",
        });
      }

      const nextTime = req.body.time || booking.time;
      const nextBookingDate =
        req.body.bookingDate !== undefined
          ? req.body.bookingDate
          : booking.bookingDate;
      const nextDayKey =
        getDayKeyFromDate(nextBookingDate) || req.body.dayKey || booking.dayKey;
      const slotValidation = await validateBookingSlot({
        barberId: booking.barberId,
        salonId: booking?.salonId || null,
        bookingDate: nextBookingDate,
        dayKey: nextDayKey,
        time: nextTime,
        duration: booking.duration,
        ignoreBookingId: booking._id,
      });
      rescheduleSlotRequest = {
        barberId: booking.barberId,
        salonId: booking?.salonId || null,
        bookingDate: nextBookingDate,
        dayKey: nextDayKey,
        time: nextTime,
        duration: booking.duration,
        ignoreBookingId: booking._id,
      };

      if (slotValidation.message) {
        return res.status(400).json({
          message: slotValidation.message,
        });
      }

      safeUpdates.dayKey = slotValidation.effectiveDayKey;
      safeUpdates.bookingDate = nextBookingDate;
      safeUpdates.time = nextTime;
      safeUpdates.reminderSentAt = null;
    }

    if (Object.keys(safeUpdates).length === 0) {
      return res.status(400).json({ message: "No allowed booking updates provided" });
    }

    const applyAndSaveUpdates = async () => {
      if (isRescheduling && rescheduleSlotRequest) {
        const latestSlotValidation = await validateBookingSlot(rescheduleSlotRequest);

        if (latestSlotValidation.message) {
          return { message: latestSlotValidation.message };
        }

        safeUpdates.dayKey = latestSlotValidation.effectiveDayKey;
      }

      Object.assign(booking, safeUpdates);
      if (booking.clientPhone && !booking.phone) {
        booking.phone = booking.clientPhone;
      }
      if (booking.bookingDate) {
        booking.dayKey = getDayKeyFromDate(booking.bookingDate) || booking.dayKey;
      }
      await booking.save();

      return { booking };
    };

    const saveResult =
      isRescheduling && rescheduleSlotRequest
        ? await withBookingCreationLock(
            getBookingCreationLockKey({
              barberId: booking.barberId,
              bookingDate: rescheduleSlotRequest.bookingDate,
            }),
            applyAndSaveUpdates
          )
        : await applyAndSaveUpdates();

    if (saveResult.message) {
      return res.status(400).json({ message: saveResult.message });
    }

    if (safeUpdates.status && safeUpdates.status !== previousStatus) {
      await notifyUsersForBookingStatusChange({
        booking,
        status: safeUpdates.status,
        requester: req.user,
        isBookingClient,
      });

      if (safeUpdates.status === "rejected" || safeUpdates.status === "cancelled") {
        notifyWaitlistForReleasedBookingSlot(booking);
      }
    }

    emitBookingUpdated(booking, "updated");

    return res.json(booking);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not update booking",
    });
  }
};

export const createRescheduleRequest = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!isClientForBooking(req.user, booking)) {
      return res.status(403).json({
        message: "Only the booking owner can request reschedule",
      });
    }

    if (!reschedulableBookingStatuses.has(normalizeBookingStatus(booking.status))) {
      return res.status(400).json({
        message: "Cannot request reschedule for this booking status",
      });
    }

    if (hasPendingRescheduleRequest(booking)) {
      return res.status(400).json({
        message: "A reschedule request is already pending",
      });
    }

    const requestedBookingDate = req.body.bookingDate;
    const requestedTime = req.body.time;
    const requestedDayKey =
      getDayKeyFromDate(requestedBookingDate) || req.body.dayKey || booking.dayKey;
    const slotValidation = await validateBookingSlot({
      barberId: booking.barberId,
      salonId: booking?.salonId || null,
      bookingDate: requestedBookingDate,
      dayKey: requestedDayKey,
      time: requestedTime,
      duration: booking.duration,
      ignoreBookingId: booking._id,
    });

    if (slotValidation.message) {
      return res.status(400).json({ message: slotValidation.message });
    }

    booking.rescheduleRequest = {
      status: "pending",
      requestedBookingDate: dateKeyToDate(requestedBookingDate),
      requestedDayKey: slotValidation.effectiveDayKey,
      requestedTime,
      requestedBy: req.user._id,
      requestedAt: new Date(),
      respondedBy: null,
      respondedAt: null,
      rejectionReason: "",
      originalBookingDate: dateKeyToDate(booking.bookingDate),
      originalDayKey: booking.dayKey,
      originalTime: booking.time,
      requestNote: (req.body.note || "").trim(),
    };

    await booking.save();

    await createNotificationNonFatal({
      userId: booking.barberId,
      type: "booking_reschedule_requested",
      message: `Client requested to reschedule booking from ${booking.bookingDate} at ${booking.time} to ${requestedBookingDate} at ${requestedTime}.`,
    });

    emitBookingUpdated(booking, "updated");

    return res.status(201).json(booking);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not request reschedule",
    });
  }
};

export const acceptRescheduleRequest = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!isAssignedBarberForBooking(req.user, booking)) {
      return res.status(403).json({
        message: "Only the assigned barber can accept reschedule request",
      });
    }

    if (!hasPendingRescheduleRequest(booking)) {
      return res.status(400).json({ message: "No pending reschedule request" });
    }

    const pendingRequest = booking.rescheduleRequest;
    const requestedBookingDate = storedDateToDateKey(
      pendingRequest.requestedBookingDate
    );
    const requestedTime = pendingRequest.requestedTime;
    const requestedDayKey =
      pendingRequest.requestedDayKey ||
      getDayKeyFromDate(requestedBookingDate) ||
      booking.dayKey;

    const acceptResult = await withBookingCreationLock(
      getBookingCreationLockKey({
        barberId: booking.barberId,
        bookingDate: requestedBookingDate,
      }),
      async () => {
        if (!hasPendingRescheduleRequest(booking)) {
          return { message: "No pending reschedule request" };
        }

        const latestSlotValidation = await validateBookingSlot({
          barberId: booking.barberId,
          salonId: booking?.salonId || null,
          bookingDate: requestedBookingDate,
          dayKey: requestedDayKey,
          time: requestedTime,
          duration: booking.duration,
          ignoreBookingId: booking._id,
        });

        if (latestSlotValidation.message) {
          return { message: latestSlotValidation.message };
        }

        booking.bookingDate = requestedBookingDate;
        booking.dayKey = latestSlotValidation.effectiveDayKey;
        booking.time = requestedTime;
        booking.reminderSentAt = null;
        booking.reminder24hSentAt = null;
        booking.reminder2hSentAt = null;
        booking.rescheduleRequest.status = "accepted";
        booking.rescheduleRequest.respondedBy = req.user._id;
        booking.rescheduleRequest.respondedAt = new Date();

        await booking.save();

        return { booking };
      }
    );

    if (acceptResult.message) {
      return res.status(400).json({ message: acceptResult.message });
    }

    const updatedBooking = acceptResult.booking;

    if (updatedBooking.clientId) {
      await createNotificationNonFatal({
        userId: updatedBooking.clientId,
        type: "booking_reschedule_accepted",
        message: `Your reschedule request was accepted. Booking moved to ${updatedBooking.bookingDate} at ${updatedBooking.time}.`,
      });
    }

    emitBookingUpdated(updatedBooking, "updated");

    return res.json(updatedBooking);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not accept reschedule request",
    });
  }
};

export const rejectRescheduleRequest = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!isAssignedBarberForBooking(req.user, booking)) {
      return res.status(403).json({
        message: "Only the assigned barber can reject reschedule request",
      });
    }

    if (!hasPendingRescheduleRequest(booking)) {
      return res.status(400).json({ message: "No pending reschedule request" });
    }

    const rejectionReason = (req.body?.reason || "").trim();

    booking.rescheduleRequest.status = "rejected";
    booking.rescheduleRequest.rejectionReason = rejectionReason;
    booking.rescheduleRequest.respondedBy = req.user._id;
    booking.rescheduleRequest.respondedAt = new Date();

    await booking.save();

    if (booking.clientId) {
      await createNotificationNonFatal({
        userId: booking.clientId,
        type: "booking_reschedule_rejected",
        message: rejectionReason
          ? `Your reschedule request was rejected. Reason: ${rejectionReason}`
          : "Your reschedule request was rejected.",
      });
    }

    emitBookingUpdated(booking, "updated");

    return res.json(booking);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not reject reschedule request",
    });
  }
};

export const delayBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const isBookingClient =
      req.user?.role === "client" &&
      String(req.user._id) === String(booking.clientId);

    if (!isBookingClient) {
      return res.status(403).json({ message: "Only the booking owner can delay this booking" });
    }

    if (booking.status !== "accepted") {
      return res.status(400).json({ message: "Only accepted bookings can be delayed" });
    }

    const delayMinutes = req.body?.delayMinutes;

    if (!allowedBookingDelayMinutes.has(delayMinutes)) {
      return res.status(400).json({ message: "delayMinutes must be 10 or 20" });
    }

    const oldStartMinutes = timeToMinutes(booking.time);

    if (oldStartMinutes === null) {
      return res.status(400).json({ message: "Booking time is invalid" });
    }

    const newStartMinutes = oldStartMinutes + delayMinutes;

    if (newStartMinutes >= 24 * 60) {
      return res.status(400).json({ message: "Cannot delay booking past the end of the day" });
    }

    const newTime = minutesToTime(newStartMinutes);
    const nextDayKey = getDayKeyFromDate(booking.bookingDate) || booking.dayKey;
    const delayResult = await withBookingCreationLock(
      getBookingCreationLockKey({
        barberId: booking.barberId,
        bookingDate: booking.bookingDate,
      }),
      async () => {
        const slotValidation = await validateBookingSlot({
          barberId: booking.barberId,
          salonId: booking?.salonId || null,
          bookingDate: booking.bookingDate,
          dayKey: nextDayKey,
          time: newTime,
          duration: booking.duration,
          ignoreBookingId: booking._id,
        });

        if (slotValidation.message) {
          return { message: slotValidation.message };
        }

        const updatedBooking = await Booking.findOneAndUpdate(
          {
            _id: booking._id,
            clientId: booking.clientId,
            status: "accepted",
            bookingDate: booking.bookingDate,
            time: booking.time,
          },
          {
            $set: {
              time: newTime,
              dayKey: slotValidation.effectiveDayKey,
              reminderSentAt: null,
            },
          },
          { returnDocument: "after" }
        );

        if (!updatedBooking) {
          return { message: "Booking could not be delayed" };
        }

        return { booking: updatedBooking };
      }
    );

    if (delayResult.message) {
      return res.status(400).json({ message: delayResult.message });
    }

    const updatedBooking = delayResult.booking;

    const notificationTasks = [
      createNotification({
        userId: updatedBooking.barberId,
        type: "booking_delayed",
        message: `Client is running late. Booking moved to ${newTime}.`,
      }),
    ];

    if (updatedBooking.clientId) {
      notificationTasks.push(
        createNotification({
          userId: updatedBooking.clientId,
          type: "booking_delayed",
          message: `Your booking was delayed to ${newTime}.`,
        })
      );
    }

    await Promise.allSettled(notificationTasks);

    emitBookingUpdated(updatedBooking, "updated");

    return res.json(updatedBooking);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not delay booking",
    });
  }
};

export const getClientBookings = async (req, res) => {
  try {
    const bookings = await getClientBookingsForRequester({
      clientId: req.params.clientId,
      requester: req.user,
    });

    return res.json(bookings);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Could not fetch client bookings",
    });
  }
};

export const getBarberBookings = async (req, res) => {
  try {
    const bookings = await getBarberBookingsForRequester({
      barberId: req.params.barberId,
      requester: req.user,
    });

    return res.json(bookings);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Could not fetch barber bookings",
    });
  }
};

export const markNoShow = async (req, res) => {
  try {
    const updatedBooking = await markBookingNoShow({
      bookingId: req.params.id,
      requester: req.user,
    });

    // Notify client
    if (updatedBooking.clientId) {
      await createNotification({
        userId: updatedBooking.clientId,
        type: "booking_no_show",
        message: "Your booking was marked as no-show.",
      });
    }

    notifyWaitlistForReleasedBookingSlot(updatedBooking);

    emitBookingUpdated(updatedBooking, "updated");

    return res.json(updatedBooking);
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      message: error.message || "Could not mark no-show",
    });
  }
};

export const markLateCancel = async (req, res) => {
  try {
    const updatedBooking = await markBookingLateCancel({
      bookingId: req.params.id,
      requester: req.user,
    });

    // Notify client
    if (updatedBooking.clientId) {
      await createNotification({
        userId: updatedBooking.clientId,
        type: "booking_late_cancelled",
        message: "Your booking was marked as late cancellation.",
      });
    }

    notifyWaitlistForReleasedBookingSlot(updatedBooking);

    emitBookingUpdated(updatedBooking, "updated");

    return res.json(updatedBooking);
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      message: error.message || "Could not mark late cancellation",
    });
  }
};

export const getBarberMonthlyIncome = async (req, res) => {
  try {
    const summary = await getBarberMonthlyIncomeSummary({
      barberId: req.params.barberId,
      year: req.query.year,
      month: req.query.month,
      requester: req.user,
    });

    return res.json(summary);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Could not fetch barber income",
    });
  }
};

export const getClientReliability = async (req, res) => {
  try {
    const { clientId } = req.params;
    const summary = await getAccessibleClientReliabilitySummary({
      clientId,
      requester: req.user,
    });

    return res.json(summary);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Could not fetch client reliability summary",
    });
  }
};

export const debugBookingAvailability = async (req, res) => {
  try {
    const { barberId, salonId, date, time, serviceId } = req.body;

    // Validate required fields
    const validation = validateDebugRequest({ barberId, salonId, date, time, serviceId });

    if (!validation.valid) {
      return res.status(validation.status).json({ message: validation.message });
    }

    // Authorize access
    const auth = await authorizeDebugAccess({ requester: req.user, barberId, salonId });

    if (!auth.allowed) {
      return res.status(auth.status).json({ message: auth.message });
    }

    // Run diagnostics
    const result = await debugAvailability({ barberId, salonId, date, time, serviceId });

    if (result.status) {
      return res.status(result.status).json({ message: result.message });
    }

    return res.json(result);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Could not debug availability",
    });
  }
};
