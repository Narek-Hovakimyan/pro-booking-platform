import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import mongoose from "mongoose";

import SchedulerLease from "../models/SchedulerLease.js";
import { createSchedulerLeaseService } from "./schedulerLeaseService.js";

const JOB_KEY = "booking-reminders";
const FIRST_OWNER = "owner-a";
const SECOND_OWNER = "owner-b";
const TTL_MS = 1000;
const REAL_MONGO_TESTS_ENABLED =
  process.env.RUN_REAL_MONGO_TRANSACTION_TESTS === "true";

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
    this.failStartSession = null;
    this.invalidSession = false;
    this.retryTransactionOnce = false;
  }

  getStore(session) {
    return session?.documents || this.documents;
  }

  async startSession() {
    if (this.failStartSession) throw this.failStartSession;
    if (this.invalidSession) return {};

    const session = {
      documents: null,
      withTransaction: async (callback) => {
        let attempt = 0;
        while (true) {
          session.documents = new Map(
            [...this.documents.entries()].map(([jobKey, document]) => [jobKey, clone(document)])
          );

          try {
            const result = await callback();
            if (this.retryTransactionOnce && attempt === 0) {
              attempt += 1;
              continue;
            }
            this.documents = session.documents;
            return result;
          } finally {
            session.documents = null;
          }
        }
      },
      async endSession() {},
    };

    return session;
  }

  async findOne({ jobKey }, _projection, options = {}) {
    if (this.failFind) throw this.failFind;

    const document = this.getStore(options.session).get(jobKey);
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
      writeSequence: document.writeSequence ?? 0,
      createdAt: new Date(document.leaseExpiresAt.getTime() - 100),
      updatedAt: new Date(document.leaseExpiresAt.getTime() - 100),
    };
    this.documents.set(document.jobKey, stored);
    return clone(stored);
  }

  async findOneAndUpdate(filter, update, options = {}) {
    if (this.failUpdate) throw this.failUpdate;

    const store = this.getStore(options.session);
    const current = store.get(filter.jobKey);
    if (!current || !matches(current, filter)) return null;

    const updated = {
      ...current,
      ...(update.$set || {}),
      fencingToken: current.fencingToken + (update.$inc?.fencingToken || 0),
      writeSequence: (current.writeSequence || 0) + (update.$inc?.writeSequence || 0),
      updatedAt: new Date(update.$set?.leaseExpiresAt || current.updatedAt),
    };
    store.set(filter.jobKey, updated);
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
    startSession: () => model.startSession(),
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
  assert.ok(SchedulerLease.schema.path("writeSequence"));
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

test("fenced writes increment writeSequence, share a session, and run after-commit hooks", async () => {
  const context = createTestContext();
  const acquired = await context.service.acquire({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    ttlMs: TTL_MS,
  });
  const phases = [];

  const result = await context.service.withFencedWrite({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    fencingToken: acquired.lease.fencingToken,
    write: async ({ session, lease, writeSequence, afterCommit }) => {
      phases.push(["write", writeSequence, session !== null]);
      afterCommit(() => {
        phases.push(["afterCommit", writeSequence]);
      });
      return lease.writeSequence;
    },
  });

  assert.equal(result, 1);
  assert.equal(context.model.documents.get(JOB_KEY).writeSequence, 1);
  assert.deepEqual(phases, [
    ["write", 1, true],
    ["afterCommit", 1],
  ]);
});

test("post-commit hooks use only the final transaction attempt", async () => {
  const context = createTestContext();
  const acquired = await context.service.acquire({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    ttlMs: TTL_MS,
  });
  context.model.retryTransactionOnce = true;
  const phases = [];

  const result = await context.service.withFencedWrite({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    fencingToken: acquired.lease.fencingToken,
    write: async ({ writeSequence, afterCommit }) => {
      phases.push(["write", writeSequence]);
      afterCommit(() => phases.push(["afterCommit", writeSequence]));
      return writeSequence;
    },
  });

  assert.equal(result, 1);
  assert.deepEqual(phases, [
    ["write", 1],
    ["write", 1],
    ["afterCommit", 1],
  ]);
  assert.equal(context.model.documents.get(JOB_KEY).writeSequence, 1);
});

test("post-commit callback failures do not roll back durable writes", async () => {
  const context = createTestContext();
  const acquired = await context.service.acquire({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    ttlMs: TTL_MS,
  });

  await assert.rejects(
    context.service.withFencedWrite({
      jobKey: JOB_KEY,
      ownerToken: FIRST_OWNER,
      fencingToken: acquired.lease.fencingToken,
      write: async ({ afterCommit }) => {
        afterCommit(() => {
          throw new Error("socket failed");
        });
        return "committed";
      },
    }),
    /socket failed/
  );

  assert.equal(context.model.documents.get(JOB_KEY).writeSequence, 1);
});

test("legacy leases without a writeSequence remain compatible", async () => {
  const context = createTestContext();
  context.model.documents.set(JOB_KEY, {
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    fencingToken: 1,
    leaseExpiresAt: new Date(context.now.getTime() + TTL_MS),
    createdAt: new Date(context.now.getTime() - 100),
    updatedAt: new Date(context.now.getTime() - 100),
  });

  const result = await context.service.withFencedWrite({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    fencingToken: 1,
    write: async ({ writeSequence }) => writeSequence,
  });

  assert.equal(result, 1);
  assert.equal(context.model.documents.get(JOB_KEY).writeSequence, 1);
});

test("fenced writes fail closed for stale owners and unavailable transactions", async () => {
  const context = createTestContext();
  const acquired = await context.service.acquire({
    jobKey: JOB_KEY,
    ownerToken: FIRST_OWNER,
    ttlMs: TTL_MS,
  });

  await assert.rejects(
    context.service.withFencedWrite({
      jobKey: JOB_KEY,
      ownerToken: SECOND_OWNER,
      fencingToken: acquired.lease.fencingToken,
      write: async () => "unreachable",
    }),
    (error) => error?.code === "scheduler_lease_lost" && error?.reason === "not_owner"
  );

  context.model.failStartSession = new Error("transactions unavailable");
  await assert.rejects(
    context.service.withFencedWrite({
      jobKey: JOB_KEY,
      ownerToken: FIRST_OWNER,
      fencingToken: acquired.lease.fencingToken,
      write: async () => "unreachable",
    }),
    /transactions unavailable/
  );
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

test(
  "real Mongo transaction conflict rejects stale writes and recovers with the new owner",
  { skip: !REAL_MONGO_TESTS_ENABLED },
  async () => {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error(
        "RUN_REAL_MONGO_TRANSACTION_TESTS=true requires MONGO_URI"
      );
    }

    const isolatedUri = new URL(mongoUri);
    const databaseName =
      isolatedUri.pathname.replace(/^\/+|\/+$/g, "") || "hairbook_ci_test";
    isolatedUri.pathname = `/${databaseName}_7c4b1_${process.pid}`;

    let connection;
    let staleWritePromise = null;
    let takeoverPromise = null;

    try {
      try {
        connection = await mongoose
          .createConnection(isolatedUri.toString(), {
            serverSelectionTimeoutMS: 5000,
          })
          .asPromise();
      } catch (error) {
        throw new Error(
          `Real Mongo transaction test could not connect: ${error.message}`,
          { cause: error }
        );
      }

      const leaseModel = connection.model(
        `SchedulerLeaseConflict_${process.pid}`,
        SchedulerLease.schema
      );
      const businessModel = connection.model(
        `SchedulerLeaseBusiness_${process.pid}`,
        new mongoose.Schema({
          notificationKey: { type: String, required: true },
          dispatchStatus: { type: String, required: true },
          legacyReminderAt: { type: Date, required: true },
          owner: { type: String, required: true },
          writeSequence: { type: Number, required: true },
        })
      );

      try {
        const capabilitySession = await connection.startSession();
        try {
          await capabilitySession.withTransaction(async () => {
            await businessModel.create(
              [
                {
                  notificationKey: "transaction-capability-probe",
                  dispatchStatus: "probe",
                  legacyReminderAt: new Date(),
                  owner: "probe",
                  writeSequence: 0,
                },
              ],
              { session: capabilitySession }
            );
          });
          await businessModel.deleteOne({
            notificationKey: "transaction-capability-probe",
          });
        } catch (error) {
          throw new Error(
            `MongoDB is not transaction-capable for the real conflict test: ${error.message}`,
            { cause: error }
          );
        } finally {
          await capabilitySession.endSession();
        }

        let currentTime = new Date("2026-07-24T00:00:00.000Z");
        const now = () => new Date(currentTime);
        let fenceAttemptCount = 0;
        let takeover = null;

        const blockingLeaseModel = {
          findOne: (...args) => leaseModel.findOne(...args),
          create: (...args) => leaseModel.create(...args),
          findOneAndUpdate: async (...args) => {
            const options = args[2] || {};
            if (options.session) {
              fenceAttemptCount += 1;
            }
            return leaseModel.findOneAndUpdate(...args);
          },
          db: connection.db,
        };

        const serviceA = createSchedulerLeaseService({
          model: blockingLeaseModel,
          now,
          ownerTokenFactory: () => FIRST_OWNER,
          startSession: connection.startSession.bind(connection),
        });
        const serviceB = createSchedulerLeaseService({
          model: leaseModel,
          now,
          ownerTokenFactory: () => SECOND_OWNER,
          startSession: connection.startSession.bind(connection),
        });

        const acquired = await serviceA.acquire({
          jobKey: JOB_KEY,
          ownerToken: FIRST_OWNER,
          ttlMs: TTL_MS,
        });
        assert.equal(acquired.acquired, true);

        await businessModel.create({
          notificationKey: "shared-reminder",
          dispatchStatus: "pending",
          legacyReminderAt: now(),
          owner: "seed",
          writeSequence: 0,
        });

        let staleCallbacks = 0;
        let businessAttemptCount = 0;
        let observedConflict = null;
        staleWritePromise = serviceA.withFencedWrite({
          jobKey: JOB_KEY,
          ownerToken: FIRST_OWNER,
          fencingToken: acquired.lease.fencingToken,
          write: async ({ session, afterCommit }) => {
            businessAttemptCount += 1;
            afterCommit(() => {
              staleCallbacks += 1;
            });
            const conflictSession = await connection.startSession();
            try {
              await conflictSession.withTransaction(async () => {
                const conflictResult = await businessModel.updateOne(
                  { notificationKey: "shared-reminder" },
                  {
                    $set: {
                      dispatchStatus: "conflicting-owner",
                      legacyReminderAt: now(),
                      owner: "conflicting-owner",
                      writeSequence: 99,
                    },
                  },
                  { session: conflictSession }
                );
                assert.equal(conflictResult.matchedCount, 1);
                assert.equal(conflictResult.modifiedCount, 1);
              });

              try {
                await businessModel.updateOne(
                  { notificationKey: "shared-reminder" },
                  {
                    $set: {
                      dispatchStatus: "sent",
                      legacyReminderAt: now(),
                      owner: FIRST_OWNER,
                      writeSequence: 1,
                    },
                  },
                  { session }
                );
              } catch (error) {
                observedConflict = error;
                currentTime = new Date(acquired.lease.leaseExpiresAt.getTime() + 1);
                takeoverPromise = serviceB.acquire({
                  jobKey: JOB_KEY,
                  ownerToken: SECOND_OWNER,
                  ttlMs: TTL_MS,
                });
                takeover = await takeoverPromise;
                throw error;
              }
            } finally {
              await conflictSession.endSession();
            }
          },
        });

        await assert.rejects(
          staleWritePromise,
          (error) =>
            error?.code === "scheduler_lease_lost" &&
            error?.reason === "not_owner"
        );
        assert.ok(observedConflict);
        assert.equal(
          typeof observedConflict.hasErrorLabel === "function" &&
            observedConflict.hasErrorLabel("TransientTransactionError"),
          true
        );
        assert.equal(
          observedConflict.code === 112 ||
            observedConflict.codeName === "WriteConflict" ||
            /write conflict/i.test(observedConflict.message),
          true
        );
        assert.equal(takeover?.acquired, true);
        assert.equal(
          takeover.lease.fencingToken,
          acquired.lease.fencingToken + 1
        );
        assert.ok(fenceAttemptCount >= 2);
        assert.equal(businessAttemptCount, 1);
        assert.equal(staleCallbacks, 0);

        let validCallbacks = 0;
        const recovered = await serviceB.withFencedWrite({
          jobKey: JOB_KEY,
          ownerToken: SECOND_OWNER,
          fencingToken: takeover.lease.fencingToken,
          write: async ({ session, writeSequence, afterCommit }) => {
            const result = await businessModel.updateOne(
              { notificationKey: "shared-reminder" },
              {
                $set: {
                  dispatchStatus: "sent",
                  legacyReminderAt: now(),
                  owner: SECOND_OWNER,
                  writeSequence,
                },
              },
              { session }
            );
            assert.equal(result.matchedCount, 1);
            assert.equal(result.modifiedCount, 1);
            afterCommit(() => {
              validCallbacks += 1;
            });
            return "recovered";
          },
        });

        assert.equal(recovered, "recovered");
        assert.equal(validCallbacks, 1);
        const businessWrites = await businessModel.find().lean();
        assert.equal(businessWrites.length, 1);
        assert.equal(businessWrites[0].notificationKey, "shared-reminder");
        assert.equal(businessWrites[0].owner, SECOND_OWNER);
      } finally {
        await staleWritePromise?.catch(() => {});
      }
    } finally {
      if (connection) {
        await connection.dropDatabase().catch(() => {});
        await connection.close().catch(() => {});
      }
    }
  }
);
