import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EVENT_REMINDERS_CRON,
  startEventRemindersCron,
} from "./eventReminders.js";

test("event reminder cron keeps lease key, expression, and business behavior", async () => {
  const logger = {
    errorMessages: [],
    error(...args) {
      this.errorMessages.push(args);
    },
  };
  const runCalls = [];
  let capturedConfig;
  const handle = { async stop() { return { stopped: true }; } };

  const startedHandle = startEventRemindersCron({
    logger,
    sendEventRemindersFn: async (...args) => {
      runCalls.push(args);
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
  assert.equal(capturedConfig.jobKey, "event-reminders");
  assert.equal(capturedConfig.expression, EVENT_REMINDERS_CRON);
  assert.equal(runCalls.length, 0);

  const leaseContext = {
    jobKey: "event-reminders",
    ownerToken: "owner-1",
    fencingToken: 4,
    signal: new AbortController().signal,
    assertOwned: async () => {},
  };

  await capturedConfig.run(leaseContext);
  await capturedConfig.run();
  assert.deepEqual(runCalls[0], [undefined, { leaseContext }]);
  assert.deepEqual(runCalls[1], []);

  const failure = new Error("boom");
  startEventRemindersCron({
    logger,
    sendEventRemindersFn: async () => {
      throw failure;
    },
    createRunner: (config) => {
      capturedConfig = config;
      return { start() { return handle; } };
    },
  });

  await capturedConfig.run();
  assert.deepEqual(logger.errorMessages.at(-1), ["Event reminder job error:", failure]);
});
