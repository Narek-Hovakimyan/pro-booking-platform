import mongoose from "mongoose";

import Booking from "../../models/Booking.js";
import BookingSlotHold from "../../models/BookingSlotHold.js";
import { isDateKey, timeToMinutes } from "../../utils/bookingDateTime.js";
import {
  blockingBookingStatuses,
  getBookingSlotMinutes,
  normalizeBookingStatus,
  slotOverlaps,
} from "../../utils/bookingUtils.js";

const TRANSACTION_CAPABLE_TOPOLOGIES = new Set([
  "ReplicaSetWithPrimary",
  "Sharded",
  "LoadBalanced",
]);

const REQUIRED_OCCUPANCY_INDEX = {
  barberId: 1,
  bookingDate: 1,
  minuteOfDay: 1,
};

const REQUIRED_BOOKING_INDEX = {
  bookingId: 1,
  bookingDate: 1,
  minuteOfDay: 1,
};

const getLogicalSessionTimeoutMinutes = (description) => {
  if (Number.isInteger(description?.logicalSessionTimeoutMinutes)) {
    return description.logicalSessionTimeoutMinutes;
  }

  if (!description?.servers?.values) return null;

  let timeout = null;
  for (const server of description.servers.values()) {
    if (!Number.isInteger(server?.logicalSessionTimeoutMinutes)) continue;
    timeout =
      timeout == null
        ? server.logicalSessionTimeoutMinutes
        : Math.min(timeout, server.logicalSessionTimeoutMinutes);
  }

  return timeout;
};

const connectionSupportsTransactions = (connection = mongoose.connection) => {
  if (
    connection?.readyState !== 1 ||
    typeof connection?.startSession !== "function"
  ) {
    return false;
  }

  const description = connection?.client?.topology?.description;
  if (!description?.type) return false;
  if (!TRANSACTION_CAPABLE_TOPOLOGIES.has(description.type)) return false;

  return Number.isInteger(getLogicalSessionTimeoutMinutes(description));
};

const bookingSlotHoldHooks = {
  supportsTransactions() {
    return connectionSupportsTransactions();
  },
  async startSession() {
    if (!connectionSupportsTransactions()) {
      return null;
    }

    const session = await mongoose.connection.startSession();
    return typeof session?.withTransaction === "function" ? session : null;
  },
  async indexesReady() {
    if (mongoose.connection?.readyState !== 1) return false;
    if (typeof BookingSlotHold.collection?.indexes !== "function") return false;

    const indexes = await BookingSlotHold.collection.indexes();
    const hasIndex = (expectedKey) =>
      indexes.some(
        (index) =>
          index?.unique === true &&
          JSON.stringify(index.key) === JSON.stringify(expectedKey)
      );

    return hasIndex(REQUIRED_OCCUPANCY_INDEX) &&
      hasIndex(REQUIRED_BOOKING_INDEX);
  },
  clearIndexReadinessCache() {},
};

export const __bookingSlotHoldServiceTestHooks = bookingSlotHoldHooks;

export class BookingSlotConflictError extends Error {
  constructor(message = "This time is already booked") {
    super(message);
    this.name = "BookingSlotConflictError";
    this.statusCode = 400;
    this.code = "BOOKING_SLOT_CONFLICT";
  }
}

export class BookingSlotProtectionUnavailableError extends Error {
  constructor(message = "Booking slot protection is temporarily unavailable") {
    super(message);
    this.name = "BookingSlotProtectionUnavailableError";
    this.statusCode = 503;
    this.code = "BOOKING_SLOT_PROTECTION_UNAVAILABLE";
  }
}

const isDuplicateKeyError = (error) =>
  error?.code === 11000 || error?.name === "MongoServerError" && error?.code === 11000;

export const isBookingSlotConflictError = (error) =>
  error instanceof BookingSlotConflictError || isDuplicateKeyError(error);

