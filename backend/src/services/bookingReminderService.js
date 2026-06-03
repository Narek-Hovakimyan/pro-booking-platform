import Booking from "../models/Booking.js";
import { createNotification } from "./notificationService.js";
import { getBookingDateTime } from "../utils/bookingDateTime.js";

const claimReminder = async (booking, field, now, extraQuery = {}) => {
  const claimedBooking = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      bookingDate: booking.bookingDate,
      time: booking.time,
      status: { $in: ["accepted", "confirmed"] },
      [field]: null,
      ...extraQuery,
    },
    { $set: { [field]: new Date(now) } },
    { returnDocument: "after" }
  );

  if (claimedBooking && Object.prototype.hasOwnProperty.call(booking, field)) {
    booking[field] = claimedBooking[field] || new Date(now);
  }

  return claimedBooking;
};

const createReminderNotifications = async (notifications) => {
  try {
    for (const notification of notifications) {
      if (!notification.userId) continue;
      await createNotification(notification);
    }

    return true;
  } catch (error) {
    console.error("Booking reminder notification error:", error);
    return false;
  }
};

const getBookingNotificationData = (booking) =>
  booking?._id ? { bookingId: booking._id } : undefined;

/**
 * Run booking reminders:
 * - 24h reminder for accepted bookings starting within the next 24 hours
 * - 2h reminder for accepted bookings starting within the next 2 hours
 *
 * Idempotency:
 * - Uses reminder24hSentAt and reminder2hSentAt fields to prevent duplicates
 * - Each booking only gets one 24h reminder and one 2h reminder
 *
 * @param {Date} [now] - Current time (injectable for testing)
 * @returns {Promise<{ remindersSent: number }>}
 */
export const runBookingReminders = async (now = new Date()) => {
  const startOfWindow = now;
  const endOf24hWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const endOf2hWindow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  // Upper bound: only fetch accepted bookings with a bookingDate up to 48h from now.
  // This avoids loading all accepted bookings (including far-future ones) into memory.
  const maxFetchDate = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const maxDateStr = maxFetchDate.toISOString().slice(0, 10);

  const acceptedBookings = await Booking.find({
    bookingDate: { $ne: "", $lte: maxDateStr },
    time: { $ne: "" },
    status: { $in: ["accepted", "confirmed"] },
  });

  let remindersSent = 0;

  for (const booking of acceptedBookings) {
    // Defensive guard — skip if status is not accepted or confirmed (mock safety)
    if (booking.status !== "accepted" && booking.status !== "confirmed") continue;

    const startsAt = getBookingDateTime(booking);

    if (!startsAt) continue;

    // Skip past bookings (already started)
    if (startsAt <= startOfWindow) continue;

    // --- 2-hour reminder ---
    if (!booking.reminder2hSentAt && startsAt > startOfWindow && startsAt <= endOf2hWindow) {
      const claimedBooking = await claimReminder(booking, "reminder2hSentAt", now);

      if (!claimedBooking) continue;

      const notificationsCreated = await createReminderNotifications([
        {
          userId: booking.clientId,
          type: "booking_reminder_2h",
          message: "Your appointment starts in 2 hours.",
          data: getBookingNotificationData(booking),
        },
        {
          userId: booking.barberId,
          type: "booking_reminder_2h",
          message: "Your appointment starts in 2 hours.",
          data: getBookingNotificationData(booking),
        },
      ]);

      if (notificationsCreated) remindersSent++;
      continue;
    }

    // --- 24-hour reminder ---
    // Only send if 2h hasn't already been sent (to avoid double-save concerns)
    if (!booking.reminder24hSentAt && !booking.reminder2hSentAt && startsAt > startOfWindow && startsAt <= endOf24hWindow) {
      const claimedBooking = await claimReminder(booking, "reminder24hSentAt", now, {
        reminder2hSentAt: null,
      });

      if (!claimedBooking) continue;

      const barberName = booking.barberName || "your barber";
      const clientName = booking.clientName || "your client";
      const time = booking.time || "";

      const notificationsCreated = await createReminderNotifications([
        {
          userId: booking.clientId,
          type: "booking_reminder_24h",
          message: `Reminder: your appointment with ${barberName} is tomorrow at ${time}.`,
          data: getBookingNotificationData(booking),
        },
        {
          userId: booking.barberId,
          type: "booking_reminder_24h",
          message: `Reminder: you have an appointment with ${clientName} tomorrow at ${time}.`,
          data: getBookingNotificationData(booking),
        },
      ]);

      if (notificationsCreated) remindersSent++;
    }
  }

  return { remindersSent };
};
