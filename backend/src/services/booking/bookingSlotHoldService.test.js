import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import Booking from "../../models/Booking.js";
import BookingSlotHold from "../../models/BookingSlotHold.js";
import {
  __bookingSlotHoldServiceTestHooks,
  BookingSlotConflictError,
  BookingSlotProtectionUnavailableError,
  createBookingSlotHolds,
  findBookingSlotConflict,
  isBookingSlotConflictError,
  moveBookingSlotHolds,
  releaseBookingSlotHolds,
  runBookingSlotTransaction,
} from "./bookingSlotHoldService.js";
import {
  collectBookingSlotHoldBackfillPlan,
} from "../../../scripts/backfill-booking-slot-holds.js";

const originalMethods = {
  bookingFind: Booking.find,
  bookingSlotHoldFindOne: BookingSlotHold.findOne,
  bookingSlotHoldBulkWrite: BookingSlotHold.bulkWrite,
  bookingSlotHoldInsertMany: BookingSlotHold.insertMany,
  bookingSlotHoldDeleteMany: BookingSlotHold.deleteMany,
  indexesReady: __bookingSlotHoldServiceTestHooks.indexesReady,
  supportsTransactions: __bookingSlotHoldServiceTestHooks.supportsTransactions,
  startSession: __bookingSlotHoldServiceTestHooks.startSession,
};

const REAL_MONGO_TESTS_ENABLED =
  process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true";
const fakeSession = { id: "session-1" };

afterEach(() => {
  Booking.find = originalMethods.bookingFind;
  BookingSlotHold.findOne = originalMethods.bookingSlotHoldFindOne;
  BookingSlotHold.bulkWrite = originalMethods.bookingSlotHoldBulkWrite;
  BookingSlotHold.insertMany = originalMethods.bookingSlotHoldInsertMany;
  BookingSlotHold.deleteMany = originalMethods.bookingSlotHoldDeleteMany;
  __bookingSlotHoldServiceTestHooks.indexesReady =
    originalMethods.indexesReady;
  __bookingSlotHoldServiceTestHooks.supportsTransactions =
    originalMethods.supportsTransactions;
  __bookingSlotHoldServiceTestHooks.startSession =
    originalMethods.startSession;
  __bookingSlotHoldServiceTestHooks.clearIndexReadinessCache?.();
});

test("BookingSlotHold indexes are explicit and protect occupancy plus cross-date ownership", () => {
  const indexes = BookingSlotHold.schema.indexes();

  assert.equal(BookingSlotHold.schema.options.autoIndex, false);
  assert.ok(
    indexes.some(
      ([fields, options]) =>
        options?.unique === true &&
        fields.barberId === 1 &&
        fields.bookingDate === 1 &&
        fields.minuteOfDay === 1
    )
  );
  assert.ok(
    indexes.some(
      ([fields, options]) =>
        options?.unique === true &&
        fields.bookingId === 1 &&
        fields.bookingDate === 1 &&
        fields.minuteOfDay === 1
    )
  );
});

test("findBookingSlotConflict prefers minute holds before legacy booking fallback", async () => {
  BookingSlotHold.findOne = async (query) => ({
    bookingId: "64b000000000000000000022",
    barberId: query.barberId,
    bookingDate: query.bookingDate,
    minuteOfDay: query.minuteOfDay.$in[0],
  });
  Booking.find = async () => assert.fail("legacy booking query should not run");

  const conflict = await findBookingSlotConflict({
    barberId: "barber-1",
    bookingDate: "2026-08-10",
    time: "10:00",
    duration: 30,
  });

  assert.equal(conflict.bookingId, "64b000000000000000000022");
});

test("findBookingSlotConflict falls back to active bookings during rollout", async () => {
  BookingSlotHold.findOne = async () => null;
  Booking.find = async () => [
    {
      _id: "64b000000000000000000021",
      barberId: "barber-1",
      bookingDate: "2026-08-10",
      time: "10:15",
      duration: 30,
      status: "accepted",
    },
  ];

  const conflict = await findBookingSlotConflict({
    barberId: "barber-1",
    bookingDate: "2026-08-10",
    time: "10:00",
    duration: 30,
  });

  assert.equal(conflict._id, "64b000000000000000000021");
});

