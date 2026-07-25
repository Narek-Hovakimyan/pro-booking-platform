import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CLEANUP_NON_WORKING_DAYS_CRON,
  startCleanupNonWorkingDaysCron,
} from "./cleanupNonWorkingDays.js";

test("cleanup cron keeps its lease key, expression, and no-immediate-run start behavior", async () => {
  const logger = {
    logMessages: [],
    errorMessages: [],
    log(...args) {
      this.logMessages.push(args);
    },
    error(...args) {
      this.errorMessages.push(args);
    },
  };
  const saved = [];
  const schedules = [
    {
      nonWorkingDays: ["2026-07-20"],
      scheduleOverrides: {},
      dateSchedules: {},
      async save() {
        saved.push("changed");
      },
    },
    {
      nonWorkingDays: [],
      scheduleOverrides: {},
      dateSchedules: {},
      async save() {
        saved.push("unchanged");
      },
    },
  ];
  let capturedConfig;
  const handle = { async stop() { return { stopped: true }; } };

  const startedHandle = startCleanupNonWorkingDaysCron({
    logger,
    findSchedules: async () => schedules,
    getTodayKeyFn: () => "2026-07-25",
    cleanPastScheduleDatesFn: (schedule) =>
      schedule === schedules[0]
        ? { nonWorkingDays: [], scheduleOverrides: {}, dateSchedules: {} }
        : {
            nonWorkingDays: schedule.nonWorkingDays,
            scheduleOverrides: schedule.scheduleOverrides,
            dateSchedules: schedule.dateSchedules,
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
  assert.deepEqual(saved, []);

  await capturedConfig.run();

  assert.deepEqual(saved, ["changed"]);
  assert.equal(logger.logMessages[0][0], "Schedule past date cleanup job executed");
  assert.equal(logger.errorMessages.length, 0);
});
