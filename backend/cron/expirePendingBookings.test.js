import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EXPIRATION_CRON,
  startExpirePendingBookingsCron,
} from "./expirePendingBookings.js";

test("pending booking cron keeps lease key, expression, and business behavior", async () => {
  const logger = {
    errorMessages: [],
    error(...args) {
      this.errorMessages.push(args);
    },
  };
  let runs = 0;
  let capturedConfig;
  const handle = { async stop() { return { stopped: true }; } };

  const startedHandle = startExpirePendingBookingsCron({
    logger,
    expirePendingBookingsFn: async () => {
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
  assert.equal(capturedConfig.jobKey, "expire-pending-bookings");
  assert.equal(capturedConfig.expression, EXPIRATION_CRON);
  assert.equal(runs, 0);

  await capturedConfig.run();
  assert.equal(runs, 1);

  const failure = new Error("boom");
  startExpirePendingBookingsCron({
    logger,
    expirePendingBookingsFn: async () => {
      throw failure;
    },
    createRunner: (config) => {
      capturedConfig = config;
      return { start() { return handle; } };
    },
  });

  await capturedConfig.run();
  assert.deepEqual(logger.errorMessages.at(-1), [
    "Pending booking expiration job error:",
    failure,
  ]);
});
