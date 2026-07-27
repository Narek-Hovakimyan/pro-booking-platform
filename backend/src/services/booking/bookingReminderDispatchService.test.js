import assert from "node:assert/strict";
import { test } from "node:test";

import BookingReminderDispatch from "../../models/BookingReminderDispatch.js";
import {
  createBookingReminderDispatchService,
  DEFAULT_BOOKING_REMINDER_STALE_CLAIM_TIMEOUT_MS,
} from "./bookingReminderDispatchService.js";

const createDispatch = (overrides = {}) => ({
  _id: `dispatch-${Math.random().toString(36).slice(2, 9)}`,
  bookingId: "booking-1",
  reminderType: "booking_reminder_24h",
  userId: "user-1",
  status: "claimed",
  claimToken: "claim-1",
  claimedAt: new Date("2026-07-25T08:00:00.000Z"),
  sentAt: null,
  attempts: 1,
  failureCode: "",
  createdAt: new Date("2026-07-25T08:00:00.000Z"),
  updatedAt: new Date("2026-07-25T08:00:00.000Z"),
  ...overrides,
});

const createInMemoryModel = (initialDispatches = []) => {
  const dispatches = initialDispatches.map((dispatch) => ({ ...dispatch }));
  let duplicateOnUpsert = false;

  const matches = (dispatch, filter) =>
    Object.entries(filter).every(([key, value]) => {
      if (key === "$or") {
        return value.some((entry) => matches(dispatch, entry));
      }
      if (value && typeof value === "object" && "$lte" in value) {
        return dispatch[key] <= value.$lte;
      }
      return String(dispatch[key]) === String(value);
    });

  const applyUpdate = (dispatch, update, isInsert) => {
    for (const [key, value] of Object.entries(update.$setOnInsert || {})) {
      if (isInsert) dispatch[key] = value;
    }
    for (const [key, value] of Object.entries(update.$set || {})) {
      dispatch[key] = value;
    }
    for (const [key, value] of Object.entries(update.$inc || {})) {
      dispatch[key] = (dispatch[key] || 0) + value;
    }
    dispatch.updatedAt = new Date("2026-07-25T08:05:00.000Z");
    return dispatch;
  };

  return {
    dispatches,
    setDuplicateOnUpsert(value) {
      duplicateOnUpsert = value;
    },
    async findOne(filter) {
      return dispatches.find((dispatch) => matches(dispatch, filter)) || null;
    },
    async findOneAndUpdate(filter, update, options = {}) {
      const existing = dispatches.find((dispatch) => matches(dispatch, filter));

      if (existing) {
        return applyUpdate(existing, update, false);
      }

      if (!options.upsert) {
        return null;
      }

      if (duplicateOnUpsert) {
        const error = new Error("duplicate key");
        error.code = 11000;
        throw error;
      }

      const created = applyUpdate(
        createDispatch({
          bookingId: filter.bookingId,
          reminderType: filter.reminderType,
          userId: filter.userId,
          attempts: 0,
        }),
        update,
        true
      );
      dispatches.push(created);
      return created;
    },
  };
};

const createQueryLikeModel = (
  initialDispatches = [],
  { selectResult = (document) => document } = {}
) => {
  const baseModel = createInMemoryModel(initialDispatches);

  const wrapResult = (operation) => ({
    select(selection) {
      return {
        then(resolve, reject) {
          Promise.resolve()
            .then(operation)
            .then((document) => {
              if (!document) {
                return resolve(document);
              }

              if (selection !== "+claimToken") {
                return resolve({ ...document, claimToken: undefined });
              }

              return resolve(selectResult({ ...document }));
            }, reject);
        },
      };
    },
    then(resolve, reject) {
      Promise.resolve()
        .then(operation)
        .then((document) => {
          resolve(document ? { ...document, claimToken: undefined } : document);
        }, reject);
    },
  });

  return {
    async findOne(filter) {
      return baseModel.findOne(filter);
    },
    findOneAndUpdate(filter, update, options) {
      return wrapResult(() => baseModel.findOneAndUpdate(filter, update, options));
    },
  };
};

test("default stale-claim timeout stays positive", () => {
  assert.equal(DEFAULT_BOOKING_REMINDER_STALE_CLAIM_TIMEOUT_MS > 0, true);
});