export const normalizeBookingSlotConflictError = (error) =>
  isBookingSlotConflictError(error)
    ? new BookingSlotConflictError()
    : error;

const getHoldQueryOptions = (session) => (session ? { session } : undefined);

const assertSlotMutationSession = (session) => {
  if (!session || typeof session !== "object") {
    throw new BookingSlotProtectionUnavailableError();
  }
};

export const isBookingSlotProtectionUnavailableError = (error) =>
  error instanceof BookingSlotProtectionUnavailableError ||
  error?.code === "BOOKING_SLOT_PROTECTION_UNAVAILABLE";

export const assertBookingSlotProtectionReady = async () => {
  try {
    if (!bookingSlotHoldHooks.supportsTransactions()) {
      throw new BookingSlotProtectionUnavailableError();
    }

    if (!(await bookingSlotHoldHooks.indexesReady())) {
      throw new BookingSlotProtectionUnavailableError();
    }
  } catch (error) {
    if (isBookingSlotProtectionUnavailableError(error)) {
      throw error;
    }
    throw new BookingSlotProtectionUnavailableError();
  }
};

const getValidatedBookingSlotMinutes = (time, duration) => {
  const slotStart = timeToMinutes(time);
  const slotDuration = Number(duration);

  if (
    slotStart === null ||
    !Number.isFinite(slotDuration) ||
    !Number.isInteger(slotDuration) ||
    slotDuration <= 0 ||
    slotStart + slotDuration > 24 * 60
  ) {
    return [];
  }

  return getBookingSlotMinutes(time, slotDuration);
};

const buildHoldDocuments = ({
  barberId,
  bookingDate,
  bookingId,
  time,
  duration,
}) => {
  if (!isDateKey(bookingDate)) return [];

  return getValidatedBookingSlotMinutes(time, duration).map((minuteOfDay) => ({
    bookingId,
    barberId,
    bookingDate,
    minuteOfDay,
  }));
};

const partitionHoldKeys = ({ bookingDate, time, duration }) => {
  const minuteSet = new Set(getValidatedBookingSlotMinutes(time, duration));
  return new Set(
    Array.from(minuteSet, (minuteOfDay) => `${bookingDate}:${minuteOfDay}`)
  );
};

export const findBookingSlotConflict = async ({
  barberId,
  bookingDate,
  time,
  duration,
  ignoreBookingId = null,
  session = null,
}) => {
  const minuteOfDay = getValidatedBookingSlotMinutes(time, duration);
  if (minuteOfDay.length === 0) {
    return null;
  }

  const holdQuery = {
    barberId,
    bookingDate,
    minuteOfDay: { $in: minuteOfDay },
  };

  if (ignoreBookingId) {
    holdQuery.bookingId = { $ne: ignoreBookingId };
  }

  const conflictingHold = await BookingSlotHold.findOne(
    holdQuery,
    null,
    getHoldQueryOptions(session)
  );
  if (conflictingHold) {
    return conflictingHold;
  }

  const activeBookingQuery = {
    barberId,
    status: { $in: blockingBookingStatuses },
    bookingDate,
  };

  if (ignoreBookingId) {
    activeBookingQuery._id = { $ne: ignoreBookingId };
  }

  const activeBookings = await Booking.find(
    activeBookingQuery,
    null,
    getHoldQueryOptions(session)
  );
  return activeBookings.find((booking) =>
    blockingBookingStatuses.includes(normalizeBookingStatus(booking?.status)) &&
    slotOverlaps(booking, time, duration)
  ) || null;
};

