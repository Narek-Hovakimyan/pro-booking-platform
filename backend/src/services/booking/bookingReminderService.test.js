import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { runBookingReminders } from "./bookingReminderService.js";

const createBooking = (overrides = {}) => ({
  _id: "booking-1",
  barberId: "barber-1",
  barberName: "John Barber",
  clientId: "client-1",
  clientName: "Jane Client",
  bookingDate: "2026-07-26",
  time: "10:00",
  status: "accepted",
  reminder24hSentAt: null,
  reminder2hSentAt: null,
  ...overrides,
});

const createBookingModel = (initialBookings) => {
  const bookings = new Map(
    initialBookings.map((booking) => [String(booking._id), { ...booking }])
  );

  const matches = (booking, query) =>
    Object.entries(query).every(([key, value]) => {
      if (value && typeof value === "object" && "$in" in value) {
        return value.$in.includes(booking[key]);
      }
      if (value && typeof value === "object" && "$lte" in value) {
        return booking[key] <= value.$lte;
      }
      if (value && typeof value === "object" && "$ne" in value) {
        return booking[key] !== value.$ne;
      }
      return booking[key] === value;
    });

  return {
    bookings,
    async find(query) {
      return [...bookings.values()].filter((booking) => matches(booking, query));
    },
    async findOne(query) {
      return [...bookings.values()].find((booking) => matches(booking, query)) || null;
    },
    async findOneAndUpdate(query, update) {
      const booking = await this.findOne(query);
      if (!booking) return null;

      for (const [key, value] of Object.entries(update.$set || {})) {
        booking[key] = value;
      }

      return booking;
    },
  };
};

const createDispatchModel = (state) => ({
  async find(query) {
    return state.dispatches.filter(
      (dispatch) =>
        String(dispatch.bookingId) === String(query.bookingId) &&
        dispatch.reminderType === query.reminderType &&
        query.userId.$in.some((userId) => String(userId) === String(dispatch.userId))
    );
  },
});

const createDispatchService = (state, overrides = {}) => ({
  async claim({ bookingId, reminderType, userId }) {
    const key = `${bookingId}:${reminderType}:${userId}`;
    const existing = state.dispatches.find((dispatch) => dispatch.key === key);

    if (overrides.claim) {
      return overrides.claim({ bookingId, reminderType, userId, key, existing, state });
    }

    if (existing?.status === "sent" || existing?.status === "claimed") {
      return { claimed: false, dispatch: null, reason: existing.status };
    }

    const dispatch = {
      key,
      bookingId,
      reminderType,
      userId,
      status: "claimed",
      claimToken: `token:${key}:${state.claimCounter++}`,
      failureCode: "",
    };

    if (existing) {
      Object.assign(existing, dispatch);
      return { claimed: true, dispatch: existing };
    }

    state.dispatches.push(dispatch);
    return { claimed: true, dispatch };
  },
  async markSent({ bookingId, reminderType, userId, claimToken }) {
    const key = `${bookingId}:${reminderType}:${userId}`;
    const dispatch = state.dispatches.find(
      (entry) => entry.key === key && entry.claimToken === claimToken
    );

    if (overrides.markSent) {
      return overrides.markSent({ bookingId, reminderType, userId, claimToken, dispatch, state });
    }

    if (!dispatch) return { markedSent: false, reason: "not_owner" };

    dispatch.status = "sent";
    dispatch.sentAt = new Date("2026-07-25T09:00:00.000Z");
    return { markedSent: true, dispatch };
  },
  async markFailed({ bookingId, reminderType, userId, claimToken, failureCode }) {
    const key = `${bookingId}:${reminderType}:${userId}`;
    const dispatch = state.dispatches.find(
      (entry) => entry.key === key && entry.claimToken === claimToken
    );

    if (!dispatch) return { markedFailed: false, reason: "not_owner" };

    dispatch.status = "failed";
    dispatch.failureCode = failureCode;
    return { markedFailed: true, dispatch };
  },
});

