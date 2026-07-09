import Booking from "../../models/Booking.js";
import {
  allowedBookingDelayMinutes,
  minutesToTime,
  sameId,
} from "./bookingControllerHelpers.js";
import {
  getBookingDateTime,
  getDayKeyFromDate,
  isDateKey,
  timeToMinutes,
} from "../../utils/bookingDateTime.js";
import {
  getBookingCreationLockKey,
  validateBookingSlot,
  withBookingCreationLock,
} from "../../utils/bookingSlotValidation.js";
import { createNotification } from "../../controllers/notificationController.js";
import { emitBookingUpdated } from "../bookingSideEffectsService.js";
import { getBookingNotificationData } from "../../utils/bookingNotificationData.js";

/**
 * Delay a booking by the given minutes.
 * Returns { booking, newTime } on success.
 * Throws an error with statusCode on failure.
 */
export const delayBookingService = async ({ bookingId, delayMinutes, user }) => {
  const booking = await Booking.findById(bookingId);

  if (!booking) {
    const err = new Error("Booking not found");
    err.statusCode = 404;
    throw err;
  }

  const isBookingClient =
    user?.role === "client" &&
    String(user._id) === String(booking.clientId);

  if (!isBookingClient) {
    const err = new Error("Only the booking owner can delay this booking");
    err.statusCode = 403;
    throw err;
  }

  if (booking.status !== "accepted") {
    const err = new Error("Only accepted bookings can be delayed");
    err.statusCode = 400;
    throw err;
  }

  // Policy: one delay per booking
  if (booking.delayMinutesTotal > 0 || booking.delayedAt) {
    const err = new Error("This booking has already been delayed.");
    err.statusCode = 400;
    throw err;
  }

  // Policy: max 20 minutes total delay
  if (!allowedBookingDelayMinutes.has(delayMinutes)) {
    const err = new Error("delayMinutes must be 10 or 20");
    err.statusCode = 400;
    throw err;
  }

  // Policy: delay only until appointment start + 5 minute grace window (Armenia time)
  const bookingStart = getBookingDateTime(booking);
  if (!bookingStart) {
    const message = isDateKey(booking.bookingDate)
      ? "Booking time is invalid"
      : "bookingDate must be YYYY-MM-DD";
    const err = new Error(message);
    err.statusCode = 400;
    throw err;
  }

  const graceEnd = new Date(bookingStart.getTime() + 5 * 60 * 1000);
  const now = new Date();
  if (now > graceEnd) {
    const err = new Error("This booking can no longer be delayed.");
    err.statusCode = 400;
    throw err;
  }

  const oldStartMinutes = timeToMinutes(booking.time);

  if (oldStartMinutes === null) {
    const err = new Error("Booking time is invalid");
    err.statusCode = 400;
    throw err;
  }

  const newStartMinutes = oldStartMinutes + delayMinutes;

  if (newStartMinutes >= 24 * 60) {
    const err = new Error("Cannot delay booking past the end of the day");
    err.statusCode = 400;
    throw err;
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
    const err = new Error(delayResult.message);
    err.statusCode = 400;
    throw err;
  }

  const updatedBooking = delayResult.booking;

  // Notifications
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

  return { booking: updatedBooking, newTime };
};