export const createBookingSlotHolds = async ({
  bookingId,
  barberId,
  bookingDate,
  time,
  duration,
  session = null,
}) => {
  assertSlotMutationSession(session);

  const docs = buildHoldDocuments({
    barberId,
    bookingDate,
    bookingId,
    time,
    duration,
  });

  if (docs.length === 0) {
    throw new Error("This time is outside working hours");
  }

  try {
    if (typeof BookingSlotHold.bulkWrite === "function") {
      return await BookingSlotHold.bulkWrite(
        docs.map((doc) => ({
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
        {
          ordered: true,
          ...(session ? { session } : {}),
        }
      );
    }

    return await BookingSlotHold.insertMany(docs, {
      ordered: true,
      ...(session ? { session } : {}),
    });
  } catch (error) {
    throw normalizeBookingSlotConflictError(error);
  }
};

export const releaseBookingSlotHolds = async ({
  bookingId,
  session = null,
}) => {
  if (!mongoose.isValidObjectId(bookingId)) {
    return { deletedCount: 0 };
  }
  assertSlotMutationSession(session);

  return BookingSlotHold.deleteMany(
    { bookingId },
    getHoldQueryOptions(session)
  );
};

export const moveBookingSlotHolds = async ({
  bookingId,
  barberId,
  fromBookingDate,
  fromTime,
  fromDuration,
  toBookingDate,
  toTime,
  toDuration,
  session = null,
}) => {
  assertSlotMutationSession(session);

  const nextDocs = buildHoldDocuments({
    bookingId,
    barberId,
    bookingDate: toBookingDate,
    time: toTime,
    duration: toDuration,
  });

  if (nextDocs.length === 0) {
    throw new Error("This time is outside working hours");
  }

  const previousKeys = partitionHoldKeys({
    bookingDate: fromBookingDate,
    time: fromTime,
    duration: fromDuration,
  });
  const nextKeys = new Set(
    nextDocs.map(({ bookingDate, minuteOfDay }) => `${bookingDate}:${minuteOfDay}`)
  );

  const docsToCreate = nextDocs.filter(
    ({ bookingDate, minuteOfDay }) =>
      !previousKeys.has(`${bookingDate}:${minuteOfDay}`)
  );
  const keysToDelete = Array.from(previousKeys).filter(
    (key) => !nextKeys.has(key)
  );

  if (docsToCreate.length) {
    try {
      if (typeof BookingSlotHold.bulkWrite === "function") {
        await BookingSlotHold.bulkWrite(
          docsToCreate.map((doc) => ({
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
          {
            ordered: true,
            ...(session ? { session } : {}),
          }
        );
      } else {
        await BookingSlotHold.insertMany(docsToCreate, {
          ordered: true,
          ...(session ? { session } : {}),
        });
      }
    } catch (error) {
      throw normalizeBookingSlotConflictError(error);
    }
  }

  if (!keysToDelete.length) {
    return;
  }

  const minutesByDate = new Map();
  for (const key of keysToDelete) {
    const [bookingDate, minuteOfDay] = key.split(":");
    const minutes = minutesByDate.get(bookingDate) || [];
    minutes.push(Number(minuteOfDay));
    minutesByDate.set(bookingDate, minutes);
  }

  for (const [bookingDate, minuteOfDay] of minutesByDate.entries()) {
    await BookingSlotHold.deleteMany(
      {
        bookingId,
        bookingDate,
        minuteOfDay: { $in: minuteOfDay },
      },
      getHoldQueryOptions(session)
    );
  }
};

export const runBookingSlotTransaction = async (task) => {
  await assertBookingSlotProtectionReady();

  let session;
  try {
    session = await bookingSlotHoldHooks.startSession();
  } catch (error) {
    throw new BookingSlotProtectionUnavailableError();
  }

  if (!session || typeof session.withTransaction !== "function") {
    throw new BookingSlotProtectionUnavailableError();
  }

  let result;
  let taskEntered = false;
  try {
    await session.withTransaction(async () => {
      taskEntered = true;
      result = await task({ session });
    });
    return result;
  } catch (error) {
    if (!taskEntered) {
      throw new BookingSlotProtectionUnavailableError();
    }
    throw error;
  } finally {
    await session.endSession?.().catch(() => {});
  }
};
