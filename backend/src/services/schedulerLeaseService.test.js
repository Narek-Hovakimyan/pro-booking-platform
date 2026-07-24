import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import SchedulerLease from "../models/SchedulerLease.js";
import { createSchedulerLeaseService } from "./schedulerLeaseService.js";

const JOB_KEY = "booking-reminders";
const FIRST_OWNER = "owner-a";
const SECOND_OWNER = "owner-b";
const TTL_MS = 1000;

const clone = (value) => ({
  ...value,
  leaseExpiresAt: new Date(value.leaseExpiresAt),
  ...(value.createdAt ? { createdAt: new Date(value.createdAt) } : {}),
  ...(value.updatedAt ? { updatedAt: new Date(value.updatedAt) } : {}),
});

const matches = (document, filter) =>
  Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];

    if (expected && typeof expected === "object" && "$lte" in expected) {
      return actual <= expected.$lte;
    }

    if (expected && typeof expected === "object" && "$gt" in expected) {
      return actual > expected.$gt;
    }

    return actual === expected;
  });

class FakeLeaseModel {
  constructor() {
    this.documents = new Map();
    this.failFind = null;
    this.failCreate = null;
    this.failUpdate = null;
    this.forceDuplicate = false;
  }

  async findOne({ jobKey }) {
    if (this.failFind) throw this.failFind;

    const document = this.documents.get(jobKey);
    return document ? clone(document) : null;
  }

  async create(document) {
    if (this.failCreate) throw this.failCreate;

    if (this.forceDuplicate || this.documents.has(document.jobKey)) {
      const error = new Error("duplicate key");
      error.code = 11000;
      throw error;
    }

    const stored = {
      ...document,
      createdAt: new Date(document.leaseExpiresAt.getTime() - 100),
      updatedAt: new Date(document.leaseExpiresAt.getTime() - 100),
    };
    this.documents.set(document.jobKey, stored);
    return clone(stored);
  }

  async findOneAndUpdate(filter, update) {
    if (this.failUpdate) throw this.failUpdate;

    const current = this.documents.get(filter.jobKey);
    if (!current || !matches(current, filter)) return null;

    const updated = {
      ...current,
      ...(update.$set || {}),
      fencingToken: current.fencingToken + (update.$inc?.fencingToken || 0),
      updatedAt: new Date(update.$set?.leaseExpiresAt || current.updatedAt),
    };
    this.documents.set(filter.jobKey, updated);
    return clone(updated);
  }
}

const createTestContext = (start = new Date("2026-07-24T00:00:00.000Z")) => {
  const model = new FakeLeaseModel();
  let currentTime = new Date(start);
  const service = createSchedulerLeaseService({
    model,
    now: () => new Date(currentTime),
    ownerTokenFactory: () => FIRST_OWNER,
  });

  return {
    model,
    service,
    get now() {
      return new Date(currentTime);
    },
    advance(ms) {
      currentTime = new Date(currentTime.getTime() + ms);
    },
  };
};

afterEach(() => {});

test("schema persists one lease per job key with monotonic fencing and no TTL index", () => {
  const jobKeyIndex = SchedulerLease.schema
    .indexes()
    .find(([fields]) => fields.jobKey === 1);

  assert.deepEqual(jobKeyIndex, [{ jobKey: 1 }, { unique: true }]);
  assert.equal(SchedulerLease.schema.options.timestamps, true);
  assert.equal(SchedulerLease.schema.path("leaseExpiresAt").options.expireAfterSeconds, undefined);
  assert.ok(SchedulerLease.schema.path("fencingToken"));
});

test("first acquisition creates a lease with fencing token one", async () => {
  const { service, now } = createTestContext();

  const result = await service.acquire({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    ttlMs: TTL_MS,
  });

  assert.equal(result.acquired, true);
  assert.equal(result.lease.jobKey, JOB_KEY);
  assert.equal(result.lease.ownerToken, FIRST_OWNER);
  assert.equal(result.lease.fencingToken, 1);
  assert.equal(result.lease.leaseExpiresAt.getTime(), now.getTime() + TTL_MS);
});

test("active contention and same-owner overlap fail closed", async () => {
  const { service } = createTestContext();
  const first = await service.acquire({ jobKey: JOB_KEY, ownerToken: FIRST_OWNER, ttlMs: TTL_MS });
  const [sameOwner, otherOwner] = await Promise.all([
    service.acquire({ jobKey: JOB_KEY, ownerToken: FIRST_OWNER, ttlMs: TTL_MS }),
    service.acquire({ jobKey: JOB_KEY, ownerToken: SECOND_OWNER, ttlMs: TTL_MS }),
  ]);

  assert.equal(first.acquired, true);
  assert.equal(sameOwner.acquired, false);
  assert.equal(otherOwner.acquired, false);
  assert.equal(sameOwner.reason, "active");
  assert.equal(otherOwner.reason, "active");
});

test("overlapping first acquisitions allow only one owner", async () => {
  const { service } = createTestContext();
  const results = await Promise.all([
    service.acquire({ jobKey: JOB_KEY, ownerToken: FIRST_OWNER, ttlMs: TTL_MS }),
    service.acquire({ jobKey: JOB_KEY, ownerToken: SECOND_OWNER, ttlMs: TTL_MS }),
  ]);

  assert.equal(results.filter((result) => result.acquired).length, 1);
  assert.equal(results.filter((result) => !result.acquired).length, 1);
});

