import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createSchedulerLeaseRunner } from "./schedulerLeaseRunner.js";

const createLogger = () => ({
  infoMessages: [],
  warnMessages: [],
  errorMessages: [],
  info(...args) {
    this.infoMessages.push(args);
  },
  warn(...args) {
    this.warnMessages.push(args);
  },
  error(...args) {
    this.errorMessages.push(args);
  },
});

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
};

const createStaticLeaseModel = () => ({
  async findOne() {
    return { _id: "lease" };
  },
});

const createLeaseService = () => {
  const state = new Map();
  const calls = {
    acquire: [],
    renew: [],
    release: [],
    ownershipChecks: [],
    withFencedWrite: [],
  };

  const leaseModel = {
    async findOne(filter) {
      calls.ownershipChecks.push(filter);
      const current = state.get(filter.jobKey);

      if (!current?.active) {
        return null;
      }
      if (current.ownerToken !== filter.ownerToken) {
        return null;
      }
      if (current.fencingToken !== filter.fencingToken) {
        return null;
      }
      if (!(filter.leaseExpiresAt?.$gt instanceof Date)) {
        return null;
      }
      if (!(current.leaseExpiresAt > filter.leaseExpiresAt.$gt)) {
        return null;
      }

      return { ...current };
    },
  };

  return {
    calls,
    leaseModel,
    state,
    async acquire({ jobKey, ownerToken, ttlMs }) {
      calls.acquire.push({ jobKey, ownerToken, ttlMs });
      const current = state.get(jobKey);
      if (current?.active) {
        return { acquired: false, lease: null, reason: "active" };
      }

      const fencingToken = (current?.fencingToken ?? 0) + 1;
      const lease = {
        jobKey,
        ownerToken,
        fencingToken,
        leaseExpiresAt: new Date(Date.now() + ttlMs),
        writeSequence: current?.writeSequence ?? 0,
      };
      state.set(jobKey, { ...lease, active: true });
      return { acquired: true, lease };
    },
    async renew({ jobKey, ownerToken, fencingToken, ttlMs }) {
      calls.renew.push({ jobKey, ownerToken, fencingToken, ttlMs });
      const current = state.get(jobKey);
      if (
        !current?.active ||
        current.ownerToken !== ownerToken ||
        current.fencingToken !== fencingToken
      ) {
        return { renewed: false, lease: null, reason: "not_owner" };
      }

      const lease = { ...current, leaseExpiresAt: new Date(Date.now() + ttlMs) };
      state.set(jobKey, { ...lease, active: true });
      return { renewed: true, lease };
    },
    async release({ jobKey, ownerToken, fencingToken }) {
      calls.release.push({ jobKey, ownerToken, fencingToken });
      const current = state.get(jobKey);
      if (
        !current?.active ||
        current.ownerToken !== ownerToken ||
        current.fencingToken !== fencingToken
      ) {
        return { released: false, reason: "not_owner" };
      }

      state.set(jobKey, { ...current, active: false });
      return { released: true, lease: current };
    },
    async withFencedWrite({ jobKey, ownerToken, fencingToken, write }) {
      calls.withFencedWrite.push({ jobKey, ownerToken, fencingToken });
      const current = state.get(jobKey);
      if (
        !current?.active ||
        current.ownerToken !== ownerToken ||
        current.fencingToken !== fencingToken
      ) {
        const error = new Error("lease lost");
        error.code = "scheduler_lease_lost";
        error.reason = "not_owner";
        throw error;
      }

      const afterCommitCallbacks = [];
      const lease = { ...current, writeSequence: (current.writeSequence ?? 0) + 1 };
      const result = await write({
        session: { jobKey },
        lease,
        writeSequence: lease.writeSequence,
        afterCommit(callback) {
          if (typeof callback === "function") {
            afterCommitCallbacks.push(callback);
          }
        },
      });

      state.set(jobKey, { ...lease, active: true });
      for (const callback of afterCommitCallbacks) {
        await callback();
      }

      return result;
    },
  };
};