test("createBookingSlotHolds maps duplicate key failures to booked errors", async () => {
  BookingSlotHold.bulkWrite = async () => {
    const error = new Error("duplicate key");
    error.code = 11000;
    throw error;
  };

  await assert.rejects(
    () =>
      createBookingSlotHolds({
        bookingId: "64b000000000000000000021",
        barberId: "barber-1",
        bookingDate: "2026-08-10",
        time: "10:00",
        duration: 30,
        session: fakeSession,
      }),
    BookingSlotConflictError
  );
});

test("moveBookingSlotHolds upserts added minutes and deletes removed minutes only", async () => {
  const bulkCalls = [];
  const deleteCalls = [];

  BookingSlotHold.bulkWrite = async (operations) => {
    bulkCalls.push(operations);
    return { ok: 1 };
  };
  BookingSlotHold.deleteMany = async (query) => {
    deleteCalls.push(query);
    return { deletedCount: 10 };
  };

  await moveBookingSlotHolds({
    bookingId: "64b000000000000000000021",
    barberId: "barber-1",
    fromBookingDate: "2026-08-10",
    fromTime: "10:00",
    fromDuration: 30,
    toBookingDate: "2026-08-10",
    toTime: "10:10",
    toDuration: 30,
    session: fakeSession,
  });

  assert.equal(bulkCalls.length, 1);
  assert.equal(bulkCalls[0].length, 10);
  assert.equal(deleteCalls.length, 1);
  assert.deepEqual(deleteCalls[0], {
    bookingId: "64b000000000000000000021",
    bookingDate: "2026-08-10",
    minuteOfDay: { $in: [600, 601, 602, 603, 604, 605, 606, 607, 608, 609] },
  });
});

test("releaseBookingSlotHolds deletes all minutes for a booking", async () => {
  let deleteQuery = null;

  BookingSlotHold.deleteMany = async (query) => {
    deleteQuery = query;
    return { deletedCount: 30 };
  };

  await releaseBookingSlotHolds({
    bookingId: "64b000000000000000000021",
    session: fakeSession,
  });

  assert.deepEqual(deleteQuery, { bookingId: "64b000000000000000000021" });
});

test("runBookingSlotTransaction uses a session when available", async () => {
  const session = {
    async withTransaction(callback) {
      return callback();
    },
    async endSession() {},
  };
  let sawSession = null;

  __bookingSlotHoldServiceTestHooks.supportsTransactions = () => true;
  __bookingSlotHoldServiceTestHooks.indexesReady = async () => true;
  __bookingSlotHoldServiceTestHooks.startSession = async () => session;

  const result = await runBookingSlotTransaction(async ({ session: activeSession }) => {
    sawSession = activeSession;
    return "ok";
  });

  assert.equal(result, "ok");
  assert.equal(sawSession, session);
  assert.equal(isBookingSlotConflictError(new BookingSlotConflictError()), true);
});

test("runBookingSlotTransaction fails closed when transactions are unavailable", async () => {
  let writes = 0;

  __bookingSlotHoldServiceTestHooks.supportsTransactions = () => false;
  __bookingSlotHoldServiceTestHooks.indexesReady = async () => true;
  BookingSlotHold.bulkWrite = async () => {
    writes += 1;
  };

  await assert.rejects(
    () =>
      runBookingSlotTransaction(async ({ session }) =>
        createBookingSlotHolds({
          bookingId: "64b000000000000000000021",
          barberId: "barber-1",
          bookingDate: "2026-08-10",
          time: "10:00",
          duration: 30,
          session,
        })
      ),
    BookingSlotProtectionUnavailableError
  );
  assert.equal(writes, 0);
});

test("runBookingSlotTransaction fails closed when required indexes are missing", async () => {
  let writes = 0;

  __bookingSlotHoldServiceTestHooks.supportsTransactions = () => true;
  __bookingSlotHoldServiceTestHooks.indexesReady = async () => false;
  __bookingSlotHoldServiceTestHooks.startSession = async () => ({
    async withTransaction(callback) {
      return callback();
    },
    async endSession() {},
  });
  BookingSlotHold.bulkWrite = async () => {
    writes += 1;
  };

  await assert.rejects(
    () =>
      runBookingSlotTransaction(async ({ session }) =>
        createBookingSlotHolds({
          bookingId: "64b000000000000000000021",
          barberId: "barber-1",
          bookingDate: "2026-08-10",
          time: "10:00",
          duration: 30,
          session,
        })
      ),
    BookingSlotProtectionUnavailableError
  );
  assert.equal(writes, 0);
});

