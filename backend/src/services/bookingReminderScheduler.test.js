import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";

import {
  startBookingReminderScheduler,
  stopBookingReminderScheduler,
} from "./bookingReminderScheduler.js";

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
  stopBookingReminderScheduler();
});

test("scheduler does not start when env is disabled", () => {
  let intervalStarted = false;

  const result = startBookingReminderScheduler({
    env: { ENABLE_BOOKING_REMINDERS: "false" },
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

  const result = startBookingReminderScheduler({
    env: {
      ENABLE_BOOKING_REMINDERS: "true",
      BOOKING_REMINDER_INTERVAL_MS: "2500",
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

test("multiple starts do not create duplicate intervals", () => {
  let intervalStarts = 0;

  const firstResult = startBookingReminderScheduler({
    env: { ENABLE_BOOKING_REMINDERS: "true" },
    logger: createLogger(),
    setIntervalFn: () => {
      intervalStarts++;
      return {};
    },
    clearIntervalFn: () => {},
  });

  const secondResult = startBookingReminderScheduler({
    env: { ENABLE_BOOKING_REMINDERS: "true" },
    logger: createLogger(),
    setIntervalFn: () => {
      intervalStarts++;
      return {};
    },
    clearIntervalFn: () => {},
  });

  assert.deepEqual(firstResult, { started: true, intervalMs: 60000 });
  assert.deepEqual(secondResult, { started: false, reason: "already_started" });
  assert.equal(intervalStarts, 1);
});

test("scheduler skips overlapping runs", async () => {
  const logger = createLogger();
  let intervalCallback;
  let runCount = 0;
  let finishRun;
  const runStarted = new Promise((resolve) => {
    finishRun = resolve;
  });

  startBookingReminderScheduler({
    env: { ENABLE_BOOKING_REMINDERS: "true" },
    logger,
    runReminders: async () => {
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

test("scheduler catches errors without throwing", async () => {
  const logger = createLogger();
  let intervalCallback;

  startBookingReminderScheduler({
    env: { ENABLE_BOOKING_REMINDERS: "true" },
    logger,
    runReminders: async () => {
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

test("stop function clears the active interval", () => {
  const intervalId = {};
  let clearedInterval = null;

  startBookingReminderScheduler({
    env: { ENABLE_BOOKING_REMINDERS: "true" },
    logger: createLogger(),
    setIntervalFn: () => intervalId,
    clearIntervalFn: (id) => {
      clearedInterval = id;
    },
  });

  const result = stopBookingReminderScheduler();

  assert.deepEqual(result, { stopped: true });
  assert.equal(clearedInterval, intervalId);
  assert.deepEqual(stopBookingReminderScheduler(), { stopped: false });
});

test("stop while run is in flight does not allow overlapping run after restart", async () => {
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

  startBookingReminderScheduler({
    env: { ENABLE_BOOKING_REMINDERS: "true" },
    logger,
    runReminders: async () => {
      runCount++;
      await inFlightRun;
    },
    setIntervalFn,
    clearIntervalFn: () => {},
  });

  const firstRun = intervalCallbacks[0]();

  assert.equal(stopBookingReminderScheduler().stopped, true);

  const restartResult = startBookingReminderScheduler({
    env: { ENABLE_BOOKING_REMINDERS: "true" },
    logger,
    runReminders: async () => {
      runCount++;
    },
    setIntervalFn,
    clearIntervalFn: () => {},
  });

  assert.deepEqual(restartResult, { started: true, intervalMs: 60000 });

  await intervalCallbacks[1]();

  assert.equal(runCount, 1);
  assert.equal(logger.warnMessages.length, 1);

  finishRun();
  await firstRun;

  await intervalCallbacks[1]();

  assert.equal(runCount, 2);
});

test("server still does not import the legacy booking reminder cron", async () => {
  const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");

  assert.equal(serverSource.includes('import("../cron/bookingReminders.js")'), false);
  assert.equal(serverSource.includes("cron/bookingReminders"), false);
});