test("competing instances run under one lease owner at a time", async () => {
  const leaseService = createLeaseService();
  const loggerA = createLogger();
  const loggerB = createLogger();
  const callbacks = [];
  const runs = [];

  const createSetIntervalFn = () => (callback) => {
    callbacks.push(callback);
    return {};
  };

  const runnerA = createSchedulerLeaseRunner({
    jobKey: "booking-reminders",
    intervalMs: 1000,
    logger: loggerA,
    leaseService,
    leaseModel: leaseService.leaseModel,
    ownerTokenFactory: () => "owner-a",
    setIntervalFn: createSetIntervalFn(),
    clearIntervalFn: () => {},
    run: async () => {
      runs.push("a");
    },
  });
  const runnerB = createSchedulerLeaseRunner({
    jobKey: "booking-reminders",
    intervalMs: 1000,
    logger: loggerB,
    leaseService,
    leaseModel: leaseService.leaseModel,
    ownerTokenFactory: () => "owner-b",
    setIntervalFn: createSetIntervalFn(),
    clearIntervalFn: () => {},
    run: async () => {
      runs.push("b");
    },
  });

  assert.deepEqual(runnerA.start(), { started: true, intervalMs: 1000 });
  assert.deepEqual(runnerB.start(), { started: true, intervalMs: 1000 });

  await Promise.all([callbacks[0](), callbacks[1]()]);

  assert.deepEqual(runs, ["a"]);
  assert.equal(leaseService.calls.acquire.length, 2);
  assert.equal(leaseService.calls.acquire[0].ownerToken, "owner-a");
  assert.equal(leaseService.calls.acquire[1].ownerToken, "owner-b");
  assert.equal(loggerB.warnMessages[0][0].reason, "active");

  await Promise.all([runnerA.stop(), runnerB.stop()]);
});

test("runner renews long work before release", async () => {
  const leaseService = createLeaseService();
  const logger = createLogger();
  const renewalTimers = [];
  let intervalCallback;
  const runDeferred = createDeferred();

  const runner = createSchedulerLeaseRunner({
    jobKey: "waitlist-expiration",
    intervalMs: 5000,
    leaseTtlMs: 6000,
    logger,
    leaseService,
    leaseModel: leaseService.leaseModel,
    ownerTokenFactory: () => "owner-renew",
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return {};
    },
    clearIntervalFn: () => {},
    setTimeoutFn: (callback) => {
      renewalTimers.push(callback);
      return { id: renewalTimers.length };
    },
    clearTimeoutFn: () => {},
    run: async () => runDeferred.promise,
  });

  runner.start();
  const tickPromise = intervalCallback();

  await Promise.resolve();
  assert.equal(renewalTimers.length, 1);
  await renewalTimers[0]();
  assert.deepEqual(leaseService.calls.renew[0], {
    jobKey: "waitlist-expiration",
    ownerToken: "owner-renew",
    fencingToken: 1,
    ttlMs: 6000,
  });

  runDeferred.resolve();
  await tickPromise;

  assert.deepEqual(leaseService.calls.release[0], {
    jobKey: "waitlist-expiration",
    ownerToken: "owner-renew",
    fencingToken: 1,
  });
  assert.equal(logger.errorMessages.length, 0);

  await runner.stop();
});

test("runner passes lease context helpers and fences stale transaction writes", async () => {
  const leaseService = createLeaseService();
  let intervalCallback;
  const contexts = [];
  const phases = [];

  const runner = createSchedulerLeaseRunner({
    jobKey: "booking-reminders",
    intervalMs: 1000,
    leaseService,
    leaseModel: leaseService.leaseModel,
    logger: createLogger(),
    ownerTokenFactory: () => "owner-context",
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return {};
    },
    clearIntervalFn: () => {},
    now: () => new Date(500),
    run: async (context) => {
      contexts.push(context);
      await context.assertOwned();
      const writeResult = await context.withFencedWrite(({ session, writeSequence, afterCommit }) => {
        phases.push(["write", session.jobKey, writeSequence]);
        afterCommit(() => {
          phases.push(["afterCommit", writeSequence]);
        });
        return writeSequence;
      });
      assert.equal(writeResult, 1);
      leaseService.state.set("booking-reminders", {
        jobKey: "booking-reminders",
        ownerToken: "owner-takeover",
        fencingToken: 2,
        leaseExpiresAt: new Date(1500),
        writeSequence: 1,
        active: true,
      });
      await assert.rejects(context.withFencedWrite(async () => "stale"), (error) => {
        assert.equal(error?.code, "scheduler_lease_lost");
        return true;
      });
      await assert.rejects(context.assertOwned(), (error) => {
        assert.equal(error?.code, "scheduler_lease_lost");
        return true;
      });
      assert.equal(context.signal.aborted, true);
    },
  });

  runner.start();
  await intervalCallback();

  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].jobKey, "booking-reminders");
  assert.equal(contexts[0].ownerToken, "owner-context");
  assert.equal(contexts[0].fencingToken, 1);
  assert.equal(typeof contexts[0].withFencedWrite, "function");
  assert.equal(leaseService.calls.ownershipChecks.length >= 1, true);
  assert.equal(leaseService.calls.withFencedWrite.length, 2);
  assert.deepEqual(phases, [
    ["write", "booking-reminders", 1],
    ["afterCommit", 1],
  ]);
  assert.deepEqual(
    {
      jobKey: leaseService.calls.ownershipChecks[0].jobKey,
      ownerToken: leaseService.calls.ownershipChecks[0].ownerToken,
      fencingToken: leaseService.calls.ownershipChecks[0].fencingToken,
      hasExpiryCheck: leaseService.calls.ownershipChecks[0].leaseExpiresAt.$gt instanceof Date,
    },
    {
      jobKey: "booking-reminders",
      ownerToken: "owner-context",
      fencingToken: 1,
      hasExpiryCheck: true,
    }
  );

  await runner.stop();
});

