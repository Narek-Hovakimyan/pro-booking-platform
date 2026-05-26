import path from "path";
import BarberProfile from "../models/BarberProfile.js";
import Booking from "../models/Booking.js";
import mongoose from "mongoose";
import Salon from "../models/Salon.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import {
  getApprovedUserSalonIds,
  getPrimaryApprovedSalonId,
} from "../services/salon/salonMembershipService.js";
import {
  emitBookingUpdated,
  notifyUsersForBookingStatusChange,
  notifyWaitlistForReleasedBookingSlot,
} from "../services/bookingSideEffectsService.js";
import { createNotification } from "./notificationController.js";
import { createCrudController } from "./crudController.js";
import { deleteUploadedFile } from "../middleware/uploadMiddleware.js";
import {
  getBookingDateTime,
  getDayKeyFromDate,
  timeToMinutes,
} from "../utils/bookingDateTime.js";
import {
  blockingBookingStatuses,
  defaultPersonalSchedule,
  defaultWeeklySchedule,
  defaultWorkingDaySchedule,
  formatBookedMessage,
  getDayScheduleFromDefaultSchedule,
  maxCancellationReasonLength,
  maxRejectionReasonLength,
  normalizeBookingStatus,
  slotOverlaps,
} from "../utils/bookingUtils.js";
import { getBookingNotificationData } from "../utils/bookingNotificationData.js";
import { storedDateToDateKey } from "../utils/bookingDateStorage.js";
import {
  getBookingCreationLockKey,
  validateBookingSlot,
  withBookingCreationLock,
} from "../utils/bookingSlotValidation.js";

export const bookingController = createCrudController(Booking, "Booking");

const isValidObjectId = (value) =>
  Boolean(value) && mongoose.Types.ObjectId.isValid(String(value));

const allowedBookingDelayMinutes = new Set([10, 20]);
const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");

  return `${hours}:${mins}`;
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

const sameId = (left, right) =>
  String(left || "") === String(right || "");

const canManageBookingSalon = async (booking, userId) => {
  if (!booking?.salonId || !userId) return false;

  const salon = await Salon.findById(booking.salonId).select("ownerId admins").lean();
  if (!salon) return false;

  return (
    sameId(salon.ownerId, userId) ||
    (Array.isArray(salon.admins) &&
      salon.admins.some((adminId) => sameId(adminId, userId)))
  );
};

export const __bookingTestHooks = {
  allowedBookingDelayMinutes,
  blockingBookingStatuses,
  normalizeBookingStatus,
  slotOverlaps,
  validateBookingSlot,
  withBookingCreationLock,
};

const collectReferenceImagePaths = (req) => {
  if (!req.files || !Array.isArray(req.files)) return [];
  return req.files.map((file) => `uploads/booking-references/${file.filename}`);
};

const cleanupReferenceImages = (paths) => {
  if (!paths || !paths.length) return;
  paths.forEach(deleteUploadedFile);
};

