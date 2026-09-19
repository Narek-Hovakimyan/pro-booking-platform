import assert from "node:assert/strict";
import { test } from "node:test";

import { createServerLifecycleService } from "./serverLifecycleService.js";

const createLogger = () => ({
  infoMessages: [],
  errorMessages: [],
  info(...args) {
    this.infoMessages.push(args);
  },
  error(...args) {
    this.errorMessages.push(args);
  },
});

test("shutdown stops the booking post-commit dispatch scheduler", async () => {
  const calls = [];
  const service = createServerLifecycleService({
    stopBookingReminderSchedulerFn: async () => {},
    stopBookingPostCommitDispatchSchedulerFn: async () => { calls.push("post-commit"); },
    stopWaitlistExpirationSchedulerFn: async () => {},
    stopSubscriptionExpirationSchedulerFn: async () => {},
    stopMediaReconciliationSchedulerFn: async () => {},
    closeHttpServerFn: async () => {},
    closeSocketServerFn: async () => {},
    shutdownRedisFn: async () => {},
    disconnectDatabaseFn: async () => {},
  });

  assert.deepEqual(await service.shutdown("SIGTERM"), { ok: true, exitCode: 0 });
  assert.deepEqual(calls, ["post-commit"]);
});

test("readiness reports healthy only when not shutting down and database ping succeeds", async () => {
  const service = createServerLifecycleService({
    isDatabaseConnectedFn: () => true,
    pingDatabaseFn: async () => true,
  });

  assert.deepEqual(await service.getReadinessStatus(), {
    statusCode: 200,
    body: {
      status: "ok",
      checks: {
        shutdown: "ok",
        database_connection: "ok",
        database_ping: "ok",
      },
    },
  });
});

test("readiness reports disconnected database generically", async () => {
  const service = createServerLifecycleService({
    isDatabaseConnectedFn: () => false,
    pingDatabaseFn: async () => {
      throw new Error("should not ping");
    },
  });

  const readiness = await service.getReadinessStatus();

  assert.equal(readiness.statusCode, 503);
  assert.deepEqual(readiness.body, {
    status: "unavailable",
    checks: {
      shutdown: "ok",
      database_connection: "failed",
      database_ping: "ok",
    },
  });
});

test("readiness reports ping failure without leaking error details", async () => {
  const service = createServerLifecycleService({
    isDatabaseConnectedFn: () => true,
    pingDatabaseFn: async () => {
      throw new Error("mongodb://secret-user:secret-pass@db.internal");
    },
  });

  const readiness = await service.getReadinessStatus();

  assert.equal(readiness.statusCode, 503);
  assert.deepEqual(readiness.body, {
    status: "unavailable",
    checks: {
      shutdown: "ok",
      database_connection: "ok",
      database_ping: "failed",
    },
  });
  assert.equal(JSON.stringify(readiness.body).includes("secret"), false);
});

test("shutdown state makes readiness fail while keeping checks generic", async () => {
  const service = createServerLifecycleService({
    isDatabaseConnectedFn: () => true,
    pingDatabaseFn: async () => true,
    shutdownTimeoutMs: 100,
    closeHttpServerFn: async () => {},
    closeSocketServerFn: async () => {},
    disconnectDatabaseFn: async () => {},
    stopBookingReminderSchedulerFn: async () => {},
    stopWaitlistExpirationSchedulerFn: async () => {},
    stopSubscriptionExpirationSchedulerFn: async () => {},
  });

  const shutdownPromise = service.shutdown("SIGTERM");
  const readiness = await service.getReadinessStatus();
  const shutdownResult = await shutdownPromise;

  assert.equal(readiness.statusCode, 503);
  assert.deepEqual(readiness.body, {
    status: "unavailable",
    checks: {
      shutdown: "failed",
      database_connection: "ok",
      database_ping: "ok",
    },
  });
  assert.deepEqual(shutdownResult, { ok: true, exitCode: 0 });
});