test("runBookingSlotTransaction fails closed when index readiness rejects", async () => {
  let startSessionAttempts = 0;
  let writes = 0;

  __bookingSlotHoldServiceTestHooks.supportsTransactions = () => true;
  __bookingSlotHoldServiceTestHooks.indexesReady = async () => {
    throw new Error("index readiness failed");
  };
  __bookingSlotHoldServiceTestHooks.startSession = async () => {
    startSessionAttempts += 1;
    return fakeSession;
  };
  BookingSlotHold.bulkWrite = async () => {
    writes += 1;
  };

  await assert.rejects(
    () =>
      runBookingSlotTransaction(async ({ session }) =>
        createBookingSlotHolds({
          bookingId: "64b000000000000000000021",
          barberId: "barber-1",
          bookingDate: "2026-08-10",
          time: "10:00",
          duration: 30,
          session,
        })
      ),
    BookingSlotProtectionUnavailableError
  );
  assert.equal(startSessionAttempts, 0);
  assert.equal(writes, 0);
});

test("runBookingSlotTransaction fails closed when session acquisition rejects", async () => {
  let taskCalled = false;
  let writes = 0;

  __bookingSlotHoldServiceTestHooks.supportsTransactions = () => true;
  __bookingSlotHoldServiceTestHooks.indexesReady = async () => true;
  __bookingSlotHoldServiceTestHooks.startSession = async () => {
    throw new Error("startSession failed");
  };
  BookingSlotHold.bulkWrite = async () => {
    writes += 1;
  };

  await assert.rejects(
    () =>
      runBookingSlotTransaction(async ({ session }) => {
        taskCalled = true;
        await createBookingSlotHolds({
          bookingId: "64b000000000000000000021",
          barberId: "barber-1",
          bookingDate: "2026-08-10",
          time: "10:00",
          duration: 30,
          session,
        });
      }),
    BookingSlotProtectionUnavailableError
  );
  assert.equal(taskCalled, false);
  assert.equal(writes, 0);
});

test("runBookingSlotTransaction fails closed when session object is invalid", async () => {
  let taskCalled = false;
  let writes = 0;

  __bookingSlotHoldServiceTestHooks.supportsTransactions = () => true;
  __bookingSlotHoldServiceTestHooks.indexesReady = async () => true;
  __bookingSlotHoldServiceTestHooks.startSession = async () => ({ id: "bad-session" });
  BookingSlotHold.bulkWrite = async () => {
    writes += 1;
  };

  await assert.rejects(
    () =>
      runBookingSlotTransaction(async ({ session }) => {
        taskCalled = true;
        await createBookingSlotHolds({
          bookingId: "64b000000000000000000021",
          barberId: "barber-1",
          bookingDate: "2026-08-10",
          time: "10:00",
          duration: 30,
          session,
        });
      }),
    BookingSlotProtectionUnavailableError
  );
  assert.equal(taskCalled, false);
  assert.equal(writes, 0);
});

test("runBookingSlotTransaction fails closed when transaction setup throws before work starts", async () => {
  let taskCalled = false;
  let writes = 0;

  __bookingSlotHoldServiceTestHooks.supportsTransactions = () => true;
  __bookingSlotHoldServiceTestHooks.indexesReady = async () => true;
  __bookingSlotHoldServiceTestHooks.startSession = async () => ({
    async withTransaction() {
      throw new Error("transaction setup failed");
    },
    async endSession() {},
  });
  BookingSlotHold.bulkWrite = async () => {
    writes += 1;
  };

  await assert.rejects(
    () =>
      runBookingSlotTransaction(async ({ session }) => {
        taskCalled = true;
        await createBookingSlotHolds({
          bookingId: "64b000000000000000000021",
          barberId: "barber-1",
          bookingDate: "2026-08-10",
          time: "10:00",
          duration: 30,
          session,
        });
      }),
    BookingSlotProtectionUnavailableError
  );
  assert.equal(taskCalled, false);
  assert.equal(writes, 0);
});