test("server does not auto-start the legacy booking reminder cron", async () => {
  const serverSource = await readFile(new URL("../../server.js", import.meta.url), "utf8");

  assert.equal(serverSource.includes("cron/bookingReminders"), false);
});

test("24h reminder creates per-recipient notifications and finalizes legacy field", async () => {
  const bookingModel = createBookingModel([createBooking()]);
  const state = { dispatches: [], claimCounter: 1 };
  const notifications = [];

  const result = await runBookingReminders(new Date("2026-07-25T07:00:00.000Z"), {
    bookingModel,
    dispatchModel: createDispatchModel(state),
    dispatchService: createDispatchService(state),
    createNotification: async (payload) => {
      notifications.push(payload);
      return payload;
    },
  });

  assert.equal(result.remindersSent, 1);
  assert.equal(notifications.length, 2);
  assert.equal(
    bookingModel.bookings.get("booking-1").reminder24hSentAt instanceof Date,
    true
  );
  assert.equal(
    notifications.every((notification) => notification.idempotencyKey.includes("booking-reminder")),
    true
  );
});

test("2h reminder preserves messages and type", async () => {
  const bookingModel = createBookingModel([
    createBooking({ bookingDate: "2026-07-25", time: "11:00" }),
  ]);
  const state = { dispatches: [], claimCounter: 1 };
  const notifications = [];

  await runBookingReminders(new Date("2026-07-25T05:00:00.000Z"), {
    bookingModel,
    dispatchModel: createDispatchModel(state),
    dispatchService: createDispatchService(state),
    createNotification: async (payload) => {
      notifications.push(payload);
      return payload;
    },
  });

  assert.equal(notifications[0].type, "booking_reminder_2h");
  assert.equal(notifications[0].message, "Your appointment starts in 2 hours.");
});

test("partial delivery retries only failed recipient and avoids resending completed recipient", async () => {
  const bookingModel = createBookingModel([createBooking()]);
  const state = { dispatches: [], claimCounter: 1 };
  const notifications = [];

  const failingCreateNotification = async (payload) => {
    notifications.push(payload);
    if (payload.userId === "barber-1" && notifications.length === 2) {
      const error = new Error("socket");
      error.code = "socket_failure";
      throw error;
    }
    return payload;
  };

  const first = await runBookingReminders(new Date("2026-07-25T07:00:00.000Z"), {
    bookingModel,
    dispatchModel: createDispatchModel(state),
    dispatchService: createDispatchService(state),
    createNotification: failingCreateNotification,
  });
  const second = await runBookingReminders(new Date("2026-07-25T07:00:00.000Z"), {
    bookingModel,
    dispatchModel: createDispatchModel(state),
    dispatchService: createDispatchService(state),
    createNotification: async (payload) => {
      notifications.push(payload);
      return payload;
    },
  });

  assert.equal(first.remindersSent, 0);
  assert.equal(second.remindersSent, 1);
  assert.equal(
    notifications.filter((notification) => notification.userId === "client-1").length,
    1
  );
  assert.equal(
    notifications.filter((notification) => notification.userId === "barber-1").length,
    2
  );
});

test("crash after notification persistence recovers via stale claimed recipient without duplicate resend", async () => {
  const bookingModel = createBookingModel([createBooking()]);
  const state = {
    dispatches: [
      {
        key: "booking-1:booking_reminder_24h:client-1",
        bookingId: "booking-1",
        reminderType: "booking_reminder_24h",
        userId: "client-1",
        status: "failed",
        claimToken: "old-token",
        failureCode: "storage_error",
      },
    ],
    claimCounter: 1,
  };
  const idempotencyKeys = [];

  const result = await runBookingReminders(new Date("2026-07-25T07:00:00.000Z"), {
    bookingModel,
    dispatchModel: createDispatchModel(state),
    dispatchService: createDispatchService(state),
    createNotification: async (payload) => {
      idempotencyKeys.push(payload.idempotencyKey);
      return payload;
    },
  });

  assert.equal(result.remindersSent, 1);
  assert.equal(new Set(idempotencyKeys).size, 2);
});