test("expired takeover increments fencing monotonically", async () => {
  const context = createTestContext();
  const first = await context.service.acquire({ jobKey: JOB_KEY, ownerToken: FIRST_OWNER, ttlMs: TTL_MS });

  context.advance(TTL_MS);
  const second = await context.service.acquire({ jobKey: JOB_KEY, ownerToken: SECOND_OWNER, ttlMs: TTL_MS });
  context.advance(TTL_MS);
  const third = await context.service.acquire({ jobKey: JOB_KEY, ownerToken: "owner-c", ttlMs: TTL_MS });

  assert.equal(first.lease.fencingToken, 1);
  assert.equal(second.lease.fencingToken, 2);
  assert.equal(third.lease.fencingToken, 3);
});

test("renewal requires the exact active ownership tuple", async () => {
  const context = createTestContext();
  const acquired = await context.service.acquire({ jobKey: JOB_KEY, ownerToken: FIRST_OWNER, ttlMs: TTL_MS });
  context.advance(500);

  const renewed = await context.service.renew({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    fencingToken: acquired.lease.fencingToken,
    ttlMs: TTL_MS,
  });
  const staleOwner = await context.service.renew({
    jobKey: JOB_KEY,
    ownerToken: SECOND_OWNER,
    fencingToken: acquired.lease.fencingToken,
    ttlMs: TTL_MS,
  });

  assert.equal(renewed.renewed, true);
  assert.equal(renewed.lease.leaseExpiresAt.getTime(), context.now.getTime() + TTL_MS);
  assert.equal(staleOwner.renewed, false);
  assert.equal(staleOwner.reason, "not_owner");
});

test("expired leases cannot be renewed and release requires exact ownership", async () => {
  const context = createTestContext();
  const acquired = await context.service.acquire({ jobKey: JOB_KEY, ownerToken: FIRST_OWNER, ttlMs: TTL_MS });
  context.advance(TTL_MS);

  const expiredRenewal = await context.service.renew({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    fencingToken: acquired.lease.fencingToken,
    ttlMs: TTL_MS,
  });
  const released = await context.service.release({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    fencingToken: acquired.lease.fencingToken,
  });
  const staleRelease = await context.service.release({
    jobKey: JOB_KEY,
    ownerToken: SECOND_OWNER,
    fencingToken: acquired.lease.fencingToken,
  });

  assert.equal(expiredRenewal.renewed, false);
  assert.equal(expiredRenewal.reason, "not_owner");
  assert.equal(released.released, true);
  assert.equal(staleRelease.released, false);
});

test("stale owner and fencing token cannot renew or release a newer lease", async () => {
  const context = createTestContext();
  const first = await context.service.acquire({ jobKey: JOB_KEY, ownerToken: FIRST_OWNER, ttlMs: TTL_MS });
  context.advance(TTL_MS);
  const second = await context.service.acquire({ jobKey: JOB_KEY, ownerToken: SECOND_OWNER, ttlMs: TTL_MS });

  const staleRenewal = await context.service.renew({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    fencingToken: first.lease.fencingToken,
    ttlMs: TTL_MS,
  });
  const staleRelease = await context.service.release({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    fencingToken: first.lease.fencingToken,
  });

  assert.equal(second.lease.fencingToken, first.lease.fencingToken + 1);
  assert.equal(staleRenewal.renewed, false);
  assert.equal(staleRelease.released, false);
  assert.equal(context.model.documents.get(JOB_KEY).ownerToken, SECOND_OWNER);
});

test("duplicate-key races are not retried as an acquisition", async () => {
  const context = createTestContext();
  context.model.forceDuplicate = true;

  const result = await context.service.acquire({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    ttlMs: TTL_MS,
  });

  assert.equal(result.acquired, false);
  assert.equal(result.reason, "contended");
  assert.equal(context.model.documents.size, 0);
});

test("storage failures never return an acquired, renewed, or released lease", async () => {
  const context = createTestContext();
  context.model.failFind = new Error("database unavailable");
  const failedAcquire = await context.service.acquire({ jobKey: JOB_KEY, ownerToken: FIRST_OWNER, ttlMs: TTL_MS });

  context.model.failFind = null;
  await context.service.acquire({ jobKey: JOB_KEY, ownerToken: FIRST_OWNER, ttlMs: TTL_MS });
  context.model.failUpdate = new Error("database unavailable");
  const failedRenewal = await context.service.renew({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    fencingToken: 1,
    ttlMs: TTL_MS,
  });
  const failedRelease = await context.service.release({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    fencingToken: 1,
  });

  assert.equal(failedAcquire.acquired, false);
  assert.equal(failedRenewal.renewed, false);
  assert.equal(failedRelease.released, false);
});

test("invalid job keys, owner tokens, TTLs, fencing tokens, and dates are rejected", async () => {
  const context = createTestContext();

  await assert.rejects(
    context.service.acquire({ jobKey: " ", ownerToken: FIRST_OWNER, ttlMs: TTL_MS }),
    TypeError
  );
  await assert.rejects(
    context.service.acquire({ jobKey: JOB_KEY, ownerToken: " ", ttlMs: TTL_MS }),
    TypeError
  );
  await assert.rejects(
    context.service.acquire({ jobKey: JOB_KEY, ownerToken: FIRST_OWNER, ttlMs: 0 }),
    TypeError
  );
  await assert.rejects(
    context.service.renew({ jobKey: JOB_KEY, ownerToken: FIRST_OWNER, fencingToken: 0, ttlMs: TTL_MS }),
    TypeError
  );
  await assert.rejects(
    context.service.release({ jobKey: JOB_KEY, ownerToken: FIRST_OWNER, fencingToken: 0 }),
    TypeError
  );

  const invalidDateService = createSchedulerLeaseService({
    model: context.model,
    now: () => new Date("invalid"),
  });
  await assert.rejects(
    invalidDateService.acquire({ jobKey: JOB_KEY, ownerToken: FIRST_OWNER, ttlMs: TTL_MS }),
    TypeError
  );
});
