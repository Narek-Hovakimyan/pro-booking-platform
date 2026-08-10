import mongoose from "mongoose";
import Booking from "../../models/Booking.js";
import {
  emitBookingUpdated,
  notifyWaitlistForReleasedBookingSlot,
} from "../../services/booking/bookingSideEffectsService.js";
import { getDayKeyFromDate, isDateKey } from "../../utils/bookingDateTime.js";
import { storedDateToDateKey } from "../../utils/bookingDateStorage.js";
import { getBookingNotificationData } from "../../utils/bookingNotificationData.js";
import {
  getBookingCreationLockKey,
  validateBookingSlot,
  withBookingCreationLock,
} from "../../utils/bookingSlotValidation.js";
import {
  normalizeBookingStatus,
  serializeBookingForResponse,
} from "../../utils/bookingUtils.js";
import { createNotification } from "../notifications/notificationController.js";
import {
  isBookingSlotConflictError,
  moveBookingSlotHolds,
  runBookingSlotTransaction,
} from "../../services/booking/bookingSlotHoldService.js";

const getRescheduleErrorStatusCode = (error) => {
  if (error?.statusCode) return error.statusCode;
  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return 400;
  }
  return 500;
};

const getSafeObjectId = (value) =>
  typeof value === "string" && /^[a-f\d]{24}$/i.test(value) ? value : undefined;

const logRescheduleError = (req, context) => {
  try {
    const safeContext = {
      event: context.event,
      statusCode: context.statusCode === 400 ? 400 : 500,
    };
    const bookingId = getSafeObjectId(context.bookingId);
    const userId = getSafeObjectId(context.userId);

    if (bookingId) safeContext.bookingId = bookingId;
    if (userId) safeContext.userId = userId;

    req?.log?.error(
      {
        err: { name: "Error" },
        ...safeContext,
      },
      safeContext.event
    );
  } catch {
    // Error logging must not affect request behavior.
  }
};

const sendRescheduleError = (req, res, error, fallbackMessage, context) => {
  const statusCode = getRescheduleErrorStatusCode(error);
  logRescheduleError(req, { ...context, statusCode });
  const message = statusCode === 500
    ? fallbackMessage
    : error?.message || fallbackMessage;
  return res.status(statusCode).json({ message });
};

const reschedulableBookingStatuses = new Set(["pending", "accepted"]);

const dateKeyToDate = (dateKey) => {
  if (!isDateKey(dateKey)) return undefined;

  return new Date(`${dateKey}T00:00:00.000Z`);
};

const isAssignedBarberForBooking = (requester, booking) =>
  requester?.role === "barber" &&
  String(requester._id) === String(booking.barberId);

const isClientForBooking = (requester, booking) =>
  requester?.role === "client" &&
  String(requester._id) === String(booking.clientId);

const hasPendingRescheduleRequest = (booking) =>
  booking?.rescheduleRequest?.status === "pending";

const logNotificationError = (req, err, context) => {
  try {
    req?.log?.warn({ err, ...context }, context.event);
  } catch {
    // Notification logging must not affect the primary booking flow.
  }
};