test("mongoose queries keep claimToken hidden unless explicitly selected", () => {
  const defaultQuery = BookingReminderDispatch.findOneAndUpdate(
    {
      bookingId: "booking-1",
      reminderType: "booking_reminder_24h",
      userId: "user-1",
    },
    { $set: { claimToken: "claim-default" } },
    { new: true }
  );
  defaultQuery._applyPaths();

  const selectedQuery = BookingReminderDispatch.findOneAndUpdate(
    {
      bookingId: "booking-1",
      reminderType: "booking_reminder_24h",
      userId: "user-1",
    },
    { $set: { claimToken: "claim-selected" } },
    { new: true }
  ).select("+claimToken");
  selectedQuery._applyPaths();

  assert.equal(defaultQuery._fields.claimToken, 0);
  assert.equal("claimToken" in (selectedQuery._fields || {}), false);
});

test("claim inserts missing dispatch", async () => {
  const model = createInMemoryModel();
  const service = createBookingReminderDispatchService({
    model,
    now: () => new Date("2026-07-25T08:05:00.000Z"),
    claimTokenFactory: () => "claim-a",
  });

  const result = await service.claim({
    bookingId: "booking-1",
    reminderType: "booking_reminder_24h",
    userId: "user-1",
  });

  assert.equal(result.claimed, true);
  assert.equal(result.dispatch.claimToken, "claim-a");
  assert.equal(result.dispatch.attempts, 1);
});

test("claim explicitly selects claimToken on query-like results", async () => {
  const model = createQueryLikeModel();
  const service = createBookingReminderDispatchService({
    model,
    now: () => new Date("2026-07-25T08:05:00.000Z"),
    claimTokenFactory: () => "claim-query",
  });

  const result = await service.claim({
    bookingId: "booking-1",
    reminderType: "booking_reminder_24h",
    userId: "user-1",
  });

  assert.equal(result.claimed, true);
  assert.equal(result.dispatch.claimToken, "claim-query");
});

test("active claim fails closed", async () => {
  const model = createInMemoryModel([
    createDispatch({ claimedAt: new Date("2026-07-25T08:04:30.000Z") }),
  ]);
  const service = createBookingReminderDispatchService({
    model,
    now: () => new Date("2026-07-25T08:05:00.000Z"),
    claimTokenFactory: () => "claim-b",
    staleClaimTimeoutMs: 60 * 1000,
  });

  const result = await service.claim({
    bookingId: "booking-1",
    reminderType: "booking_reminder_24h",
    userId: "user-1",
  });

  assert.equal(result.claimed, false);
  assert.equal(result.reason, "active");
});

test("failed dispatch can be reclaimed", async () => {
  const model = createInMemoryModel([
    createDispatch({ status: "failed", failureCode: "notification_error" }),
  ]);
  const service = createBookingReminderDispatchService({
    model,
    now: () => new Date("2026-07-25T08:05:00.000Z"),
    claimTokenFactory: () => "claim-c",
  });

  const result = await service.claim({
    bookingId: "booking-1",
    reminderType: "booking_reminder_24h",
    userId: "user-1",
  });

  assert.equal(result.claimed, true);
  assert.equal(result.dispatch.status, "claimed");
  assert.equal(result.dispatch.claimToken, "claim-c");
  assert.equal(result.dispatch.attempts, 2);
});

test("stale claimed dispatch can be reclaimed", async () => {
  const model = createInMemoryModel([
    createDispatch({ claimedAt: new Date("2026-07-25T07:00:00.000Z") }),
  ]);
  const service = createBookingReminderDispatchService({
    model,
    now: () => new Date("2026-07-25T08:05:00.000Z"),
    claimTokenFactory: () => "claim-d",
    staleClaimTimeoutMs: 60 * 1000,
  });

  const result = await service.claim({
    bookingId: "booking-1",
    reminderType: "booking_reminder_24h",
    userId: "user-1",
  });

  assert.equal(result.claimed, true);
  assert.equal(result.dispatch.claimToken, "claim-d");
});

test("sent dispatch is never reclaimed", async () => {
  const model = createInMemoryModel([
    createDispatch({ status: "sent", sentAt: new Date("2026-07-25T08:01:00.000Z") }),
  ]);
  const service = createBookingReminderDispatchService({
    model,
    now: () => new Date("2026-07-25T08:05:00.000Z"),
    claimTokenFactory: () => "claim-e",
  });

  const result = await service.claim({
    bookingId: "booking-1",
    reminderType: "booking_reminder_24h",
    userId: "user-1",
  });

  assert.equal(result.claimed, false);
  assert.equal(result.reason, "sent");
});

