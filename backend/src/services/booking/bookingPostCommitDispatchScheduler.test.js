import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  startBookingPostCommitDispatchScheduler,
  stopBookingPostCommitDispatchScheduler,
} from "./bookingPostCommitDispatchScheduler.js";

afterEach(async () => {
  await stopBookingPostCommitDispatchScheduler();
});

test("unset recovery flag starts the scheduler and passes the lease context to bounded recovery", async () => {
  const calls = [];
  let received = null;
  const runner = {
    start: () => ({ started: true }),
    stop: async () => ({ stopped: true }),
  };
  const result = startBookingPostCommitDispatchScheduler({
    env: { BOOKING_POST_COMMIT_DISPATCH_INTERVAL_MS: "250" },
    logger: { info() {} },
    recoverDispatches: async (args) => { received = args; },
    createRunner: (options) => {
      calls.push(options);
      return runner;
    },
  });
  const duplicate = startBookingPostCommitDispatchScheduler({ env: {} });

  assert.equal(result.started, true);
  assert.deepEqual(duplicate, { started: false, reason: "already_started" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].jobKey, "booking-post-commit-dispatch");
  assert.equal(calls[0].intervalMs, 250);
  const leaseContext = { id: "lease" };
  await calls[0].run(leaseContext);
  assert.equal(received.leaseContext, leaseContext);
});

test("explicit true starts once and explicit false disables recovery", async () => {
  const runner = {
    start: () => ({ started: true }),
    stop: async () => ({ stopped: true }),
  };
  let starts = 0;
  const enabled = startBookingPostCommitDispatchScheduler({
    env: { ENABLE_BOOKING_POST_COMMIT_DISPATCH: "true" },
    logger: { info() {} },
    createRunner: () => {
      starts += 1;
      return runner;
    },
  });
  const duplicate = startBookingPostCommitDispatchScheduler({
    env: { ENABLE_BOOKING_POST_COMMIT_DISPATCH: "true" },
  });

  assert.equal(enabled.started, true);
  assert.deepEqual(duplicate, { started: false, reason: "already_started" });
  assert.equal(starts, 1);
  await stopBookingPostCommitDispatchScheduler();

  let created = false;
  const result = startBookingPostCommitDispatchScheduler({
    env: { ENABLE_BOOKING_POST_COMMIT_DISPATCH: "false" },
    createRunner: () => { created = true; },
  });
  assert.deepEqual(result, { started: false, reason: "disabled" });
  assert.equal(created, false);
  assert.deepEqual(await stopBookingPostCommitDispatchScheduler(), { stopped: false });
});