const createNotificationNonFatal = async (req, payload, context) => {
  try {
    await createNotification(payload);
  } catch (error) {
    logNotificationError(req, error, context);
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

    await createNotificationNonFatal(
      req,
      {
        userId: booking.barberId,
        type: "booking_reschedule_requested",
        message: `Client requested to reschedule booking from ${booking.bookingDate} at ${booking.time} to ${requestedBookingDate} at ${requestedTime}.`,
        data: getBookingNotificationData(booking),
      },
      {
        event: "booking_reschedule.notification_failed",
        bookingId: booking._id,
        barberId: booking.barberId,
        salonId: booking.salonId || undefined,
        serviceId: booking.serviceId,
      }
    );

    emitBookingUpdated(booking, "updated");

    return res.status(201).json(serializeBookingForResponse(booking, req.user));
  } catch (error) {
    return sendRescheduleError(req, res, error, "Could not request reschedule", {
      event: "booking_reschedule.request_failed",
      bookingId: req.params.id,
      userId: req.user?._id,
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

    const acceptResult = await withBookingCreationLock(
      getBookingCreationLockKey({
        barberId: booking.barberId,
        bookingDate: requestedBookingDate,
      }),
      async () => {
        try {
          return await runBookingSlotTransaction(async ({ session }) => {
            const lockedBooking = await Booking.findById(
              req.params.id,
              null,
              session ? { session } : undefined
            );

            if (!lockedBooking) {
              return { statusCode: 404, message: "Booking not found" };
            }

            if (!isAssignedBarberForBooking(req.user, lockedBooking)) {
              return {
                statusCode: 403,
                message: "Only the assigned barber can accept reschedule request",
              };
            }

            if (!hasPendingRescheduleRequest(lockedBooking)) {
              return { message: "No pending reschedule request" };
            }

            const lockedRequest = lockedBooking.rescheduleRequest;
            const lockedRequestedBookingDate = storedDateToDateKey(
              lockedRequest.requestedBookingDate
            );
            const lockedRequestedTime = lockedRequest.requestedTime;
            const lockedRequestedDayKey =
              lockedRequest.requestedDayKey ||
              getDayKeyFromDate(lockedRequestedBookingDate) ||
              lockedBooking.dayKey;

            const latestSlotValidation = await validateBookingSlot({
              barberId: lockedBooking.barberId,
              salonId: lockedBooking?.salonId || null,
              bookingDate: lockedRequestedBookingDate,
              dayKey: lockedRequestedDayKey,
              time: lockedRequestedTime,
              duration: lockedBooking.duration,
              ignoreBookingId: lockedBooking._id,
            });

            if (latestSlotValidation.message) {
              return { message: latestSlotValidation.message };
            }

            const releasedSlot = {
              barberId: lockedBooking.barberId,
              salonId: lockedBooking.salonId || null,
              serviceId: lockedBooking.serviceId,
              bookingDate: lockedBooking.bookingDate,
              time: lockedBooking.time,
            };
            const movedToNewSlot =
              String(releasedSlot.bookingDate) !== String(lockedRequestedBookingDate) ||
              String(releasedSlot.time) !== String(lockedRequestedTime);

            await moveBookingSlotHolds({
              bookingId: lockedBooking._id,
              barberId: lockedBooking.barberId,
              fromBookingDate: lockedBooking.bookingDate,
              fromTime: lockedBooking.time,
              fromDuration: lockedBooking.duration,
              toBookingDate: lockedRequestedBookingDate,
              toTime: lockedRequestedTime,
              toDuration: lockedBooking.duration,
              session,
            });

            lockedBooking.bookingDate = lockedRequestedBookingDate;
            lockedBooking.dayKey = latestSlotValidation.effectiveDayKey;
            lockedBooking.time = lockedRequestedTime;
            lockedBooking.reminderSentAt = null;
            lockedBooking.reminder24hSentAt = null;
            lockedBooking.reminder2hSentAt = null;
            lockedBooking.rescheduleRequest.status = "accepted";
            lockedBooking.rescheduleRequest.respondedBy = req.user._id;
            lockedBooking.rescheduleRequest.respondedAt = new Date();

            await lockedBooking.save(session ? { session } : undefined);

            return {
              booking: lockedBooking,
              releasedSlot: movedToNewSlot ? releasedSlot : null,
            };
          });
        } catch (error) {
          if (isBookingSlotConflictError(error)) {
            return { message: "This time is already booked" };
          }
          throw error;
        }
      }
    );

    if (acceptResult.message) {
      return res.status(acceptResult.statusCode || 400).json({
        message: acceptResult.message,
      });
    }

    const updatedBooking = acceptResult.booking;

    if (acceptResult.releasedSlot) {
      notifyWaitlistForReleasedBookingSlot(acceptResult.releasedSlot, req.log);
    }

    if (updatedBooking.clientId) {
      await createNotificationNonFatal(
        req,
        {
          userId: updatedBooking.clientId,
          type: "booking_reschedule_accepted",
          message: `Your reschedule request was accepted. Booking moved to ${updatedBooking.bookingDate} at ${updatedBooking.time}.`,
          data: getBookingNotificationData(updatedBooking),
        },
        {
          event: "booking_reschedule.notification_failed",
          bookingId: updatedBooking._id,
          barberId: updatedBooking.barberId,
          salonId: updatedBooking.salonId || undefined,
          serviceId: updatedBooking.serviceId,
        }
      );
    }

    emitBookingUpdated(updatedBooking, "updated");

    return res.json(serializeBookingForResponse(updatedBooking, req.user));
  } catch (error) {
    return sendRescheduleError(
      req,
      res,
      error,
      "Could not accept reschedule request",
      {
        event: "booking_reschedule.accept_failed",
        bookingId: req.params.id,
        userId: req.user?._id,
      }
    );
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
      await createNotificationNonFatal(
        req,
        {
          userId: booking.clientId,
          type: "booking_reschedule_rejected",
          message: rejectionReason
            ? `Your reschedule request was rejected. Reason: ${rejectionReason}`
            : "Your reschedule request was rejected.",
          data: getBookingNotificationData(booking),
        },
        {
          event: "booking_reschedule.notification_failed",
          bookingId: booking._id,
          barberId: booking.barberId,
          salonId: booking.salonId || undefined,
          serviceId: booking.serviceId,
        }
      );
    }

    emitBookingUpdated(booking, "updated");

    return res.json(serializeBookingForResponse(booking, req.user));
  } catch (error) {
    return sendRescheduleError(
      req,
      res,
      error,
      "Could not reject reschedule request",
      {
        event: "booking_reschedule.reject_failed",
        bookingId: req.params.id,
        userId: req.user?._id,
      }
    );
  }
};