test("duplicate-key race returns not claimed", async () => {
  const model = createInMemoryModel();
  model.setDuplicateOnUpsert(true);
  const service = createBookingReminderDispatchService({
    model,
    now: () => new Date("2026-07-25T08:05:00.000Z"),
    claimTokenFactory: () => "claim-f",
  });

  const result = await service.claim({
    bookingId: "booking-1",
    reminderType: "booking_reminder_24h",
    userId: "user-1",
  });

  assert.equal(result.claimed, false);
  assert.equal(result.reason, "contended");
});

test("markSent requires exact ownership tuple", async () => {
  const model = createInMemoryModel([createDispatch({ claimToken: "claim-g" })]);
  const service = createBookingReminderDispatchService({
    model,
    now: () => new Date("2026-07-25T08:06:00.000Z"),
  });

  const first = await service.markSent({
    bookingId: "booking-1",
    reminderType: "booking_reminder_24h",
    userId: "user-1",
    claimToken: "wrong-token",
  });
  const second = await service.markSent({
    bookingId: "booking-1",
    reminderType: "booking_reminder_24h",
    userId: "user-1",
    claimToken: "claim-g",
  });

  assert.equal(first.markedSent, false);
  assert.equal(second.markedSent, true);
  assert.equal(second.dispatch.status, "sent");
});

test("markSent fails closed when returned claimToken is hidden or mismatched", async () => {
  const hiddenTokenModel = createQueryLikeModel([createDispatch({ claimToken: "claim-i" })], {
    selectResult: (document) => ({ ...document, claimToken: undefined }),
  });
  const mismatchedTokenModel = createQueryLikeModel(
    [createDispatch({ claimToken: "claim-j" })],
    {
      selectResult: (document) => ({ ...document, claimToken: "wrong-token" }),
    }
  );
  const hiddenTokenService = createBookingReminderDispatchService({ model: hiddenTokenModel });
  const mismatchedTokenService = createBookingReminderDispatchService({
    model: mismatchedTokenModel,
  });

  const hiddenResult = await hiddenTokenService.markSent({
    bookingId: "booking-1",
    reminderType: "booking_reminder_24h",
    userId: "user-1",
    claimToken: "claim-i",
  });
  const mismatchedResult = await mismatchedTokenService.markSent({
    bookingId: "booking-1",
    reminderType: "booking_reminder_24h",
    userId: "user-1",
    claimToken: "claim-j",
  });

  assert.equal(hiddenResult.markedSent, false);
  assert.equal(hiddenResult.reason, "not_owner");
  assert.equal(mismatchedResult.markedSent, false);
  assert.equal(mismatchedResult.reason, "not_owner");
});

test("markFailed sanitizes failure code and requires exact token", async () => {
  const model = createInMemoryModel([createDispatch({ claimToken: "claim-h" })]);
  const service = createBookingReminderDispatchService({ model });

  const first = await service.markFailed({
    bookingId: "booking-1",
    reminderType: "booking_reminder_24h",
    userId: "user-1",
    claimToken: "claim-h",
    failureCode: "UPPERCASE-NOPE",
  });

  assert.equal(first.markedFailed, true);
  assert.equal(first.dispatch.failureCode, "unknown_error");
});

test("markFailed fails closed when returned claimToken is hidden or malformed", async () => {
  const hiddenTokenModel = createQueryLikeModel([createDispatch({ claimToken: "claim-k" })], {
    selectResult: (document) => ({ ...document, claimToken: undefined }),
  });
  const malformedTokenModel = createQueryLikeModel(
    [createDispatch({ claimToken: "claim-l" })],
    {
      selectResult: (document) => ({ ...document, claimToken: "" }),
    }
  );
  const hiddenTokenService = createBookingReminderDispatchService({ model: hiddenTokenModel });
  const malformedTokenService = createBookingReminderDispatchService({
    model: malformedTokenModel,
  });

  const hiddenResult = await hiddenTokenService.markFailed({
    bookingId: "booking-1",
    reminderType: "booking_reminder_24h",
    userId: "user-1",
    claimToken: "claim-k",
    failureCode: "socket_failure",
  });
  const malformedResult = await malformedTokenService.markFailed({
    bookingId: "booking-1",
    reminderType: "booking_reminder_24h",
    userId: "user-1",
    claimToken: "claim-l",
    failureCode: "socket_failure",
  });

  assert.equal(hiddenResult.markedFailed, false);
  assert.equal(hiddenResult.reason, "not_owner");
  assert.equal(malformedResult.markedFailed, false);
  assert.equal(malformedResult.reason, "not_owner");
});
