import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BOOKING_CREATED_DISPATCH_EVENT,
  createBookingPostCommitDispatchService,
} from "./bookingPostCommitDispatchService.js";

const booking = {
  _id: "booking-1",
  barberId: "barber-1",
  clientId: "client-1",
  clientName: "Client",
  createdBy: "client",
  bookingDate: "2099-01-01",
  time: "10:00",
};

const matches = (row, filter = {}) => {
  if (filter._id && String(row._id) !== String(filter._id)) return false;
  if (filter.bookingId && String(row.bookingId) !== String(filter.bookingId)) return false;
  if (filter.eventType && row.eventType !== filter.eventType) return false;
  if (filter.status && row.status !== filter.status) return false;
  if (filter.leaseToken !== undefined && row.leaseToken !== filter.leaseToken) return false;
  if (!filter.$or) return true;
  return filter.$or.some((candidate) => {
    if (candidate.status && row.status !== candidate.status) return false;
    for (const field of ["nextAttemptAt", "leaseExpiresAt"]) {
      if (candidate[field]?.$lte && (!row[field] || row[field] > candidate[field].$lte)) {
        return false;
      }
    }
    return true;
  });
};

const createModel = () => {
  const rows = [];
  let serial = 0;
  const apply = (row, update) => {
    Object.assign(row, update.$set || {});
    for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
    for (const key of Object.keys(update.$unset || {})) delete row[key];
    return row;
  };
  return {
    rows,
    async create(documents) {
      const payload = documents[0];
      if (rows.some((row) => row.bookingId === payload.bookingId && row.eventType === payload.eventType)) {
        const error = new Error("duplicate");
        error.code = 11000;
        throw error;
      }
      const row = { _id: `dispatch-${++serial}`, ...payload };
      rows.push(row);
      return [row];
    },
    async findOne(filter) {
      return rows.find((row) => matches(row, filter)) || null;
    },
    findOneAndUpdate(filter, update) {
      const row = rows.find((candidate) => matches(candidate, filter));
      const result = row ? apply(row, update) : null;
      return { select: async () => result };
    },
    find(filter) {
      const selected = rows.filter((row) => matches(row, filter));
      return {
        sort() { return this; },
        limit(limit) { return Promise.resolve(selected.slice(0, limit)); },
      };
    },
  };
};

test("dispatch enqueue is minimal, unique, and contains no booking payload", async () => {
  const model = createModel();
  const service = createBookingPostCommitDispatchService({ model, bookingModel: { findById: async () => booking } });
  const first = await service.enqueue({ bookingId: booking._id, session: { id: "transaction" } });
  const replay = await service.enqueue({ bookingId: booking._id });

  assert.equal(first.eventType, BOOKING_CREATED_DISPATCH_EVENT);
  assert.equal(replay._id, first._id);
  assert.equal(model.rows.length, 1);
  assert.deepEqual(Object.keys(model.rows[0]).sort(), ["_id", "attempts", "bookingId", "eventType", "nextAttemptAt", "status"]);
  assert.equal(JSON.stringify(model.rows[0]).includes("Client"), false);
});

test("delivery persists one idempotent notification, retries failure, and may repeat only socket fan-out", async () => {
  const model = createModel();
  const notifications = new Map();
  let socketCalls = 0;
  let failOnce = true;
  const clock = new Date("2099-01-01T00:00:00.000Z");
  const service = createBookingPostCommitDispatchService({
    model,
    bookingModel: { findById: async () => booking },
    now: () => clock,
    retryMs: 0,
    leaseTokenFactory: (() => { let token = 0; return () => `lease-${++token}`; })(),
    createNotificationFn: async (payload) => {
      notifications.set(payload.idempotencyKey, payload);
      if (failOnce) {
        failOnce = false;
        throw new Error("notification unavailable");
      }
      return payload;
    },
    emitBookingUpdatedFn: () => { socketCalls += 1; },
  });
  const dispatch = await service.enqueue({ bookingId: booking._id });

  assert.deepEqual(await service.deliver({ dispatchId: dispatch._id }), { delivered: false, reason: "delivery_failed" });
  assert.equal(model.rows[0].status, "failed");
  assert.equal(await service.deliver({ dispatchId: dispatch._id }).then((result) => result.delivered), true);
  assert.equal(model.rows[0].status, "delivered");
  assert.equal(notifications.size, 1);
  assert.equal(socketCalls, 1);
  assert.deepEqual(await service.deliver({ dispatchId: dispatch._id }), { delivered: false, reason: "not_claimed" });
});

test("only one competing worker claims a dispatch and an expired lease is recoverable", async () => {
  const model = createModel();
  let current = new Date("2099-01-01T00:00:00.000Z");
  const service = createBookingPostCommitDispatchService({
    model,
    bookingModel: { findById: async () => booking },
    now: () => current,
    leaseMs: 10,
    leaseTokenFactory: (() => { let token = 0; return () => `lease-${++token}`; })(),
    createNotificationFn: async () => ({ ok: true }),
    emitBookingUpdatedFn: () => {},
  });
  const dispatch = await service.enqueue({ bookingId: booking._id });
  const first = service.deliver({ dispatchId: dispatch._id });
  const second = service.deliver({ dispatchId: dispatch._id });
  const results = await Promise.all([first, second]);
  assert.equal(results.filter((result) => result.delivered).length, 1);

  const another = await service.enqueue({ bookingId: "booking-2" });
  model.rows.find((row) => row._id === another._id).status = "processing";
  model.rows.find((row) => row._id === another._id).leaseExpiresAt = new Date(current.getTime() - 1);
  current = new Date(current.getTime() + 20);
  assert.equal((await service.deliver({ dispatchId: another._id })).delivered, true);
});