test("slot hold mutations reject midnight overflow and invalid durations", async () => {
  await assert.rejects(
    () =>
      createBookingSlotHolds({
        bookingId: "64b000000000000000000021",
        barberId: "barber-1",
        bookingDate: "2026-08-10",
        time: "23:45",
        duration: 30,
        session: fakeSession,
      }),
    /outside working hours/
  );

  await assert.rejects(
    () =>
      createBookingSlotHolds({
        bookingId: "64b000000000000000000021",
        barberId: "barber-1",
        bookingDate: "2026-08-10",
        time: "10:00",
        duration: 0,
        session: fakeSession,
      }),
    /outside working hours/
  );
});

test("moveBookingSlotHolds validates destination before writing", async () => {
  let writes = 0;
  let deletes = 0;

  BookingSlotHold.bulkWrite = async () => {
    writes += 1;
    return { ok: 1 };
  };
  BookingSlotHold.insertMany = async () => {
    writes += 1;
    return [];
  };
  BookingSlotHold.deleteMany = async () => {
    deletes += 1;
    return { deletedCount: 30 };
  };

  for (const destination of [
    { toBookingDate: "2026-08-10", toTime: "23:45", toDuration: 30 },
    { toBookingDate: "2026-08-10", toTime: "10:00", toDuration: 0 },
    { toBookingDate: "2026-08-10", toTime: "10:00", toDuration: -5 },
    { toBookingDate: "2026-08-10", toTime: "10:00", toDuration: Infinity },
    { toBookingDate: "bad-date", toTime: "10:00", toDuration: 30 },
    { toBookingDate: "2026-08-10", toTime: "bad-time", toDuration: 30 },
  ]) {
    await assert.rejects(
      () =>
        moveBookingSlotHolds({
          bookingId: "64b000000000000000000021",
          barberId: "barber-1",
          fromBookingDate: "2026-08-10",
          fromTime: "10:00",
          fromDuration: 30,
          ...destination,
          session: fakeSession,
        }),
      /outside working hours/
    );
  }

  assert.equal(writes, 0);
  assert.equal(deletes, 0);
});

test("backfill plan refuses active overlaps and duplicate same-booking hold keys", () => {
  const plan = collectBookingSlotHoldBackfillPlan({
    activeBookings: [
      {
        _id: "booking-1",
        barberId: "barber-1",
        bookingDate: "2026-08-10",
        time: "10:00",
        duration: 30,
      },
      {
        _id: "booking-2",
        barberId: "barber-1",
        bookingDate: "2026-08-10",
        time: "10:15",
        duration: 30,
      },
    ],
    existingHolds: [
      {
        _id: "hold-1",
        bookingId: "booking-3",
        barberId: "barber-2",
        bookingDate: "2026-08-10",
        minuteOfDay: 600,
      },
      {
        _id: "hold-2",
        bookingId: "booking-3",
        barberId: "barber-2",
        bookingDate: "2026-08-10",
        minuteOfDay: 600,
      },
    ],
  });

  assert.ok(
    plan.overlaps.some(
      (overlap) =>
        overlap.bookingId === "booking-2" &&
        overlap.conflictingBookingId === "booking-1"
    )
  );
  assert.ok(
    plan.overlaps.some(
      (overlap) => overlap.reason === "duplicate same-booking hold key"
    )
  );
});

test("backfill plan refuses invalid and midnight-overflow active bookings", () => {
  const plan = collectBookingSlotHoldBackfillPlan({
    activeBookings: [
      {
        _id: "booking-overflow",
        barberId: "barber-1",
        bookingDate: "2026-08-10",
        time: "23:45",
        duration: 30,
      },
      {
        _id: "booking-invalid-duration",
        barberId: "barber-1",
        bookingDate: "2026-08-10",
        time: "10:00",
        duration: 0,
      },
    ],
    existingHolds: [],
  });

  assert.equal(plan.desiredDocs.length, 0);
  assert.deepEqual(
    plan.overlaps.map((overlap) => overlap.reason),
    ["invalid booking slot data", "invalid booking slot data"]
  );
});

