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

afterEach(() => {
  stopWaitlistExpirationScheduler();
});

test("scheduler does not start when env is disabled", () => {
  let intervalStarted = false;

  const result = startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "false" },
    logger: createLogger(),
    setIntervalFn: () => {
      intervalStarted = true;
      return {};
    },
  });

  assert.deepEqual(result, { started: false, reason: "disabled" });
  assert.equal(intervalStarted, false);
});

test("scheduler starts when env is enabled", () => {
  const logger = createLogger();
  let receivedIntervalMs = null;
  let unrefCalled = false;

  const result = startWaitlistExpirationScheduler({
    env: {
      ENABLE_WAITLIST_EXPIRATION: "true",
      WAITLIST_EXPIRATION_INTERVAL_MS: "2500",
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

test("invalid or missing interval uses safe default", () => {
  const intervals = [];

  const setIntervalFn = (_callback, intervalMs) => {
    intervals.push(intervalMs);
    return {};
  };

  const invalidResult = startWaitlistExpirationScheduler({
    env: {
      ENABLE_WAITLIST_EXPIRATION: "true",
      WAITLIST_EXPIRATION_INTERVAL_MS: "not-a-number",
    },
    logger: createLogger(),
    setIntervalFn,
    clearIntervalFn: () => {},
  });

  assert.deepEqual(invalidResult, { started: true, intervalMs: 3600000 });
  assert.equal(stopWaitlistExpirationScheduler().stopped, true);

  const missingResult = startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "true" },
    logger: createLogger(),
    setIntervalFn,
    clearIntervalFn: () => {},
  });

  assert.deepEqual(missingResult, { started: true, intervalMs: 3600000 });
  assert.deepEqual(intervals, [3600000, 3600000]);
});

test("multiple starts do not create duplicate intervals", () => {
  let intervalStarts = 0;

  const firstResult = startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "true" },
    logger: createLogger(),
    setIntervalFn: () => {
      intervalStarts++;
      return {};
    },
    clearIntervalFn: () => {},
  });

  const secondResult = startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "true" },
    logger: createLogger(),
    setIntervalFn: () => {
      intervalStarts++;
      return {};
    },
    clearIntervalFn: () => {},
  });

  assert.deepEqual(firstResult, { started: true, intervalMs: 3600000 });
  assert.deepEqual(secondResult, { started: false, reason: "already_started" });
  assert.equal(intervalStarts, 1);
});

test("overlapping runs are skipped", async () => {
  const logger = createLogger();
  let intervalCallback;
  let runCount = 0;
  let finishRun;
  const runStarted = new Promise((resolve) => {
    finishRun = resolve;
  });

  startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "true" },
    logger,
    expireEntries: async () => {
      runCount++;
      await runStarted;
    },
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return {};
    },
    clearIntervalFn: () => {},
  });

  const firstRun = intervalCallback();
  const skippedRun = intervalCallback();

  await skippedRun;

  assert.equal(runCount, 1);
  assert.equal(logger.warnMessages.length, 1);

  finishRun();
  await firstRun;
});

test("stop clears interval", () => {
  const intervalId = {};
  let clearedInterval = null;

  startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "true" },
    logger: createLogger(),
    setIntervalFn: () => intervalId,
    clearIntervalFn: (id) => {
      clearedInterval = id;
    },
  });

  const result = stopWaitlistExpirationScheduler();

  assert.deepEqual(result, { stopped: true });
  assert.equal(clearedInterval, intervalId);
  assert.deepEqual(stopWaitlistExpirationScheduler(), { stopped: false });
});

test("stop while run is in-flight then start again does not allow overlapping run", async () => {
  const logger = createLogger();
  const intervalCallbacks = [];
  let runCount = 0;
  let finishRun;
  const inFlightRun = new Promise((resolve) => {
    finishRun = resolve;
  });

  const setIntervalFn = (callback) => {
    intervalCallbacks.push(callback);
    return { id: intervalCallbacks.length };
  };

  startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "true" },
    logger,
    expireEntries: async () => {
      runCount++;
      await inFlightRun;
    },
    setIntervalFn,
    clearIntervalFn: () => {},
  });

  const firstRun = intervalCallbacks[0]();

  assert.equal(stopWaitlistExpirationScheduler().stopped, true);

  const restartResult = startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "true" },
    logger,
    expireEntries: async () => {
      runCount++;
    },
    setIntervalFn,
    clearIntervalFn: () => {},
  });

  assert.deepEqual(restartResult, { started: true, intervalMs: 3600000 });

  await intervalCallbacks[1]();

  assert.equal(runCount, 1);
  assert.equal(logger.warnMessages.length, 1);

  finishRun();
  await firstRun;

  await intervalCallbacks[1]();

  assert.equal(runCount, 2);
});

test("errors are caught and do not crash", async () => {
  const logger = createLogger();
  let intervalCallback;

  startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "true" },
    logger,
    expireEntries: async () => {
      throw new Error("boom");
    },
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return {};
    },
    clearIntervalFn: () => {},
  });

  await assert.doesNotReject(() => intervalCallback());
  assert.equal(logger.errorMessages.length, 1);
});

test("expirePastWaitlistEntries is called on tick", async () => {
  let intervalCallback;
  let expireCalls = 0;

  startWaitlistExpirationScheduler({
    env: { ENABLE_WAITLIST_EXPIRATION: "true" },
    logger: createLogger(),
    expireEntries: async () => {
      expireCalls++;
    },
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return {};
    },
    clearIntervalFn: () => {},
  });

  await intervalCallback();

  assert.equal(expireCalls, 1);
});

test("server still starts the booking reminder scheduler and has no legacy waitlist cron", async () => {
  const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");

  assert.equal(serverSource.includes("startBookingReminderScheduler"), true);
  assert.equal(serverSource.includes("startWaitlistExpirationScheduler"), true);
  assert.equal(serverSource.includes("cron/waitlist"), false);
});
