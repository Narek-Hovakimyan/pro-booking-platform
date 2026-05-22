import Booking from "../models/Booking.js";
import { createNotification } from "./notificationService.js";

import { notifyMatchingWaitlistEntries } from "./waitlistService.js";
import {
  getArmeniaDateKey,
  getArmeniaMinutesOfDay,
  getBookingDateTime,
  isDateKey,
  isTimeKey,
  timeToMinutes,
} from "../utils/bookingDateTime.js";

export const EXPIRED_REASON = "Barber did not confirm before appointment time";

let notifyMatchingWaitlistEntriesForBookingExpiration =
  notifyMatchingWaitlistEntries;

const getBookingDateKey = (booking) => {
  if (isDateKey(booking?.bookingDate)) return booking.bookingDate;
  if (isDateKey(booking?.dayKey)) return booking.dayKey;
  return "";
};

export const shouldExpireBooking = (booking, now = new Date()) => {
  if (booking?.status !== "pending") return false;

  const dateKey = getBookingDateKey(booking);
  if (!dateKey) return false;

  const todayKey = getArmeniaDateKey(now);

  if (dateKey < todayKey) {
    return true;
  }

  if (dateKey > todayKey) {
    return false;
  }

  const bookingMinutes = timeToMinutes(booking?.time || "");
  if (bookingMinutes === null) return false;

  const nowMinutes = getArmeniaMinutesOfDay(now);
  return bookingMinutes < nowMinutes;
};

export const expirePendingBookings = async (now = new Date()) => {
  const pendingBookings = await Booking.find({ status: "pending" });
  const expiredBookings = [];

  for (const booking of pendingBookings) {
    if (!shouldExpireBooking(booking, now)) {
      continue;
    }

    // Atomically claim this booking — only one instance wins
    const claimedBooking = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        status: "pending",
      },
      {
        $set: {
          status: "expired",
          expiredAt: new Date(now),
          expiredReason: EXPIRED_REASON,
        },
      },
      { returnDocument: "after" }
    );

    if (!claimedBooking) continue;
    expiredBookings.push(claimedBooking);

    const dateKey = getBookingDateKey(claimedBooking);
    const time = claimedBooking?.time || "";

    if (claimedBooking.clientId) {
      await createNotification({
        userId: claimedBooking.clientId,
        type: "booking_expired",
        message: `Your booking on ${dateKey} at ${time} expired because the barber did not confirm it in time.`,
      });
    }

    // Notify waitlist entries that a slot may be available
    notifyMatchingWaitlistEntriesForBookingExpiration({
      barberId: claimedBooking.barberId,
      salonId: claimedBooking.salonId,
      date: dateKey,
      serviceId: claimedBooking.serviceId,
      time: claimedBooking.time,
    }).catch((err) => {
      console.error("Waitlist notification error:", err.message);
    });

    if (claimedBooking.barberId) {
      await createNotification({
        userId: claimedBooking.barberId,
        type: "booking_expired_missed",
        message: `You missed a pending booking confirmation for ${dateKey} at ${time}.`,
      });
    }
  }

  return expiredBookings;
};

export const __bookingExpirationTestHooks = {
  setNotifyMatchingWaitlistEntries(nextNotifyMatchingWaitlistEntries) {
    notifyMatchingWaitlistEntriesForBookingExpiration =
      nextNotifyMatchingWaitlistEntries || notifyMatchingWaitlistEntries;
  },
  resetNotifyMatchingWaitlistEntries() {
    notifyMatchingWaitlistEntriesForBookingExpiration =
      notifyMatchingWaitlistEntries;
  },
};