test(
  "real Mongo slot transactions allow exactly one competing writer and roll back atomically",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("RUN_REAL_MONGO_TRANSACTION_TESTS=true requires MONGO_URI");
    }

    const isolatedUri = new URL(mongoUri);
    const databaseName =
      isolatedUri.pathname.replace(/^\/+|\/+$/g, "") || "hairbook_ci_test";
    isolatedUri.pathname = `/${databaseName}_slot_hold_${process.pid}`;

    await mongoose.connect(isolatedUri.toString(), {
      serverSelectionTimeoutMS: 5000,
    });

    try {
      await Booking.deleteMany({});
      await BookingSlotHold.deleteMany({});
      await BookingSlotHold.createIndexes();
      __bookingSlotHoldServiceTestHooks.clearIndexReadinessCache?.();

      const barberId = new mongoose.Types.ObjectId();
      const bookingIds = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
      ];
      const results = await Promise.allSettled(
        bookingIds.map((bookingId) =>
          runBookingSlotTransaction(async ({ session }) => {
            await createBookingSlotHolds({
              bookingId,
              barberId,
              bookingDate: "2026-08-10",
              time: "10:00",
              duration: 30,
              session,
            });
            await Booking.create(
              [
                {
                  _id: bookingId,
                  clientId: new mongoose.Types.ObjectId(),
                  barberId,
                  serviceId: new mongoose.Types.ObjectId(),
                  bookingDate: "2026-08-10",
                  dayKey: "mon",
                  time: "10:00",
                  duration: 30,
                  price: 100,
                  serviceName: "Haircut",
                  status: "accepted",
                },
              ],
              { session }
            );
          })
        )
      );

      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(results.filter((result) => result.status === "rejected").length, 1);
      assert.equal(await Booking.countDocuments({ barberId }), 1);
      assert.equal(await BookingSlotHold.countDocuments({ barberId }), 30);

      const rollbackId = new mongoose.Types.ObjectId();
      await assert.rejects(
        () =>
          runBookingSlotTransaction(async ({ session }) => {
            await createBookingSlotHolds({
              bookingId: rollbackId,
              barberId,
              bookingDate: "2026-08-10",
              time: "11:00",
              duration: 30,
              session,
            });
            await Booking.create(
              [
                {
                  _id: rollbackId,
                  clientId: new mongoose.Types.ObjectId(),
                  barberId,
                  serviceId: new mongoose.Types.ObjectId(),
                  bookingDate: "2026-08-10",
                  dayKey: "mon",
                  time: "11:00",
                  duration: 30,
                  price: 100,
                  serviceName: "Haircut",
                  status: "accepted",
                },
              ],
              { session }
            );
            throw new Error("force rollback");
          }),
        /force rollback/
      );
      assert.equal(await Booking.exists({ _id: rollbackId }), null);
      assert.equal(
        await BookingSlotHold.countDocuments({ bookingId: rollbackId }),
        0
      );
    } finally {
      await mongoose.disconnect().catch(() => {});
    }
  }
);

test(
  "real Mongo slot hold ownership permits same-minute cross-date moves",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("RUN_REAL_MONGO_TRANSACTION_TESTS=true requires MONGO_URI");
    }

    const isolatedUri = new URL(mongoUri);
    const databaseName =
      isolatedUri.pathname.replace(/^\/+|\/+$/g, "") || "hairbook_ci_test";
    isolatedUri.pathname = `/${databaseName}_slot_move_${process.pid}`;

    await mongoose.connect(isolatedUri.toString(), {
      serverSelectionTimeoutMS: 5000,
    });

    try {
      await BookingSlotHold.deleteMany({});
      await BookingSlotHold.createIndexes();
      __bookingSlotHoldServiceTestHooks.clearIndexReadinessCache?.();

      const barberId = new mongoose.Types.ObjectId();
      const bookingId = new mongoose.Types.ObjectId();
      await runBookingSlotTransaction(({ session }) =>
        createBookingSlotHolds({
          bookingId,
          barberId,
          bookingDate: "2026-08-10",
          time: "10:00",
          duration: 30,
          session,
        })
      );
      await runBookingSlotTransaction(({ session }) =>
        moveBookingSlotHolds({
          bookingId,
          barberId,
          fromBookingDate: "2026-08-10",
          fromTime: "10:00",
          fromDuration: 30,
          toBookingDate: "2026-08-11",
          toTime: "10:00",
          toDuration: 30,
          session,
        })
      );

      assert.equal(
        await BookingSlotHold.countDocuments({ bookingId, bookingDate: "2026-08-10" }),
        0
      );
      assert.equal(
        await BookingSlotHold.countDocuments({ bookingId, bookingDate: "2026-08-11" }),
        30
      );
    } finally {
      await mongoose.disconnect().catch(() => {});
    }
  }
);
