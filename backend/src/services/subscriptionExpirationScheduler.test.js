import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  startSubscriptionExpirationScheduler,
  stopSubscriptionExpirationScheduler,
} from "./subscriptionExpirationScheduler.js";

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
  await stopSubscriptionExpirationScheduler();
});

test("subscription expiration cron is disabled by default", () => {
  let runnerCreated = false;

  const result = startSubscriptionExpirationScheduler({
    env: {},
    logger: createLogger(),
    createRunner: () => {
      runnerCreated = true;
      return {};
    },
  });

  assert.deepEqual(result, { started: false, reason: "disabled" });
  assert.equal(runnerCreated, false);
});

test("subscription expiration cron starts with deterministic lease key", () => {
  let runnerConfig = null;

  const result = startSubscriptionExpirationScheduler({
    env: {
      ENABLE_SUBSCRIPTION_EXPIRATION_CRON: "true",
      SUBSCRIPTION_EXPIRATION_INTERVAL_MS: "2500",
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

  assert.deepEqual(result, { started: true, intervalMs: 2500 });
  assert.equal(runnerConfig.jobKey, "subscription-expiration");
  assert.equal(runnerConfig.intervalMs, 2500);
});

test("subscription expiration cron logs summary through the leased runner", async () => {
  const logger = createLogger();
  let capturedRun;

  startSubscriptionExpirationScheduler({
    env: { ENABLE_SUBSCRIPTION_EXPIRATION_CRON: "true" },
    logger,
    expireFn: async () => ({ expiredCount: 2, errorsCount: 0 }),
    createRunner: ({ run, intervalMs }) => {
      capturedRun = run;
      return {
        start: () => ({ started: true, intervalMs }),
        stop: async () => ({ stopped: true }),
      };
    },
  });

  await capturedRun();

  assert.deepEqual(logger.infoMessages.at(-1), [
    "Subscription expiration summary",
    { expiredCount: 2, errorsCount: 0 },
  ]);
});

test("subscription expiration cron preserves legacy error logging", async () => {
  const logger = createLogger();
  const error = new Error("expire failed");
  let capturedRun;

  startSubscriptionExpirationScheduler({
    env: { ENABLE_SUBSCRIPTION_EXPIRATION_CRON: "true" },
    logger,
    expireFn: async () => {
      throw error;
    },
    createRunner: ({ run, intervalMs }) => {
      capturedRun = run;
      return {
        start: () => ({ started: true, intervalMs }),
        stop: async () => ({ stopped: true }),
      };
    },
  });

  await capturedRun();

  assert.deepEqual(logger.errorMessages.at(-1), [
    "Subscription expiration scheduler error:",
    error,
  ]);
});

test("concurrent stop shares shutdown, blocks restart, and allows restart after completion", async () => {
  const stopDeferred = createDeferred();
  const firstResult = startSubscriptionExpirationScheduler({
    env: { ENABLE_SUBSCRIPTION_EXPIRATION_CRON: "true" },
    logger: createLogger(),
    createRunner: () => ({
      start: () => ({ started: true, intervalMs: 86400000 }),
      stop: async () => {
        await stopDeferred.promise;
        return { stopped: true };
      },
    }),
  });

  const secondResult = startSubscriptionExpirationScheduler({
    env: { ENABLE_SUBSCRIPTION_EXPIRATION_CRON: "true" },
    logger: createLogger(),
    createRunner: () => ({
      start: () => ({ started: true, intervalMs: 86400000 }),
      stop: async () => ({ stopped: true }),
    }),
  });

  assert.deepEqual(firstResult, { started: true, intervalMs: 86400000 });
  assert.deepEqual(secondResult, { started: false, reason: "already_started" });
  const firstStopPromise = stopSubscriptionExpirationScheduler();
  const secondStopPromise = stopSubscriptionExpirationScheduler();

  assert.equal(firstStopPromise, secondStopPromise);
  assert.deepEqual(
    startSubscriptionExpirationScheduler({
      env: { ENABLE_SUBSCRIPTION_EXPIRATION_CRON: "true" },
      logger: createLogger(),
      createRunner: () => ({
        start: () => ({ started: true, intervalMs: 86400000 }),
        stop: async () => ({ stopped: true }),
      }),
    }),
    { started: false, reason: "already_started" }
  );

  stopDeferred.resolve();
  assert.deepEqual(await firstStopPromise, { stopped: true });
  assert.deepEqual(await stopSubscriptionExpirationScheduler(), { stopped: false });

  const restartResult = startSubscriptionExpirationScheduler({
    env: { ENABLE_SUBSCRIPTION_EXPIRATION_CRON: "true" },
    logger: createLogger(),
    createRunner: () => ({
      start: () => ({ started: true, intervalMs: 86400000 }),
      stop: async () => ({ stopped: true }),
    }),
  });

  assert.deepEqual(restartResult, { started: true, intervalMs: 86400000 });
});
