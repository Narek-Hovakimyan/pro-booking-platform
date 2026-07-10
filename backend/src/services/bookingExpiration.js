import Booking from "../models/Booking.js";
import { createNotification } from "./notificationService.js";

import { notifyMatchingWaitlistEntries } from "./waitlist/waitlistService.js";
import {
  getArmeniaDateKey,
  getArmeniaMinutesOfDay,
  getBookingDateTime,
  isDateKey,
  isTimeKey,
  timeToMinutes,
} from "../utils/bookingDateTime.js";

export const EXPIRED_REASON = "Barber did not confirm before appointment time";
const EXPIRATION_BATCH_SIZE = 1000;

let notifyMatchingWaitlistEntriesForBookingExpiration =
  notifyMatchingWaitlistEntries;

const getBookingDateKey = (booking) => {
  if (isDateKey(booking?.bookingDate)) return booking.bookingDate;
  if (isDateKey(booking?.dayKey)) return booking.dayKey;
  return "";
};

const getBookingNotificationData = (booking) =>
  booking?._id ? { bookingId: booking._id } : undefined;

const getPendingExpirationQuery = (now) => {
  const todayKey = getArmeniaDateKey(now);

  return {
    status: "pending",
    $or: [
      { bookingDate: { $lte: todayKey } },
      {
        bookingDate: { $in: [null, ""] },
        dayKey: { $lte: todayKey },
      },
      {
        bookingDate: { $exists: false },
        dayKey: { $lte: todayKey },
      },
    ],
  };
};

const findPendingExpirationCandidates = async (now) => {
  const pendingQuery = Booking.find(getPendingExpirationQuery(now));

  if (pendingQuery && typeof pendingQuery.limit === "function") {
    const sortedQuery = typeof pendingQuery.sort === "function"
      ? pendingQuery.sort({ bookingDate: 1, dayKey: 1, time: 1, _id: 1 })
      : pendingQuery;

    return {
      bookings: await sortedQuery.limit(EXPIRATION_BATCH_SIZE),
      isLimited: true,
    };
  }

  return {
    bookings: await pendingQuery,
    isLimited: false,
  };
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
  const expiredBookings = [];

  while (true) {
    const { bookings: pendingBookings, isLimited } =
      await findPendingExpirationCandidates(now);
    let expiredInBatch = 0;

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
      expiredInBatch += 1;

      const dateKey = getBookingDateKey(claimedBooking);
      const time = claimedBooking?.time || "";

      if (claimedBooking.clientId) {
        await createNotification({
          userId: claimedBooking.clientId,
          type: "booking_expired",
          message: `Your booking on ${dateKey} at ${time} expired because the barber did not confirm it in time.`,
          data: getBookingNotificationData(claimedBooking),
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
          data: getBookingNotificationData(claimedBooking),
        });
      }
    }

    if (
      !isLimited ||
      pendingBookings.length < EXPIRATION_BATCH_SIZE ||
      expiredInBatch === 0
    ) {
      break;
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
