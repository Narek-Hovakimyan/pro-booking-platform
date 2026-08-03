import mongoose from "mongoose";
import { pathToFileURL } from "node:url";

import Booking from "../src/models/Booking.js";
import BookingSlotHold from "../src/models/BookingSlotHold.js";
import {
  blockingBookingStatuses,
} from "../src/utils/bookingUtils.js";
import {
  isDateKey,
  timeToMinutes,
} from "../src/utils/bookingDateTime.js";

const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL;
const args = new Set(process.argv.slice(2));
const shouldWrite = args.has("--write");
const shouldCreateIndexes = args.has("--create-indexes");

if (shouldCreateIndexes && !shouldWrite) {
  console.error("--create-indexes requires --write after a successful dry run.");
  process.exit(1);
}

const toKey = (barberId, bookingDate, minuteOfDay) =>
  `${String(barberId)}|${bookingDate}|${minuteOfDay}`;
const toBookingHoldKey = (bookingId, bookingDate, minuteOfDay) =>
  `${String(bookingId)}|${bookingDate}|${minuteOfDay}`;

const getStrictBookingSlotMinutes = ({ bookingDate, time, duration }) => {
  const start = timeToMinutes(time);
  const slotDuration = Number(duration);

  if (
    !isDateKey(bookingDate) ||
    start === null ||
    !Number.isFinite(slotDuration) ||
    !Number.isInteger(slotDuration) ||
    slotDuration <= 0 ||
    start + slotDuration > 24 * 60
  ) {
    return [];
  }

  return Array.from({ length: slotDuration }, (_, offset) => start + offset);
};

export const collectBookingSlotHoldBackfillPlan = ({
  activeBookings,
  existingHolds,
}) => {
  const overlaps = [];
  const desiredDocs = [];
  const seenKeys = new Map();

  for (const booking of activeBookings) {
    const minutes = getStrictBookingSlotMinutes({
      bookingDate: booking.bookingDate,
      time: booking.time,
      duration: booking.duration,
    });
    if (!booking.barberId || minutes.length === 0) {
      overlaps.push({
        bookingId: String(booking._id),
        reason: "invalid booking slot data",
      });
      continue;
    }

    for (const minuteOfDay of minutes) {
      const key = toKey(booking.barberId, booking.bookingDate, minuteOfDay);
      const existing = seenKeys.get(key);
      if (existing && existing.bookingId !== String(booking._id)) {
        overlaps.push({
          bookingId: String(booking._id),
          conflictingBookingId: existing.bookingId,
          barberId: String(booking.barberId),
          bookingDate: booking.bookingDate,
          minuteOfDay,
        });
        continue;
      }

      seenKeys.set(key, { bookingId: String(booking._id) });
      desiredDocs.push({
        bookingId: booking._id,
        barberId: booking.barberId,
        bookingDate: booking.bookingDate,
        minuteOfDay,
      });
    }
  }

  const desiredKeys = new Set(
    desiredDocs.map((doc) => toKey(doc.barberId, doc.bookingDate, doc.minuteOfDay))
  );
  const seenExistingBookingHoldKeys = new Map();

  for (const hold of existingHolds) {
    const key = toKey(hold.barberId, hold.bookingDate, hold.minuteOfDay);
    const bookingHoldKey = toBookingHoldKey(
      hold.bookingId,
      hold.bookingDate,
      hold.minuteOfDay
    );
    const duplicateBookingHold = seenExistingBookingHoldKeys.get(bookingHoldKey);
    if (duplicateBookingHold) {
      overlaps.push({
        holdId: String(hold._id),
        conflictingHoldId: duplicateBookingHold,
        bookingId: String(hold.bookingId),
        bookingDate: hold.bookingDate,
        minuteOfDay: hold.minuteOfDay,
        reason: "duplicate same-booking hold key",
      });
    } else {
      seenExistingBookingHoldKeys.set(bookingHoldKey, String(hold._id));
    }

    const expected = seenKeys.get(key);
    if (expected && expected.bookingId !== String(hold.bookingId)) {
      overlaps.push({
        holdId: String(hold._id),
        bookingId: String(hold.bookingId),
        conflictingBookingId: expected.bookingId,
        barberId: String(hold.barberId),
        bookingDate: hold.bookingDate,
        minuteOfDay: hold.minuteOfDay,
      });
    }
  }

  return { desiredDocs, desiredKeys, overlaps };
};

const main = async () => {
  if (!mongoUri) {
    throw new Error("Set MONGO_URI or DATABASE_URL before running this script.");
  }

  await mongoose.connect(mongoUri);

  const activeBookings = await Booking.find(
    {
      status: { $in: blockingBookingStatuses },
    },
    "_id barberId bookingDate time duration status"
  ).lean();

  const existingHolds = await BookingSlotHold.find(
    {},
    "_id bookingId barberId bookingDate minuteOfDay"
  ).lean();
  const { desiredDocs, desiredKeys, overlaps } =
    collectBookingSlotHoldBackfillPlan({ activeBookings, existingHolds });

  const summary = {
    mode: shouldWrite ? "write" : "dry-run",
    activeBookings: activeBookings.length,
    desiredHoldCount: desiredDocs.length,
    existingHoldCount: existingHolds.length,
    overlapCount: overlaps.length,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (overlaps.length > 0) {
    console.error("Unsafe overlaps detected. Refusing to write or create indexes.");
    console.error(JSON.stringify(overlaps.slice(0, 20), null, 2));
    process.exitCode = 1;
    return;
  }

  if (!shouldWrite) {
    console.log("Dry run only. Re-run with --write to backfill holds.");
    return;
  }

  const staleHoldIds = existingHolds
    .filter((hold) => !desiredKeys.has(toKey(hold.barberId, hold.bookingDate, hold.minuteOfDay)))
    .map((hold) => hold._id);

  if (staleHoldIds.length > 0) {
    await BookingSlotHold.deleteMany({ _id: { $in: staleHoldIds } });
  }

  if (desiredDocs.length > 0) {
    await BookingSlotHold.bulkWrite(
      desiredDocs.map((doc) => ({
        updateOne: {
          filter: {
            bookingId: doc.bookingId,
            barberId: doc.barberId,
            bookingDate: doc.bookingDate,
            minuteOfDay: doc.minuteOfDay,
          },
          update: { $setOnInsert: doc },
          upsert: true,
        },
      })),
      { ordered: true }
    );
  }

  if (shouldCreateIndexes) {
    await BookingSlotHold.createIndexes();
  }

  console.log(
    JSON.stringify(
      {
        wroteHolds: desiredDocs.length,
        deletedStaleHolds: staleHoldIds.length,
        createdIndexes: shouldCreateIndexes,
      },
      null,
      2
    )
  );
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error?.message || error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {});
    });
}