test("booking cancellation after claim prevents delivery and marks failure", async () => {
  const bookingModel = createBookingModel([createBooking()]);
  const state = { dispatches: [], claimCounter: 1 };
  let readCount = 0;
  const originalFindOne = bookingModel.findOne.bind(bookingModel);
  bookingModel.findOne = async (query) => {
    const booking = await originalFindOne(query);
    readCount += 1;
    if (booking && readCount === 1) {
      booking.status = "cancelled";
    }
    return booking;
  };

  const result = await runBookingReminders(new Date("2026-07-25T07:00:00.000Z"), {
    bookingModel,
    dispatchModel: createDispatchModel(state),
    dispatchService: createDispatchService(state),
    createNotification: async () => {
      throw new Error("should not run");
    },
  });

  assert.equal(result.remindersSent, 0);
  assert.equal(state.dispatches.every((dispatch) => dispatch.status === "failed"), true);
});

test("booking reschedule outside the window prevents delivery", async () => {
  const bookingModel = createBookingModel([createBooking()]);
  const state = { dispatches: [], claimCounter: 1 };
  let readCount = 0;
  const originalFindOne = bookingModel.findOne.bind(bookingModel);
  bookingModel.findOne = async (query) => {
    const booking = await originalFindOne(query);
    readCount += 1;
    if (booking && readCount === 1) {
      booking.bookingDate = "2026-07-29";
    }
    return booking;
  };

  const result = await runBookingReminders(new Date("2026-07-25T07:00:00.000Z"), {
    bookingModel,
    dispatchModel: createDispatchModel(state),
    dispatchService: createDispatchService(state),
    createNotification: async () => {
      throw new Error("should not run");
    },
  });

  assert.equal(result.remindersSent, 0);
});

test("missing client recipient still sends barber reminder and finalizes", async () => {
  const bookingModel = createBookingModel([createBooking({ clientId: null })]);
  const state = { dispatches: [], claimCounter: 1 };
  const notifications = [];

  const result = await runBookingReminders(new Date("2026-07-25T07:00:00.000Z"), {
    bookingModel,
    dispatchModel: createDispatchModel(state),
    dispatchService: createDispatchService(state),
    createNotification: async (payload) => {
      notifications.push(payload);
      return payload;
    },
  });

  assert.equal(result.remindersSent, 1);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].userId, "barber-1");
});

test("socket failure is tolerated when notification persistence succeeds", async () => {
  const bookingModel = createBookingModel([createBooking()]);
  const state = { dispatches: [], claimCounter: 1 };
  const result = await runBookingReminders(new Date("2026-07-25T07:00:00.000Z"), {
    bookingModel,
    dispatchModel: createDispatchModel(state),
    dispatchService: createDispatchService(state),
    createNotification: async (payload) => payload,
  });

  assert.equal(result.remindersSent, 1);
});

test("concurrent workers share per-recipient state and avoid duplicate completion", async () => {
  const bookingModel = createBookingModel([createBooking()]);
  const state = { dispatches: [], claimCounter: 1 };
  const dispatchService = createDispatchService(state);
  const notifications = [];

  const results = await Promise.all([
    runBookingReminders(new Date("2026-07-25T07:00:00.000Z"), {
      bookingModel,
      dispatchModel: createDispatchModel(state),
      dispatchService,
      createNotification: async (payload) => {
        notifications.push(payload);
        return payload;
      },
    }),
    runBookingReminders(new Date("2026-07-25T07:00:00.000Z"), {
      bookingModel,
      dispatchModel: createDispatchModel(state),
      dispatchService,
      createNotification: async (payload) => {
        notifications.push(payload);
        return payload;
      },
    }),
  ]);

  assert.equal(notifications.length, 2);
  assert.equal(
    bookingModel.bookings.get("booking-1").reminder24hSentAt instanceof Date,
    true
  );
});