test("runner skips overlapping local ticks", async () => {
  const leaseService = createLeaseService();
  const logger = createLogger();
  let intervalCallback;
  const runDeferred = createDeferred();
  let runCount = 0;

  const runner = createSchedulerLeaseRunner({
    jobKey: "subscription-expiration",
    intervalMs: 1000,
    logger,
    leaseService,
    leaseModel: leaseService.leaseModel,
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return {};
    },
    clearIntervalFn: () => {},
    run: async () => {
      runCount += 1;
      await runDeferred.promise;
    },
  });

  runner.start();

  const firstTick = intervalCallback();
  await intervalCallback();

  assert.equal(runCount, 1);
  assert.equal(leaseService.calls.acquire.length, 1);
  assert.equal(logger.warnMessages[0][0].event, "scheduler_lease_runner.overlap_skipped");

  runDeferred.resolve();
  await firstTick;
  await runner.stop();
});

test("runner fail-closes on acquisition and renewal failures and logs release failures", async () => {
  let intervalCallback;
  const runDeferred = createDeferred();
  const logger = createLogger();
  let capturedContext;
  const leaseService = {
    acquireCalls: 0,
    renewCalls: 0,
    releaseCalls: 0,
    async acquire() {
      this.acquireCalls += 1;
      if (this.acquireCalls === 1) {
        return { acquired: false, lease: null, reason: "storage_error" };
      }

      return {
        acquired: true,
        lease: {
          jobKey: "booking-reminders",
          ownerToken: "owner-fail",
          fencingToken: 2,
          leaseExpiresAt: new Date(Date.now() + 6000),
        },
      };
    },
    async renew() {
      this.renewCalls += 1;
      return { renewed: false, lease: null, reason: "storage_error" };
    },
    async release() {
      this.releaseCalls += 1;
      return { released: false, reason: "not_owner" };
    },
    async withFencedWrite() {
      throw new Error("withFencedWrite should not run");
    },
  };
  const renewalTimers = [];

  const runner = createSchedulerLeaseRunner({
    jobKey: "booking-reminders",
    intervalMs: 1000,
    leaseTtlMs: 6000,
    logger,
    leaseService,
    leaseModel: createStaticLeaseModel(),
    ownerTokenFactory: () => "owner-fail",
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return {};
    },
    clearIntervalFn: () => {},
    setTimeoutFn: (callback) => {
      renewalTimers.push(callback);
      return {};
    },
    clearTimeoutFn: () => {},
    run: async (context) => {
      capturedContext = context;
      await runDeferred.promise;
    },
  });

  runner.start();

  await intervalCallback();
  assert.equal(logger.warnMessages[0][0].reason, "storage_error");

  const secondTick = intervalCallback();
  await Promise.resolve();
  await renewalTimers[0]();
  assert.equal(capturedContext.signal.aborted, true);
  await assert.rejects(capturedContext.assertOwned(), (error) => {
    assert.equal(error?.code, "scheduler_lease_lost");
    assert.equal(error?.reason, "storage_error");
    return true;
  });
  runDeferred.resolve();
  await secondTick;

  assert.equal(leaseService.renewCalls, 1);
  assert.equal(leaseService.releaseCalls, 1);
  assert.equal(logger.warnMessages.at(-2)[0].event, "scheduler_lease_runner.renew_skipped");
  assert.equal(logger.warnMessages.at(-1)[0].event, "scheduler_lease_runner.release_skipped");

  await runner.stop();
});

