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

afterEach(() => {
  stopSubscriptionExpirationScheduler();
});

test("subscription expiration cron is disabled by default", () => {
  let intervalStarted = false;

  const result = startSubscriptionExpirationScheduler({
    env: {},
    logger: createLogger(),
    setIntervalFn: () => {
      intervalStarted = true;
      return {};
    },
  });

  assert.deepEqual(result, { started: false, reason: "disabled" });
  assert.equal(intervalStarted, false);
});

test("subscription expiration cron starts when env flag is enabled", () => {
  const logger = createLogger();
  let receivedIntervalMs = null;
  let unrefCalled = false;

  const result = startSubscriptionExpirationScheduler({
    env: {
      ENABLE_SUBSCRIPTION_EXPIRATION_CRON: "true",
      SUBSCRIPTION_EXPIRATION_INTERVAL_MS: "2500",
    },
    logger,
    setIntervalFn: (_callback, intervalMs) => {
      receivedIntervalMs = intervalMs;
      return {
        unref() {
          unrefCalled = true;
        },
      };
    },
    clearIntervalFn: () => {},
  });

  assert.deepEqual(result, { started: true, intervalMs: 2500 });
  assert.equal(receivedIntervalMs, 2500);
  assert.equal(unrefCalled, true);
  assert.equal(logger.infoMessages.length, 1);
});

test("subscription expiration cron calls expireSubscriptions and logs summary", async () => {
  const logger = createLogger();
  let intervalCallback = null;
  let expireCalls = 0;

  startSubscriptionExpirationScheduler({
    env: { ENABLE_SUBSCRIPTION_EXPIRATION_CRON: "true" },
    logger,
    expireFn: async () => {
      expireCalls++;
      return { expiredCount: 2, errorsCount: 0 };
    },
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return {};
    },
    clearIntervalFn: () => {},
  });

  await intervalCallback();

  assert.equal(expireCalls, 1);
  assert.deepEqual(logger.infoMessages.at(-1), [
    "Subscription expiration summary",
    { expiredCount: 2, errorsCount: 0 },
  ]);
});