test("successful shutdown runs every stopper once and exits zero for signal handling", async () => {
  const calls = [];
  const cronTask = { stop() { calls.push("cron"); } };
  const exitCodes = [];
  const service = createServerLifecycleService({
    exitFn: (code) => {
      exitCodes.push(code);
    },
    stopBookingReminderSchedulerFn: async () => {
      calls.push("booking");
    },
    stopWaitlistExpirationSchedulerFn: async () => {
      calls.push("waitlist");
    },
    stopSubscriptionExpirationSchedulerFn: async () => {
      calls.push("subscription");
    },
    stopCronTaskFn: async (task) => {
      task.stop();
    },
    closeHttpServerFn: async () => {
      calls.push("http");
    },
    closeSocketServerFn: async () => {
      calls.push("socket");
    },
    shutdownRedisFn: async () => {
      calls.push("redis");
    },
    disconnectDatabaseFn: async () => {
      calls.push("db");
    },
  });

  service.setCronTasks([cronTask]);

  const result = await service.handleSignal("SIGTERM");

  assert.deepEqual(result, { ok: true, exitCode: 0 });
  assert.deepEqual(calls, [
    "booking",
    "waitlist",
    "subscription",
    "cron",
    "http",
    "socket",
    "redis",
    "db",
  ]);
  assert.deepEqual(exitCodes, [0]);
});

test("repeated signals and shutdown calls reuse the same cleanup run", async () => {
  const calls = [];
  const exitCodes = [];
  const service = createServerLifecycleService({
    exitFn: (code) => {
      exitCodes.push(code);
    },
    stopBookingReminderSchedulerFn: async () => {
      calls.push("booking");
    },
    stopWaitlistExpirationSchedulerFn: async () => {
      calls.push("waitlist");
    },
    stopSubscriptionExpirationSchedulerFn: async () => {
      calls.push("subscription");
    },
    closeHttpServerFn: async () => {
      calls.push("http");
    },
    closeSocketServerFn: async () => {
      calls.push("socket");
    },
    shutdownRedisFn: async () => {
      calls.push("redis");
    },
    disconnectDatabaseFn: async () => {
      calls.push("db");
    },
  });

  const [first, second, third] = await Promise.all([
    service.handleSignal("SIGTERM"),
    service.handleSignal("SIGINT"),
    service.shutdown("manual"),
  ]);

  assert.deepEqual(first, { ok: true, exitCode: 0 });
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
  assert.deepEqual(calls, [
    "booking",
    "waitlist",
    "subscription",
    "http",
    "socket",
    "redis",
    "db",
  ]);
  assert.deepEqual(exitCodes, [0]);
});

test("shutdown failure returns non-zero and still invokes later cleanup steps once", async () => {
  const calls = [];
  const logger = createLogger();
  const exitCodes = [];
  const service = createServerLifecycleService({
    logger,
    exitFn: (code) => {
      exitCodes.push(code);
    },
    stopBookingReminderSchedulerFn: async () => {
      calls.push("booking");
      throw new Error("first failure");
    },
    stopWaitlistExpirationSchedulerFn: async () => {
      calls.push("waitlist");
    },
    stopSubscriptionExpirationSchedulerFn: async () => {
      calls.push("subscription");
    },
    closeHttpServerFn: async () => {
      calls.push("http");
    },
    closeSocketServerFn: async () => {
      calls.push("socket");
    },
    disconnectDatabaseFn: async () => {
      calls.push("db");
    },
  });

  const result = await service.handleSignal("SIGTERM");

  assert.deepEqual(result, { ok: false, exitCode: 1, reason: "cleanup_failed" });
  assert.deepEqual(calls, ["booking", "waitlist", "subscription", "http", "socket", "db"]);
  assert.deepEqual(exitCodes, [1]);
  assert.ok(
    logger.errorMessages.some(
      ([details]) => details?.event === "shutdown.failed" && details?.reason === "cleanup_failed"
    )
  );
});