test("runner fail-closes on malformed acquisition results", async () => {
  let intervalCallback;
  let runCount = 0;
  const logger = createLogger();
  const malformedResults = [undefined, null, "bad", {}, { acquired: true }, { acquired: true, lease: {} }];
  const leaseService = {
    acquireCalls: 0,
    async acquire() {
      const result = malformedResults[this.acquireCalls];
      this.acquireCalls += 1;
      return result;
    },
    async renew() {
      throw new Error("renew should not run");
    },
    async release() {
      throw new Error("release should not run");
    },
    async withFencedWrite() {
      throw new Error("withFencedWrite should not run");
    },
  };

  const runner = createSchedulerLeaseRunner({
    jobKey: "booking-reminders",
    intervalMs: 1000,
    logger,
    leaseService,
    leaseModel: createStaticLeaseModel(),
    ownerTokenFactory: () => "owner-safe",
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return {};
    },
    clearIntervalFn: () => {},
    run: async () => {
      runCount += 1;
    },
  });

  runner.start();

  for (let index = 0; index < malformedResults.length; index += 1) {
    await assert.doesNotReject(intervalCallback());
  }

  assert.equal(runCount, 0);
  assert.equal(logger.errorMessages.length, malformedResults.length);
  assert.equal(
    logger.errorMessages.every(([entry]) => entry.event === "scheduler_lease_runner.acquire_invalid"),
    true
  );

  await runner.stop();
});

test("runner aborts signal and fails subsequent assertions after malformed renewal", async () => {
  const logger = createLogger();
  const renewalTimers = [];
  let intervalCallback;
  let capturedContext;
  const runDeferred = createDeferred();
  const leaseService = {
    async acquire() {
      return {
        acquired: true,
        lease: {
          jobKey: "booking-reminders",
          ownerToken: "owner-renew-invalid",
          fencingToken: 3,
          leaseExpiresAt: new Date(Date.now() + 6000),
        },
      };
    },
    async renew() {
      return {
        renewed: true,
        lease: {
          jobKey: "booking-reminders",
          ownerToken: "owner-renew-invalid",
          fencingToken: 3,
          leaseExpiresAt: new Date(Date.now() - 1),
        },
      };
    },
    async release() {
      return { released: false, reason: "not_owner" };
    },
    async withFencedWrite() {
      throw new Error("withFencedWrite should not run");
    },
  };

  const runner = createSchedulerLeaseRunner({
    jobKey: "booking-reminders",
    intervalMs: 1000,
    leaseTtlMs: 6000,
    logger,
    leaseService,
    leaseModel: createStaticLeaseModel(),
    ownerTokenFactory: () => "owner-renew-invalid",
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return {};
    },
    clearIntervalFn: () => {},
    setTimeoutFn: (callback) => {
      renewalTimers.push(callback);
      return {};
    },
    clearTimeoutFn: () => {},
    run: async (context) => {
      capturedContext = context;
      await runDeferred.promise;
    },
  });

  runner.start();
  const tickPromise = intervalCallback();

  await Promise.resolve();
  await renewalTimers[0]();
  assert.equal(capturedContext.signal.aborted, true);
  await assert.rejects(capturedContext.assertOwned(), (error) => {
    assert.equal(error?.code, "scheduler_lease_lost");
    assert.equal(error?.reason, "invalid_lease");
    return true;
  });

  runDeferred.resolve();
  await tickPromise;

  assert.equal(
    logger.errorMessages.some(
      ([entry]) =>
        entry?.event === "scheduler_lease_runner.renew_invalid" &&
        entry?.reason === "invalid_lease"
    ),
    true
  );

  await runner.stop();
});

test("stop waits for in-flight work and remains idempotent", async () => {
  const leaseService = createLeaseService();
  const logger = createLogger();
  let intervalCallback;
  let clearedIntervals = 0;
  const runDeferred = createDeferred();

  const runner = createSchedulerLeaseRunner({
    jobKey: "subscription-expiration",
    intervalMs: 1500,
    logger,
    leaseService,
    leaseModel: leaseService.leaseModel,
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return { id: 1 };
    },
    clearIntervalFn: () => {
      clearedIntervals += 1;
    },
    run: async () => runDeferred.promise,
  });

  runner.start();
  const tickPromise = intervalCallback();
  const stopPromise = runner.stop();

  let settled = false;
  void stopPromise.then(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(clearedIntervals, 1);

  runDeferred.resolve();
  await tickPromise;

  assert.deepEqual(await stopPromise, { stopped: true });
  assert.deepEqual(await runner.stop(), { stopped: false });
});
