import Booking from "../../models/Booking.js";
import { createNotification } from "../notification/notificationService.js";

import { notifyMatchingWaitlistEntries } from "../waitlist/waitlistService.js";
import {
  getArmeniaDateKey,
  getArmeniaMinutesOfDay,
  getBookingDateTime,
  isDateKey,
  isTimeKey,
  timeToMinutes,
} from "../../utils/bookingDateTime.js";
import {
  releaseBookingSlotHolds,
  runBookingSlotTransaction,
} from "./bookingSlotHoldService.js";

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

const exactPendingSnapshotPredicate = (booking) => {
  const predicate = { _id: booking._id, status: "pending" };
  for (const field of ["bookingDate", "dayKey", "time"]) {
    predicate[field] = booking[field] === undefined
      ? { $exists: false }
      : booking[field];
  }
  return predicate;
};

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

export const expirePendingBookings = async (nowOrOptions = new Date()) => {
  const hasOptions = nowOrOptions && typeof nowOrOptions === "object" &&
    !(nowOrOptions instanceof Date) && ("now" in nowOrOptions || "leaseContext" in nowOrOptions);
  const now = hasOptions ? nowOrOptions.now || new Date() : nowOrOptions;
  const stableNow = new Date(now);
  const leaseContext = hasOptions ? nowOrOptions.leaseContext : undefined;
  const withFencedWrite = typeof leaseContext?.withFencedWrite === "function"
    ? (write) => leaseContext.withFencedWrite(write)
    : async (write) => {
        const afterCommitCallbacks = [];
        const result = await runBookingSlotTransaction(({ session }) =>
          write({
            session,
            afterCommit(callback) {
              if (typeof callback === "function") {
                afterCommitCallbacks.push(callback);
              }
            },
          })
        );
        await Promise.allSettled(afterCommitCallbacks.map((callback) => callback()));
        return result;
      };
  const expiredBookings = [];

  while (true) {
    const { bookings: pendingBookings, isLimited } =
      await findPendingExpirationCandidates(stableNow);
    let expiredInBatch = 0;

    for (const booking of pendingBookings) {
      if (!shouldExpireBooking(booking, stableNow)) {
        continue;
      }

      const transactionResult = await withFencedWrite(async ({ session, afterCommit } = {}) => {
        const currentBooking = await Booking.findOne(
          { _id: booking._id },
          null,
          session ? { session } : undefined
        );

        if (!shouldExpireBooking(currentBooking, stableNow)) {
          return null;
        }

        const claimedBooking = await Booking.findOneAndUpdate(
          exactPendingSnapshotPredicate(currentBooking),
          {
            $set: {
              status: "expired",
              expiredAt: new Date(stableNow),
              expiredReason: EXPIRED_REASON,
            },
          },
          { returnDocument: "after", session }
        );
        if (!claimedBooking) return null;

        await releaseBookingSlotHolds({
          bookingId: claimedBooking._id,
          session,
        });

        const dateKey = getBookingDateKey(claimedBooking);
        const time = claimedBooking?.time || "";
        const notificationOptions = { session, afterCommit };
        if (claimedBooking.clientId) {
          await createNotification({
            userId: claimedBooking.clientId,
            type: "booking_expired",
            message: `Your booking on ${dateKey} at ${time} expired because the barber did not confirm it in time.`,
            data: getBookingNotificationData(claimedBooking),
            idempotencyKey: `booking-expired:${String(claimedBooking._id)}:client`,
            ...notificationOptions,
          });
        }
        if (claimedBooking.barberId) {
          await createNotification({
            userId: claimedBooking.barberId,
            type: "booking_expired_missed",
            message: `You missed a pending booking confirmation for ${dateKey} at ${time}.`,
            data: getBookingNotificationData(claimedBooking),
            idempotencyKey: `booking-expired:${String(claimedBooking._id)}:barber`,
            ...notificationOptions,
          });
        }

        await notifyMatchingWaitlistEntriesForBookingExpiration({
          barberId: claimedBooking.barberId,
          salonId: claimedBooking.salonId,
          date: dateKey,
          serviceId: claimedBooking.serviceId,
          time,
          session,
          afterCommit,
          now: stableNow,
        });
        return claimedBooking;
      });

      const claimedBooking = transactionResult;
      if (!claimedBooking) continue;
      expiredBookings.push(claimedBooking);
      expiredInBatch += 1;
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
