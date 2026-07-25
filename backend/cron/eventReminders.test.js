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
  let runs = 0;
  let capturedConfig;
  const handle = { async stop() { return { stopped: true }; } };

  const startedHandle = startEventRemindersCron({
    logger,
    sendEventRemindersFn: async () => {
      runs += 1;
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
  assert.equal(runs, 0);

  await capturedConfig.run();
  assert.equal(runs, 1);

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
