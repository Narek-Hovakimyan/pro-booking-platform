import assert from "node:assert/strict";
import { test } from "node:test";

import EventReminderDispatch from "../../models/EventReminderDispatch.js";
import {
  createEventReminderDispatchService,
  DEFAULT_EVENT_REMINDER_STALE_CLAIM_TIMEOUT_MS,
} from "./eventReminderDispatchService.js";

const createDispatch = (overrides = {}) => ({
  _id: `dispatch-${Math.random().toString(36).slice(2, 9)}`,
  eventRegistrationId: "registration-1",
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
  let failFindOneAndUpdate = false;

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
    setDuplicateOnUpsert(value) {
      duplicateOnUpsert = value;
    },
    setFailFindOneAndUpdate(value) {
      failFindOneAndUpdate = value;
    },
    async findOne(filter) {
      return dispatches.find((dispatch) => matches(dispatch, filter)) || null;
    },
    async findOneAndUpdate(filter, update, options = {}) {
      if (failFindOneAndUpdate) {
        throw new Error("storage failed");
      }

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
          eventRegistrationId: filter.eventRegistrationId,
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

const createQueryLikeModel = (initialDispatches = []) => {
  const baseModel = createInMemoryModel(initialDispatches);

  const wrapResult = (operation) => ({
    select(selection) {
      return {
        then(resolve, reject) {
          Promise.resolve()
            .then(operation)
            .then((document) => {
              if (!document || selection !== "+claimToken") {
                return resolve(document ? { ...document, claimToken: undefined } : document);
              }

              return resolve(document);
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
  assert.equal(DEFAULT_EVENT_REMINDER_STALE_CLAIM_TIMEOUT_MS > 0, true);
});

test("mongoose queries keep claimToken hidden unless explicitly selected", () => {
  const defaultQuery = EventReminderDispatch.findOneAndUpdate(
    { eventRegistrationId: "registration-1", userId: "user-1" },
    { $set: { claimToken: "claim-default" } },
    { new: true }
  );
  defaultQuery._applyPaths();

  const selectedQuery = EventReminderDispatch.findOneAndUpdate(
    { eventRegistrationId: "registration-1", userId: "user-1" },
    { $set: { claimToken: "claim-selected" } },
    { new: true }
  ).select("+claimToken");
  selectedQuery._applyPaths();

  assert.equal(defaultQuery._fields.claimToken, 0);
  assert.equal("claimToken" in (selectedQuery._fields || {}), false);
});

test("claim inserts missing dispatch", async () => {
  const model = createInMemoryModel();
  const service = createEventReminderDispatchService({
    model,
    now: () => new Date("2026-07-25T08:05:00.000Z"),
    claimTokenFactory: () => "claim-a",
  });

  const result = await service.claim({
    eventRegistrationId: "registration-1",
    userId: "user-1",
  });

  assert.equal(result.claimed, true);
  assert.equal(result.dispatch.claimToken, "claim-a");
  assert.equal(result.dispatch.attempts, 1);
});

test("claim explicitly selects claimToken on query-like results", async () => {
  const model = createQueryLikeModel();
  const service = createEventReminderDispatchService({
    model,
    now: () => new Date("2026-07-25T08:05:00.000Z"),
    claimTokenFactory: () => "claim-query",
  });

  const result = await service.claim({
    eventRegistrationId: "registration-1",
    userId: "user-1",
  });

  assert.equal(result.claimed, true);
  assert.equal(result.dispatch.claimToken, "claim-query");
});

test("active claim fails closed", async () => {
  const model = createInMemoryModel([
    createDispatch({ claimedAt: new Date("2026-07-25T08:04:30.000Z") }),
  ]);
  const service = createEventReminderDispatchService({
    model,
    now: () => new Date("2026-07-25T08:05:00.000Z"),
    claimTokenFactory: () => "claim-b",
    staleClaimTimeoutMs: 60 * 1000,
  });

  const result = await service.claim({
    eventRegistrationId: "registration-1",
    userId: "user-1",
  });

  assert.equal(result.claimed, false);
  assert.equal(result.reason, "active");
});

test("failed and stale dispatches can be reclaimed", async () => {
  const model = createInMemoryModel([
    createDispatch({
      eventRegistrationId: "registration-1",
      status: "failed",
      failureCode: "notification_error",
    }),
    createDispatch({
      eventRegistrationId: "registration-2",
      userId: "user-2",
      claimedAt: new Date("2026-07-25T07:00:00.000Z"),
    }),
  ]);
  const service = createEventReminderDispatchService({
    model,
    now: () => new Date("2026-07-25T08:05:00.000Z"),
    claimTokenFactory: (() => {
      const tokens = ["claim-c", "claim-d"];
      return () => tokens.shift();
    })(),
    staleClaimTimeoutMs: 60 * 1000,
  });

  const failedResult = await service.claim({
    eventRegistrationId: "registration-1",
    userId: "user-1",
  });
  const staleResult = await service.claim({
    eventRegistrationId: "registration-2",
    userId: "user-2",
  });

  assert.equal(failedResult.claimed, true);
  assert.equal(failedResult.dispatch.attempts, 2);
  assert.equal(staleResult.claimed, true);
  assert.equal(staleResult.dispatch.claimToken, "claim-d");
});

test("sent dispatch is never reclaimed and duplicate-key races fail closed", async () => {
  const sentModel = createInMemoryModel([
    createDispatch({ status: "sent", sentAt: new Date("2026-07-25T08:01:00.000Z") }),
  ]);
  const sentService = createEventReminderDispatchService({
    model: sentModel,
    now: () => new Date("2026-07-25T08:05:00.000Z"),
    claimTokenFactory: () => "claim-e",
  });

  const sentResult = await sentService.claim({
    eventRegistrationId: "registration-1",
    userId: "user-1",
  });

  const duplicateModel = createInMemoryModel();
  duplicateModel.setDuplicateOnUpsert(true);
  const duplicateService = createEventReminderDispatchService({
    model: duplicateModel,
    now: () => new Date("2026-07-25T08:05:00.000Z"),
    claimTokenFactory: () => "claim-f",
  });

  const duplicateResult = await duplicateService.claim({
    eventRegistrationId: "registration-2",
    userId: "user-2",
  });

  assert.equal(sentResult.claimed, false);
  assert.equal(sentResult.reason, "sent");
  assert.equal(duplicateResult.claimed, false);
  assert.equal(duplicateResult.reason, "contended");
});

test("markSent and markFailed require exact ownership tuple and sanitize failure codes", async () => {
  const model = createInMemoryModel([
    createDispatch({ claimToken: "claim-g" }),
    createDispatch({
      eventRegistrationId: "registration-2",
      userId: "user-2",
      claimToken: "claim-h",
    }),
  ]);
  const service = createEventReminderDispatchService({
    model,
    now: () => new Date("2026-07-25T08:06:00.000Z"),
  });

  const wrongOwner = await service.markSent({
    eventRegistrationId: "registration-1",
    userId: "user-1",
    claimToken: "wrong-token",
  });
  const sentResult = await service.markSent({
    eventRegistrationId: "registration-1",
    userId: "user-1",
    claimToken: "claim-g",
  });
  const failedResult = await service.markFailed({
    eventRegistrationId: "registration-2",
    userId: "user-2",
    claimToken: "claim-h",
    failureCode: "BAD-CODE",
  });

  assert.equal(wrongOwner.markedSent, false);
  assert.equal(sentResult.markedSent, true);
  assert.equal(sentResult.dispatch.status, "sent");
  assert.equal(failedResult.markedFailed, true);
  assert.equal(failedResult.dispatch.failureCode, "unknown_error");
});

test("completion updates fail closed when claimToken is missing or malformed", async () => {
  const incompleteModel = {
    async findOne() {
      return null;
    },
    async findOneAndUpdate() {
      return {
        _id: "dispatch-missing-token",
        eventRegistrationId: "registration-1",
        userId: "user-1",
        status: "sent",
        sentAt: new Date("2026-07-25T08:06:00.000Z"),
        attempts: 1,
        failureCode: "",
      };
    },
  };
  const malformedModel = {
    async findOne() {
      return null;
    },
    async findOneAndUpdate() {
      return {
        _id: "dispatch-bad-token",
        eventRegistrationId: "registration-2",
        userId: "user-2",
        status: "failed",
        claimToken: "different-token",
        claimedAt: new Date("2026-07-25T08:05:00.000Z"),
        attempts: 2,
        failureCode: "unknown_error",
      };
    },
  };

  const incompleteService = createEventReminderDispatchService({
    model: incompleteModel,
    now: () => new Date("2026-07-25T08:06:00.000Z"),
  });
  const malformedService = createEventReminderDispatchService({
    model: malformedModel,
    now: () => new Date("2026-07-25T08:06:00.000Z"),
  });

  const missingTokenResult = await incompleteService.markSent({
    eventRegistrationId: "registration-1",
    userId: "user-1",
    claimToken: "claim-real",
  });
  const malformedTokenResult = await malformedService.markFailed({
    eventRegistrationId: "registration-2",
    userId: "user-2",
    claimToken: "claim-expected",
    failureCode: "provider_down",
  });

  assert.equal(missingTokenResult.markedSent, false);
  assert.equal(missingTokenResult.reason, "not_owner");
  assert.equal(malformedTokenResult.markedFailed, false);
  assert.equal(malformedTokenResult.reason, "not_owner");
});

test("storage failures never acquire or update dispatches", async () => {
  const model = createInMemoryModel();
  model.setFailFindOneAndUpdate(true);
  const service = createEventReminderDispatchService({
    model,
    now: () => new Date("2026-07-25T08:05:00.000Z"),
    claimTokenFactory: () => "claim-i",
  });

  const claimResult = await service.claim({
    eventRegistrationId: "registration-1",
    userId: "user-1",
  });
  const sentResult = await service.markSent({
    eventRegistrationId: "registration-1",
    userId: "user-1",
    claimToken: "claim-i",
  });

  assert.equal(claimResult.claimed, false);
  assert.equal(claimResult.reason, "storage_error");
  assert.equal(sentResult.markedSent, false);
  assert.equal(sentResult.reason, "storage_error");
});
