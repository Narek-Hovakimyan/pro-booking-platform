import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import {
  emitBookingUpdated,
  notifyWaitlistForReleasedBookingSlot,
} from "../services/bookingSideEffectsService.js";
import { getDayKeyFromDate, isDateKey } from "../utils/bookingDateTime.js";
import { storedDateToDateKey } from "../utils/bookingDateStorage.js";
import { getBookingNotificationData } from "../utils/bookingNotificationData.js";
import {
  getBookingCreationLockKey,
  validateBookingSlot,
  withBookingCreationLock,
} from "../utils/bookingSlotValidation.js";
import { normalizeBookingStatus } from "../utils/bookingUtils.js";
import { createNotification } from "./notificationController.js";

const getRescheduleErrorStatusCode = (error) => {
  if (error?.statusCode) return error.statusCode;
  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return 400;
  }
  return 500;
};

const sendRescheduleError = (res, error, fallbackMessage) => {
  console.error(fallbackMessage, error);
  const statusCode = getRescheduleErrorStatusCode(error);
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

const createNotificationNonFatal = async (payload) => {
  try {
    await createNotification(payload);
  } catch (error) {
    console.error("Booking reschedule notification error:", error.message);
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
      data: getBookingNotificationData(booking),
    });

    emitBookingUpdated(booking, "updated");

    return res.status(201).json(booking);
  } catch (error) {
    return sendRescheduleError(res, error, "Could not request reschedule");
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
        const lockedBooking = await Booking.findById(req.params.id);

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

        lockedBooking.bookingDate = lockedRequestedBookingDate;
        lockedBooking.dayKey = latestSlotValidation.effectiveDayKey;
        lockedBooking.time = lockedRequestedTime;
        lockedBooking.reminderSentAt = null;
        lockedBooking.reminder24hSentAt = null;
        lockedBooking.reminder2hSentAt = null;
        lockedBooking.rescheduleRequest.status = "accepted";
        lockedBooking.rescheduleRequest.respondedBy = req.user._id;
        lockedBooking.rescheduleRequest.respondedAt = new Date();

        await lockedBooking.save();

        return {
          booking: lockedBooking,
          releasedSlot: movedToNewSlot ? releasedSlot : null,
        };
      }
    );

    if (acceptResult.message) {
      return res.status(acceptResult.statusCode || 400).json({
        message: acceptResult.message,
      });
    }

    const updatedBooking = acceptResult.booking;

    if (acceptResult.releasedSlot) {
      notifyWaitlistForReleasedBookingSlot(acceptResult.releasedSlot);
    }

    if (updatedBooking.clientId) {
      await createNotificationNonFatal({
        userId: updatedBooking.clientId,
        type: "booking_reschedule_accepted",
        message: `Your reschedule request was accepted. Booking moved to ${updatedBooking.bookingDate} at ${updatedBooking.time}.`,
        data: getBookingNotificationData(updatedBooking),
      });
    }

    emitBookingUpdated(updatedBooking, "updated");

    return res.json(updatedBooking);
  } catch (error) {
    return sendRescheduleError(res, error, "Could not accept reschedule request");
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
        data: getBookingNotificationData(booking),
      });
    }

    emitBookingUpdated(booking, "updated");

    return res.json(booking);
  } catch (error) {
    return sendRescheduleError(res, error, "Could not reject reschedule request");
  }
};