test("shutdown timeout returns non-zero and does not run cleanup twice", async () => {
  const calls = [];
  const logger = createLogger();
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const service = createServerLifecycleService({
    logger,
    shutdownTimeoutMs: 25,
    setTimeoutFn: setTimeout,
    clearTimeoutFn: clearTimeout,
    stopBookingReminderSchedulerFn: async () => {
      calls.push("booking");
      await pending;
    },
    stopWaitlistExpirationSchedulerFn: async () => {
      calls.push("waitlist");
    },
    stopSubscriptionExpirationSchedulerFn: async () => {
      calls.push("subscription");
    },
    closeHttpServerFn: async () => {
      calls.push("http");
    },
    closeSocketServerFn: async () => {
      calls.push("socket");
    },
    disconnectDatabaseFn: async () => {
      calls.push("db");
    },
  });

  const [first, second] = await Promise.all([
    service.shutdown("SIGTERM"),
    service.shutdown("SIGINT"),
  ]);

  release();

  assert.deepEqual(first, { ok: false, exitCode: 1, reason: "timeout" });
  assert.deepEqual(second, first);
  assert.deepEqual(calls, ["booking"]);
  assert.ok(
    logger.errorMessages.some(
      ([details]) => details?.event === "shutdown.timeout" && details?.reason === "timeout"
    )
  );
});

test("shutdown awaits async cron stop cleanup", async () => {
  const calls = [];
  const deferred = (() => {
    let resolve;
    const promise = new Promise((nextResolve) => {
      resolve = nextResolve;
    });
    return { promise, resolve };
  })();
  const cronTask = {
    async stop() {
      calls.push("cron-stop-start");
      await deferred.promise;
      calls.push("cron-stop-finish");
      return { stopped: true };
    },
  };
  const service = createServerLifecycleService({
    stopBookingReminderSchedulerFn: async () => {
      calls.push("booking");
    },
    stopWaitlistExpirationSchedulerFn: async () => {
      calls.push("waitlist");
    },
    stopSubscriptionExpirationSchedulerFn: async () => {
      calls.push("subscription");
    },
    closeHttpServerFn: async () => {
      calls.push("http");
    },
    closeSocketServerFn: async () => {
      calls.push("socket");
    },
    disconnectDatabaseFn: async () => {
      calls.push("db");
    },
  });

  service.setCronTasks([cronTask]);

  const shutdownPromise = service.shutdown("SIGTERM");
  let settled = false;
  void shutdownPromise.then(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);

  deferred.resolve();

  assert.deepEqual(await shutdownPromise, { ok: true, exitCode: 0 });
  assert.deepEqual(calls, [
    "booking",
    "waitlist",
    "subscription",
    "cron-stop-start",
    "cron-stop-finish",
    "http",
    "socket",
    "db",
  ]);
});

test("shutdown closes Socket.IO before shared Redis and database cleanup", async () => {
  const calls = [];
  const service = createServerLifecycleService({
    stopBookingReminderSchedulerFn: async () => {},
    stopWaitlistExpirationSchedulerFn: async () => {},
    stopSubscriptionExpirationSchedulerFn: async () => {},
    closeHttpServerFn: async () => calls.push("http"),
    closeSocketServerFn: async () => calls.push("socket"),
    shutdownRedisFn: async () => calls.push("redis"),
    disconnectDatabaseFn: async () => calls.push("db"),
  });

  assert.deepEqual(await service.shutdown("SIGTERM"), { ok: true, exitCode: 0 });
  assert.deepEqual(calls, ["http", "socket", "redis", "db"]);
});

test("startup failure after Socket.IO creation cleans unstarted HTTP, socket, Redis, and database once", async () => {
  const calls = [];
  const service = createServerLifecycleService({
    stopBookingReminderSchedulerFn: async () => {},
    stopWaitlistExpirationSchedulerFn: async () => {},
    stopSubscriptionExpirationSchedulerFn: async () => {},
    closeHttpServerFn: async () => calls.push("http-unstarted"),
    closeSocketServerFn: async () => calls.push("socket"),
    shutdownRedisFn: async () => calls.push("redis"),
    disconnectDatabaseFn: async () => calls.push("db"),
  });
  service.configure({ server: {}, socketServer: {} });

  const [first, second] = await Promise.all([
    service.shutdown("startup_failure"),
    service.shutdown("startup_failure"),
  ]);

  assert.deepEqual(first, { ok: true, exitCode: 0 });
  assert.deepEqual(second, first);
  assert.deepEqual(calls, ["http-unstarted", "socket", "redis", "db"]);
});
