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
  await stopBookingReminderScheduler();
});

test("scheduler does not start when env is disabled", () => {
  let runnerCreated = false;

  const result = startBookingReminderScheduler({
    env: { ENABLE_BOOKING_REMINDERS: "false" },
    logger: createLogger(),
    createRunner: () => {
      runnerCreated = true;
      return {};
    },
  });

  assert.deepEqual(result, { started: false, reason: "disabled" });
  assert.equal(runnerCreated, false);
});

test("scheduler starts with deterministic lease key and interval", () => {
  const logger = createLogger();
  let runnerConfig = null;

  const result = startBookingReminderScheduler({
    env: {
      ENABLE_BOOKING_REMINDERS: "true",
      BOOKING_REMINDER_INTERVAL_MS: "2500",
    },
    logger,
    createRunner: (config) => {
      runnerConfig = config;
      return {
        start: () => ({ started: true, intervalMs: config.intervalMs }),
        stop: async () => ({ stopped: true }),
      };
    },
  });

  assert.deepEqual(result, { started: true, intervalMs: 2500 });
  assert.equal(runnerConfig.jobKey, "booking-reminders");
  assert.equal(runnerConfig.intervalMs, 2500);
  assert.equal(typeof runnerConfig.run, "function");
  assert.equal(logger.infoMessages.length, 1);
});

test("multiple starts do not create duplicate schedulers", () => {
  let startCalls = 0;

  const firstResult = startBookingReminderScheduler({
    env: { ENABLE_BOOKING_REMINDERS: "true" },
    logger: createLogger(),
    createRunner: () => ({
      start: () => {
        startCalls += 1;
        return { started: true, intervalMs: 60000 };
      },
      stop: async () => ({ stopped: true }),
    }),
  });

  const secondResult = startBookingReminderScheduler({
    env: { ENABLE_BOOKING_REMINDERS: "true" },
    logger: createLogger(),
    createRunner: () => ({
      start: () => ({ started: true, intervalMs: 60000 }),
      stop: async () => ({ stopped: true }),
    }),
  });

  assert.deepEqual(firstResult, { started: true, intervalMs: 60000 });
  assert.deepEqual(secondResult, { started: false, reason: "already_started" });
  assert.equal(startCalls, 1);
});

test("concurrent stop shares shutdown, blocks restart, and allows restart after completion", async () => {
  const stopCalls = [];
  const stopDeferred = createDeferred();

  startBookingReminderScheduler({
    env: { ENABLE_BOOKING_REMINDERS: "true" },
    logger: createLogger(),
    createRunner: () => ({
      start: () => ({ started: true, intervalMs: 60000 }),
      stop: async () => {
        stopCalls.push("stop");
        await stopDeferred.promise;
        return { stopped: true };
      },
    }),
  });

  const firstStopPromise = stopBookingReminderScheduler();
  const secondStopPromise = stopBookingReminderScheduler();

  assert.equal(firstStopPromise, secondStopPromise);
  assert.deepEqual(
    startBookingReminderScheduler({
      env: { ENABLE_BOOKING_REMINDERS: "true" },
      logger: createLogger(),
      createRunner: () => ({
        start: () => ({ started: true, intervalMs: 60000 }),
        stop: async () => ({ stopped: true }),
      }),
    }),
    { started: false, reason: "already_started" }
  );

  stopDeferred.resolve();
  assert.deepEqual(await firstStopPromise, { stopped: true });
  assert.deepEqual(await stopBookingReminderScheduler(), { stopped: false });

  const restartResult = startBookingReminderScheduler({
    env: { ENABLE_BOOKING_REMINDERS: "true" },
    logger: createLogger(),
    createRunner: () => ({
      start: () => ({ started: true, intervalMs: 60000 }),
      stop: async () => ({ stopped: true }),
    }),
  });

  assert.deepEqual(restartResult, { started: true, intervalMs: 60000 });
  assert.deepEqual(stopCalls, ["stop"]);
});

test("server still does not import the legacy booking reminder cron", async () => {
  const serverSource = await readFile(new URL("../../server.js", import.meta.url), "utf8");

  assert.equal(serverSource.includes('import("../cron/bookingReminders.js")'), false);
  assert.equal(serverSource.includes("cron/bookingReminders"), false);
});
