import assert from "node:assert/strict";
import { test } from "node:test";

import { createCronLeaseRunner } from "./cronLeaseRunner.js";

const createLogger = () => ({
  warnMessages: [],
  errorMessages: [],
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

const createLeaseService = () => {
  const state = new Map();
  const calls = { acquire: [], renew: [], release: [] };

  return {
    calls,
    async acquire({ jobKey, ownerToken, ttlMs }) {
      calls.acquire.push({ jobKey, ownerToken, ttlMs });
      const current = state.get(jobKey);
      if (current?.active) {
        return { acquired: false, lease: null, reason: "active" };
      }

      const fencingToken = (current?.fencingToken ?? 0) + 1;
      const lease = { jobKey, ownerToken, fencingToken, leaseExpiresAt: new Date(ttlMs) };
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

      const lease = { ...current, leaseExpiresAt: new Date(ttlMs) };
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
  };
};

const createScheduleFn = (callbacks) => (expression, callback) => {
  callbacks.push({ expression, callback });
  return {
    expression,
    start() {},
    stop() {},
    getStatus() {
      return "scheduled";
    },
  };
};

const createTaskScheduleFn = (callbacks, createTask) => (expression, callback) => {
  callbacks.push({ expression, callback });
  return createTask();
};

test("competing cron runners execute under one lease owner at a time", async () => {
  const leaseService = createLeaseService();
  const callbacks = [];
  const runs = [];
  const runnerA = createCronLeaseRunner({
    jobKey: "cleanup-non-working-days",
    expression: "0 0 * * *",
    ownerTokenFactory: () => "owner-a",
    leaseService,
    logger: createLogger(),
    scheduleFn: createScheduleFn(callbacks),
    run: async () => {
      runs.push("a");
    },
  });
  const loggerB = createLogger();
  const runnerB = createCronLeaseRunner({
    jobKey: "cleanup-non-working-days",
    expression: "0 0 * * *",
    ownerTokenFactory: () => "owner-b",
    leaseService,
    logger: loggerB,
    scheduleFn: createScheduleFn(callbacks),
    run: async () => {
      runs.push("b");
    },
  });

  const handleA = runnerA.start();
  const handleB = runnerB.start();

  await Promise.all([runnerA.runTick(), runnerB.runTick()]);

  assert.deepEqual(runs, ["a"]);
  assert.equal(leaseService.calls.acquire.length, 2);
  assert.equal(leaseService.calls.acquire[0].ownerToken, "owner-a");
  assert.equal(leaseService.calls.acquire[1].ownerToken, "owner-b");
  assert.equal(loggerB.warnMessages[0][0].event, "cron_lease_runner.acquire_skipped");

  await Promise.all([handleA.stop(), handleB.stop()]);
});

test("cron runner renews long jobs before release", async () => {
  const leaseService = createLeaseService();
  const callbacks = [];
  const renewalTimers = [];
  const runDeferred = createDeferred();
  const runner = createCronLeaseRunner({
    jobKey: "event-reminders",
    expression: "*/10 * * * *",
    leaseTtlMs: 6000,
    ownerTokenFactory: () => "owner-renew",
    leaseService,
    logger: createLogger(),
    scheduleFn: createScheduleFn(callbacks),
    setTimeoutFn: (callback) => {
      renewalTimers.push(callback);
      return {};
    },
    clearTimeoutFn: () => {},
    run: async () => runDeferred.promise,
  });

  const handle = runner.start();
  const tickPromise = runner.runTick();

  await Promise.resolve();
  await renewalTimers[0]();
  assert.deepEqual(leaseService.calls.renew[0], {
    jobKey: "event-reminders",
    ownerToken: "owner-renew",
    fencingToken: 1,
    ttlMs: 6000,
  });

  runDeferred.resolve();
  await tickPromise;

  assert.deepEqual(leaseService.calls.release[0], {
    jobKey: "event-reminders",
    ownerToken: "owner-renew",
    fencingToken: 1,
  });

  await handle.stop();
});

test("cron runner prevents same-process overlap", async () => {
  const leaseService = createLeaseService();
  const callbacks = [];
  const logger = createLogger();
  const runDeferred = createDeferred();
  let runCount = 0;
  const runner = createCronLeaseRunner({
    jobKey: "expire-pending-bookings",
    expression: "*/5 * * * *",
    leaseService,
    logger,
    scheduleFn: createScheduleFn(callbacks),
    run: async () => {
      runCount += 1;
      await runDeferred.promise;
    },
  });

  const handle = runner.start();
  const firstTick = runner.runTick();
  await runner.runTick();

  assert.equal(runCount, 1);
  assert.equal(leaseService.calls.acquire.length, 1);
  assert.equal(logger.warnMessages[0][0].event, "cron_lease_runner.overlap_skipped");

  runDeferred.resolve();
  await firstTick;
  await handle.stop();
});

test("cron runner fail-closes on failures and malformed acquisition results", async () => {
  const callbacks = [];
  const renewalTimers = [];
  const runDeferred = createDeferred();
  const logger = createLogger();
  let runCount = 0;
  const malformedResults = [undefined, null, "bad", {}, { acquired: true }, { acquired: true, lease: {} }];
  const leaseService = {
    acquireCalls: 0,
    renewCalls: 0,
    releaseCalls: 0,
    async acquire() {
      this.acquireCalls += 1;
      if (this.acquireCalls <= malformedResults.length) {
        return malformedResults[this.acquireCalls - 1];
      }
      if (this.acquireCalls === malformedResults.length + 1) {
        return { acquired: false, lease: null, reason: "storage_error" };
      }

      return {
        acquired: true,
        lease: {
          jobKey: "cleanup-non-working-days",
          ownerToken: "owner-safe",
          fencingToken: 2,
          leaseExpiresAt: new Date(),
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
  };

  const runner = createCronLeaseRunner({
    jobKey: "cleanup-non-working-days",
    expression: "0 0 * * *",
    leaseTtlMs: 6000,
    ownerTokenFactory: () => "owner-safe",
    leaseService,
    logger,
    scheduleFn: createScheduleFn(callbacks),
    setTimeoutFn: (callback) => {
      renewalTimers.push(callback);
      return {};
    },
    clearTimeoutFn: () => {},
    run: async () => {
      runCount += 1;
      await runDeferred.promise;
    },
  });

  const handle = runner.start();

  for (let index = 0; index < malformedResults.length; index += 1) {
    await assert.doesNotReject(async () => runner.runTick());
  }

  await runner.runTick();
  const validTick = runner.runTick();
  await Promise.resolve();
  await renewalTimers[0]();
  runDeferred.resolve();
  await validTick;

  assert.equal(runCount, 1);
  assert.equal(logger.errorMessages.length, malformedResults.length);
  assert.equal(
    logger.errorMessages.every(([entry]) => entry.event === "cron_lease_runner.acquire_invalid"),
    true
  );
  assert.equal(logger.warnMessages.at(-2)[0].event, "cron_lease_runner.renew_skipped");
  assert.equal(logger.warnMessages.at(-1)[0].event, "cron_lease_runner.release_skipped");
  assert.equal(leaseService.renewCalls, 1);
  assert.equal(leaseService.releaseCalls, 1);

  await handle.stop();
});

test("cron runner stop awaits async task stop, shares the promise, and restart uses a new handle", async () => {
  const leaseService = createLeaseService();
  const callbacks = [];
  const runDeferred = createDeferred();
  const stopDeferred = createDeferred();
  const runner = createCronLeaseRunner({
    jobKey: "event-reminders",
    expression: "*/10 * * * *",
    leaseService,
    logger: createLogger(),
    scheduleFn: createTaskScheduleFn(callbacks, () => ({
      stop: async () => stopDeferred.promise,
    })),
    run: async () => runDeferred.promise,
  });

  const firstHandle = runner.start();
  const tickPromise = runner.runTick();
  const stopPromise = firstHandle.stop();

  assert.equal(firstHandle.stop(), stopPromise);

  let settled = false;
  void stopPromise.then(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);

  stopDeferred.resolve();
  runDeferred.resolve();
  await tickPromise;

  assert.deepEqual(await stopPromise, { stopped: true });
  assert.deepEqual(await firstHandle.stop(), { stopped: false });

  const secondHandle = createCronLeaseRunner({
    jobKey: "event-reminders",
    expression: "*/10 * * * *",
    leaseService,
    logger: createLogger(),
    scheduleFn: createScheduleFn(callbacks),
    run: async () => {},
  }).start();

  assert.notEqual(secondHandle, firstHandle);
  await secondHandle.stop();
});

test("cron runner stop catches async task stop rejection, finishes cleanup, and shares rejection", async () => {
  const leaseService = createLeaseService();
  const callbacks = [];
  const logger = createLogger();
  const runDeferred = createDeferred();
  const stopDeferred = createDeferred();
  const cleanupOrder = [];
  const stopError = new Error("cron stop failed");
  const unhandledRejections = [];
  const onUnhandledRejection = (error) => {
    unhandledRejections.push(error);
  };

  const runner = createCronLeaseRunner({
    jobKey: "event-reminders",
    expression: "*/10 * * * *",
    leaseService: {
      ...leaseService,
      async release(args) {
        cleanupOrder.push("release");
        return leaseService.release(args);
      },
    },
    logger,
    scheduleFn: createTaskScheduleFn(callbacks, () => ({
      stop: async () => stopDeferred.promise,
    })),
    run: async () => {
      cleanupOrder.push("run-start");
      await runDeferred.promise;
      cleanupOrder.push("run-finish");
    },
  });

  process.on("unhandledRejection", onUnhandledRejection);

  try {
    const handle = runner.start();
    const tickPromise = runner.runTick();
    const firstStopPromise = handle.stop();
    const secondStopPromise = handle.stop();
    const stopAssertion = assert.rejects(firstStopPromise, stopError);

    assert.equal(firstStopPromise, secondStopPromise);

    stopDeferred.reject(stopError);
    runDeferred.resolve();

    await tickPromise;
    await stopAssertion;
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(cleanupOrder, ["run-start", "run-finish", "release"]);
    assert.deepEqual(unhandledRejections, []);
    assert.equal(
      logger.errorMessages.some(
        ([entry, message]) =>
          entry?.event === "cron_lease_runner.stop_failed" &&
          entry?.reason === "unknown_error" &&
          message === "Cron task stop failed"
      ),
      true
    );
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
  }
});
