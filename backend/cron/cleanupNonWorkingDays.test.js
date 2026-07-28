import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CLEANUP_NON_WORKING_DAYS_CRON,
  startCleanupNonWorkingDaysCron,
} from "./cleanupNonWorkingDays.js";

const createLogger = () => ({
  logMessages: [],
  errorMessages: [],
  log(...args) {
    this.logMessages.push(args);
  },
  error(...args) {
    this.errorMessages.push(args);
  },
});

const createLeaseContext = ({ session = { id: "lease-session" }, error } = {}) => ({
  async withFencedWrite(write) {
    if (error) {
      throw error;
    }

    return write({ session });
  },
});

const createSchedule = (overrides = {}) => ({
  _id: overrides._id || "schedule-1",
  nonWorkingDays: overrides.nonWorkingDays || [],
  scheduleOverrides: overrides.scheduleOverrides || {},
  dateSchedules: overrides.dateSchedules || {},
});

test("cleanup cron keeps its lease key, expression, no-immediate-run start behavior, and forwards lease context", async () => {
  const logger = createLogger();
  const runCalls = [];
  let capturedConfig;
  const handle = { async stop() { return { stopped: true }; } };
  const leaseContext = createLeaseContext();

  const startedHandle = startCleanupNonWorkingDaysCron({
    logger,
    findSchedules: async () => [],
    updateSchedule: async (...args) => {
      runCalls.push(args);
      return null;
    },
    createRunner: (config) => {
      capturedConfig = config;
      return {
        start() {
          return handle;
        },
      };
    },
  });

  assert.equal(startedHandle, handle);
  assert.equal(capturedConfig.jobKey, "cleanup-non-working-days");
  assert.equal(capturedConfig.expression, CLEANUP_NON_WORKING_DAYS_CRON);
  assert.equal(runCalls.length, 0);

  await capturedConfig.run(leaseContext);

  assert.equal(logger.logMessages[0][0], "Schedule past date cleanup job executed");
  assert.equal(logger.errorMessages.length, 0);
});

test("cleanup cron uses fenced CAS writes only for changed schedules and propagates the session", async () => {
  const logger = createLogger();
  const changedSchedule = createSchedule({
    _id: "changed-schedule",
    nonWorkingDays: ["2026-07-20"],
    scheduleOverrides: { "2026-07-21": { startTime: "09:00" } },
    dateSchedules: { "2026-07-22": { slots: ["09:00"] } },
  });
  const unchangedSchedule = createSchedule({ _id: "unchanged-schedule" });
  const session = { id: "lease-session" };
  const writes = [];
  let fencedCalls = 0;
  let findCalls = 0;
  let cleanerCalls = 0;
  let capturedConfig;

  startCleanupNonWorkingDaysCron({
    logger,
    findSchedules: async () => {
      findCalls += 1;
      return [changedSchedule, unchangedSchedule];
    },
    getTodayKeyFn: () => "2026-07-28",
    cleanPastScheduleDatesFn: (schedule) => {
      cleanerCalls += 1;
      return schedule._id === "changed-schedule"
        ? { nonWorkingDays: [], scheduleOverrides: {}, dateSchedules: {} }
        : {
            nonWorkingDays: schedule.nonWorkingDays,
            scheduleOverrides: schedule.scheduleOverrides,
            dateSchedules: schedule.dateSchedules,
          };
    },
    updateSchedule: async (query, update, options) => {
      writes.push({ query, update, options });
      return { _id: query._id };
    },
    createRunner: (config) => {
      capturedConfig = config;
      return { start: () => ({ started: true }) };
    },
  });

  await capturedConfig.run({
    async withFencedWrite(write) {
      fencedCalls += 1;
      return write({ session });
    },
  });

  assert.equal(findCalls, 1);
  assert.equal(cleanerCalls, 2);
  assert.equal(fencedCalls, 1);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].query, {
    _id: "changed-schedule",
    nonWorkingDays: ["2026-07-20"],
    scheduleOverrides: { "2026-07-21": { startTime: "09:00" } },
    dateSchedules: { "2026-07-22": { slots: ["09:00"] } },
  });
  assert.deepEqual(writes[0].update, {
    $set: { nonWorkingDays: [], scheduleOverrides: {}, dateSchedules: {} },
  });
  assert.equal(writes[0].options.session, session);
  assert.equal(logger.errorMessages.length, 0);
});