export const createBooking = async (req, res) => {
  // Capture reference image paths before any validation returns
  const referenceImages = collectReferenceImagePaths(req);

  const cleanup = () => cleanupReferenceImages(referenceImages);

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

    // ── Consultation / Consent ──
    // JSON-stringified values arrive from multipart/FormData (when referenceImages included)
    let consultation = req.body.consultation || {};
    let consent = req.body.consent || {};
    const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
    try {
      if (typeof consultation === "string") consultation = JSON.parse(consultation);
    } catch {
      cleanup();
      return res.status(400).json({ message: "Invalid consultation JSON" });
    }
    if (!isPlainObject(consultation)) {
      cleanup();
      return res.status(400).json({ message: "Invalid consultation JSON" });
    }
    try {
      if (typeof consent === "string") consent = JSON.parse(consent);
    } catch {
      cleanup();
      return res.status(400).json({ message: "Invalid consent JSON" });
    }
    if (!isPlainObject(consent)) {
      cleanup();
      return res.status(400).json({ message: "Invalid consent JSON" });
    }
    if (consent.accepted === true) {
      if (!consent.textVersion || !consent.textVersion.trim()) {
        cleanup();
        return res.status(400).json({
          message: "Consent requires a non-empty textVersion",
        });
      }
      consent.acceptedAt = new Date(); // server-side only
    } else {
      consent.accepted = false;
      consent.acceptedAt = null;
    }

    if (!barberId || !serviceId || (!isManualBooking && !clientId)) {
      cleanup();
      return res.status(400).json({
        message: "Select service first",
      });
    }

    if (!barberId || !bookingDate || !time) {
      cleanup();
      return res.status(400).json({
        message: "barberId, bookingDate, and time are required",
      });
    }

    if (isManualBooking && !clientName) {
      cleanup();
      return res.status(400).json({ message: "Client name is required" });
    }

    if (
      !isManualBooking &&
      (req.user?.role !== "client" || String(req.user._id) !== String(clientId))
    ) {
      cleanup();
      return res.status(403).json({
        message: "You can create bookings only for yourself",
      });
    }

    if (
      isManualBooking &&
      (req.user?.role !== "barber" || String(req.user.id) !== String(barberId))
    ) {
      cleanup();
      return res.status(403).json({
        message: "You can create bookings only for your own barber calendar",
      });
    }

    const service = await Service.findOne({ _id: serviceId, barberId, active: true });

    if (!service) {
      cleanup();
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
      cleanup();
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
      cleanup();
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
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        salonId: salonResolution.salonId,
        bookingDate,
        time,
        dayKey: latestSlotValidation.effectiveDayKey,
        serviceName: service.name,
        duration: bookingDuration,
        price: bookingPrice,
        status,
        consultation,
        consent,
      });

      return { booking };
    });

    if (createResult.message) {
      // Lock-level failure — cleanup uploaded files
      cleanup();
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
        data: getBookingNotificationData(booking),
      });
    }

    emitBookingUpdated(booking, "created");

    return res.status(201).json(booking);
  } catch (error) {
    // DB or unexpected failure — cleanup uploaded files
    cleanup();
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
    const normalizedBookingStatus = normalizeBookingStatus(booking.status);
    const safeUpdates = {};
    let rescheduleSlotRequest = null;

    if (
      isBookingClient &&
      (normalizedBookingStatus === "pending" ||
        normalizedBookingStatus === "accepted") &&
      attemptsDateTimeChange(req.body, booking)
    ) {
      return res.status(400).json({
        message: "Bookings must be rescheduled by request.",
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

    // Policy: one delay per booking
    if (booking.delayMinutesTotal > 0 || booking.delayedAt) {
      return res.status(400).json({ message: "This booking has already been delayed." });
    }

    // Policy: max 20 minutes total delay
    const delayMinutes = req.body?.delayMinutes;

    if (!allowedBookingDelayMinutes.has(delayMinutes)) {
      return res.status(400).json({ message: "delayMinutes must be 10 or 20" });
    }

    // Policy: delay only until appointment start + 5 minute grace window (Armenia time)
    const bookingStart = getBookingDateTime(booking);
    if (bookingStart) {
      const graceEnd = new Date(bookingStart.getTime() + 5 * 60 * 1000);
      const now = new Date();
      if (now > graceEnd) {
        return res.status(400).json({ message: "This booking can no longer be delayed." });
      }
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
            // Concurrency guard: only succeed if delay hasn't been applied yet
            $or: [
              { delayMinutesTotal: { $lte: 0 } },
              { delayMinutesTotal: { $exists: false } },
            ],
            delayedAt: null,
          },
          {
            $set: {
              time: newTime,
              dayKey: slotValidation.effectiveDayKey,
              reminderSentAt: null,
              delayMinutesTotal: delayMinutes,
              delayedAt: new Date(),
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
        data: getBookingNotificationData(updatedBooking),
      }),
    ];

    if (updatedBooking.clientId) {
      notificationTasks.push(
        createNotification({
          userId: updatedBooking.clientId,
          type: "booking_delayed",
          message: `Your booking was delayed to ${newTime}.`,
          data: getBookingNotificationData(updatedBooking),
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

export const getReferenceImage = async (req, res) => {
  try {
    const { bookingId, imageName } = req.params;

    if (!isValidObjectId(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    // Prevent path traversal
    if (imageName.includes("..") || imageName.includes("/") || imageName.includes("\\")) {
      return res.status(400).json({ message: "Invalid image name" });
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Authorize: booking client, assigned barber, or the owner/admin of the
    // salon tied to this booking.
    const isBookingClient =
      booking.clientId &&
      req.user?._id &&
      sameId(req.user._id, booking.clientId);
    const isAssignedBarber =
      sameId(req.user?._id, booking.barberId);
    const isSalonManager =
      !isBookingClient &&
      !isAssignedBarber &&
      await canManageBookingSalon(booking, req.user?._id);

    if (!isBookingClient && !isAssignedBarber && !isSalonManager) {
      return res.status(403).json({ message: "Not authorized to view these images" });
    }

    // Verify the image is actually listed on this booking
    const fullPath = `uploads/booking-references/${imageName}`;

    if (!booking.referenceImages || !booking.referenceImages.includes(fullPath)) {
      return res.status(404).json({ message: "Image not found in booking" });
    }

    // Resolve path and verify it's still inside uploads/booking-references
    const absolutePath = path.resolve(process.cwd(), "uploads", "booking-references", imageName);
    const uploadsDir = path.resolve(process.cwd(), "uploads", "booking-references");
    const relativeToDir = path.relative(uploadsDir, absolutePath);

    if (relativeToDir.startsWith("..") || path.isAbsolute(relativeToDir)) {
      return res.status(400).json({ message: "Invalid image path" });
    }

    return res.sendFile(absolutePath);
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Could not serve reference image",
    });
  }
};
