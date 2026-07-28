import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";

import {
  startWaitlistExpirationScheduler,
  stopWaitlistExpirationScheduler,
} from "./waitlistExpirationScheduler.js";

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

afterEach(async () => {
  await stopWaitlistExpirationScheduler();
});

test("scheduler does not start when env is disabled", () => {
  let runnerCreated = false;

  const result = startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "false" },
    logger: createLogger(),
    createRunner: () => {
      runnerCreated = true;
      return {};
    },
  });

  assert.deepEqual(result, { started: false, reason: "disabled" });
  assert.equal(runnerCreated, false);
});

test("scheduler starts with deterministic lease key and safe interval default", () => {
  let runnerConfig = null;

  const result = startWaitlistExpirationScheduler({
    env: {
      ENABLE_WAITLIST_EXPIRATION: "true",
      WAITLIST_EXPIRATION_INTERVAL_MS: "not-a-number",
    },
    logger: createLogger(),
    createRunner: (config) => {
      runnerConfig = config;
      return {
        start: () => ({ started: true, intervalMs: config.intervalMs }),
        stop: async () => ({ stopped: true }),
      };
    },
  });

  assert.deepEqual(result, { started: true, intervalMs: 3600000 });
  assert.equal(runnerConfig.jobKey, "waitlist-expiration");
  assert.equal(runnerConfig.intervalMs, 3600000);
});

test("scheduler forwards lease context to expiration service", async () => {
  const leaseContext = { withFencedWrite: async () => null };
  let receivedContext = null;
  let capturedRun;

  startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "true" },
    logger: createLogger(),
    expireEntries: async ({ leaseContext: context }) => {
      receivedContext = context;
      return [];
    },
    createRunner: ({ run, intervalMs }) => {
      capturedRun = run;
      return {
        start: () => ({ started: true, intervalMs }),
        stop: async () => ({ stopped: true }),
      };
    },
  });

  await capturedRun(leaseContext);

  assert.equal(receivedContext, leaseContext);
});

test("multiple starts do not create duplicate schedulers", () => {
  let startCalls = 0;

  const firstResult = startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "true" },
    logger: createLogger(),
    createRunner: () => ({
      start: () => {
        startCalls += 1;
        return { started: true, intervalMs: 3600000 };
      },
      stop: async () => ({ stopped: true }),
    }),
  });

  const secondResult = startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "true" },
    logger: createLogger(),
    createRunner: () => ({
      start: () => ({ started: true, intervalMs: 3600000 }),
      stop: async () => ({ stopped: true }),
    }),
  });

  assert.deepEqual(firstResult, { started: true, intervalMs: 3600000 });
  assert.deepEqual(secondResult, { started: false, reason: "already_started" });
  assert.equal(startCalls, 1);
});

test("concurrent stop shares shutdown, blocks restart, and allows restart after completion", async () => {
  const stopCalls = [];
  const stopDeferred = createDeferred();

  startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "true" },
    logger: createLogger(),
    createRunner: () => ({
      start: () => ({ started: true, intervalMs: 3600000 }),
      stop: async () => {
        stopCalls.push("stop");
        await stopDeferred.promise;
        return { stopped: true };
      },
    }),
  });

  const firstStopPromise = stopWaitlistExpirationScheduler();
  const secondStopPromise = stopWaitlistExpirationScheduler();

  assert.equal(firstStopPromise, secondStopPromise);
  assert.deepEqual(
    startWaitlistExpirationScheduler({
      env: { ENABLE_WAITLIST_EXPIRATION: "true" },
      logger: createLogger(),
      createRunner: () => ({
        start: () => ({ started: true, intervalMs: 3600000 }),
        stop: async () => ({ stopped: true }),
      }),
    }),
    { started: false, reason: "already_started" }
  );

  stopDeferred.resolve();
  assert.deepEqual(await firstStopPromise, { stopped: true });
  assert.deepEqual(await stopWaitlistExpirationScheduler(), { stopped: false });

  const restartResult = startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "true" },
    logger: createLogger(),
    createRunner: () => ({
      start: () => ({ started: true, intervalMs: 3600000 }),
      stop: async () => ({ stopped: true }),
    }),
  });

  assert.deepEqual(restartResult, { started: true, intervalMs: 3600000 });
  assert.deepEqual(stopCalls, ["stop"]);
});

test("server still starts scheduler flow and has no legacy waitlist cron", async () => {
  const serverSource = await readFile(new URL("../../server.js", import.meta.url), "utf8");

  assert.equal(serverSource.includes("startBookingReminderScheduler"), true);
  assert.equal(serverSource.includes("startWaitlistExpirationScheduler"), true);
  assert.equal(serverSource.includes("cron/waitlist"), false);
});