test("cleanup cron skips CAS-missed concurrent schedule edits without overwriting them", async () => {
  const logger = createLogger();
  let capturedConfig;
  let writeCalls = 0;

  startCleanupNonWorkingDaysCron({
    logger,
    findSchedules: async () => [
      createSchedule({
        _id: "schedule-concurrent",
        nonWorkingDays: ["2026-07-20"],
      }),
    ],
    getTodayKeyFn: () => "2026-07-28",
    cleanPastScheduleDatesFn: () => ({
      nonWorkingDays: [],
      scheduleOverrides: {},
      dateSchedules: {},
    }),
    updateSchedule: async () => {
      writeCalls += 1;
      return null;
    },
    createRunner: (config) => {
      capturedConfig = config;
      return { start: () => ({ started: true }) };
    },
  });

  await capturedConfig.run(createLeaseContext());

  assert.equal(writeCalls, 1);
  assert.equal(logger.logMessages[0][0], "Schedule past date cleanup job executed");
  assert.equal(logger.errorMessages.length, 0);
});

test("cleanup cron stops immediately, logs, and rethrows unchanged on fatal fenced errors", async () => {
  const logger = createLogger();
  const failure = new Error("storage down");
  failure.code = "transactions_unavailable";
  let capturedConfig;
  let cleanerCalls = 0;

  startCleanupNonWorkingDaysCron({
    logger,
    findSchedules: async () => [
      createSchedule({ _id: "first", nonWorkingDays: ["2026-07-20"] }),
      createSchedule({ _id: "second", nonWorkingDays: ["2026-07-21"] }),
    ],
    getTodayKeyFn: () => "2026-07-28",
    cleanPastScheduleDatesFn: (schedule) => {
      cleanerCalls += 1;
      return {
        nonWorkingDays: [],
        scheduleOverrides: schedule.scheduleOverrides,
        dateSchedules: schedule.dateSchedules,
      };
    },
    createRunner: (config) => {
      capturedConfig = config;
      return { start: () => ({ started: true }) };
    },
  });

  await assert.rejects(() => capturedConfig.run(createLeaseContext({ error: failure })), failure);

  assert.equal(cleanerCalls, 1);
  assert.deepEqual(logger.errorMessages.at(-1), ["Schedule past date cleanup error:", failure]);
});

test("cleanup cron rejects stale owners and lets a new owner recover safely", async () => {
  const logger = createLogger();
  const staleError = new Error("lease lost");
  staleError.code = "scheduler_lease_lost";
  const writes = [];
  let capturedConfig;
  let staleCalls = 0;

  startCleanupNonWorkingDaysCron({
    logger,
    findSchedules: async () => [
      createSchedule({
        _id: "schedule-recovery",
        nonWorkingDays: ["2026-07-20"],
        scheduleOverrides: { "2026-07-20": { startTime: "10:00" } },
      }),
    ],
    getTodayKeyFn: () => "2026-07-28",
    cleanPastScheduleDatesFn: () => ({
      nonWorkingDays: [],
      scheduleOverrides: {},
      dateSchedules: {},
    }),
    updateSchedule: async (query, update, options) => {
      writes.push({ query, update, options });
      return { _id: query._id };
    },
    createRunner: (config) => {
      capturedConfig = config;
      return { start: () => ({ started: true }) };
    },
  });

  await assert.rejects(
    () =>
      capturedConfig.run({
        async withFencedWrite() {
          staleCalls += 1;
          throw staleError;
        },
      }),
    staleError
  );

  await capturedConfig.run(createLeaseContext({ session: { owner: "new-owner" } }));

  assert.equal(staleCalls, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].options.session.owner, "new-owner");
});
