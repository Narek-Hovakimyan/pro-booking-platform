import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createHealthRoutes,
  createReadinessStatusGetter,
} from "./healthRoutes.js";

const findRouteHandler = (router, path) =>
  router.stack.find((layer) => layer.route?.path === path)?.route.stack[0].handle;

const createResponse = () => ({
  body: undefined,
  statusCode: 200,
  send(payload) {
    this.body = payload;
    return this;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
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

const createTimerHarness = () => {
  let nextId = 1;
  const timers = new Map();
  const cleared = [];

  return {
    cleared,
    getTimerIds() {
      return [...timers.keys()];
    },
    runTimer(id) {
      const timer = timers.get(id);
      if (!timer) return false;
      timers.delete(id);
      timer.callback();
      return true;
    },
    setTimeout(callback, delay) {
      const id = {
        id: nextId++,
        delay,
        unrefCalled: false,
        unref() {
          this.unrefCalled = true;
        },
      };
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      cleared.push(id);
      timers.delete(id);
    },
  };
};

const okBody = {
  status: "ok",
  checks: {
    shutdown: "ok",
    database_connection: "ok",
    database_ping: "ok",
  },
};

const unavailablePingBody = {
  status: "unavailable",
  checks: {
    shutdown: "ok",
    database_connection: "ok",
    database_ping: "failed",
  },
};

test("liveness stays dependency-free during database failure or shutdown", () => {
  const router = createHealthRoutes({
    getReadinessStatus: async () => {
      throw new Error("should not run for liveness");
    },
  });
  const handler = findRouteHandler(router, "/");
  const response = createResponse();

  handler({}, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, "API is running");
});

test("readiness returns 200 for healthy state and clears timeout without aborting", async () => {
  const timers = createTimerHarness();
  const signalRecords = [];
  const getReadinessStatus = createReadinessStatusGetter({
    isDatabaseConnected: () => true,
    getDatabaseCommandRunner: () => ({
      command(_command, options) {
        signalRecords.push(options.signal);
        return Promise.resolve({ ok: 1 });
      },
    }),
    setTimeoutFn: timers.setTimeout,
    clearTimeoutFn: timers.clearTimeout,
  });
  const router = createHealthRoutes({ getReadinessStatus });
  const handler = findRouteHandler(router, "/ready");
  const response = createResponse();

  await handler({}, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, okBody);
  assert.equal(signalRecords.length, 1);
  assert.equal(signalRecords[0].aborted, false);
  assert.equal(timers.cleared.length, 1);
});

test("readiness timeout aborts the exact signal passed to db.command", async () => {
  const timers = createTimerHarness();
  let commandSignal;
  const deferredPing = createDeferred();
  const response = createResponse();
  const getReadinessStatus = createReadinessStatusGetter({
    isDatabaseConnected: () => true,
    getDatabaseCommandRunner: () => ({
      command(_command, options) {
        commandSignal = options.signal;
        return deferredPing.promise;
      },
    }),
    setTimeoutFn: timers.setTimeout,
    clearTimeoutFn: timers.clearTimeout,
    pingTimeoutMs: 25,
    commandTimeoutMs: 25,
  });
  const router = createHealthRoutes({ getReadinessStatus });
  const handler = findRouteHandler(router, "/ready");
  const responsePromise = handler({}, response);

  await Promise.resolve();
  assert.ok(commandSignal);
  const [timerId] = timers.getTimerIds();
  timers.runTimer(timerId);
  await responsePromise;

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, unavailablePingBody);
  assert.equal(commandSignal.aborted, true);
});

test("readiness returns 503 for disconnected database", async () => {
  const getReadinessStatus = createReadinessStatusGetter({
    isDatabaseConnected: () => false,
  });
  const router = createHealthRoutes({ getReadinessStatus });
  const handler = findRouteHandler(router, "/ready");
  const response = createResponse();

  await handler({}, response);

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, {
    status: "unavailable",
    checks: {
      shutdown: "ok",
      database_connection: "failed",
      database_ping: "ok",
    },
  });
});

test("failed ping clears timeout and keeps response generic", async () => {
  const timers = createTimerHarness();
  const getReadinessStatus = createReadinessStatusGetter({
    isDatabaseConnected: () => true,
    getDatabaseCommandRunner: () => ({
      command() {
        return Promise.reject(new Error("mongodb://secret-host/?auth=token"));
      },
    }),
    setTimeoutFn: timers.setTimeout,
    clearTimeoutFn: timers.clearTimeout,
  });
  const router = createHealthRoutes({ getReadinessStatus });
  const handler = findRouteHandler(router, "/ready");
  const response = createResponse();

  await handler({}, response);

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, unavailablePingBody);
  assert.equal(timers.cleared.length, 1);
  assert.equal(JSON.stringify(response.body).includes("mongodb://"), false);
});

test("late rejection after timeout is handled without unhandled rejection", async () => {
  const timers = createTimerHarness();
  const deferredPing = createDeferred();
  const unhandledRejections = [];
  const onUnhandledRejection = (reason) => {
    unhandledRejections.push(reason);
  };
  process.on("unhandledRejection", onUnhandledRejection);

  try {
    const getReadinessStatus = createReadinessStatusGetter({
      isDatabaseConnected: () => true,
      getDatabaseCommandRunner: () => ({
        command() {
          return deferredPing.promise;
        },
      }),
      setTimeoutFn: timers.setTimeout,
      clearTimeoutFn: timers.clearTimeout,
      pingTimeoutMs: 25,
      commandTimeoutMs: 25,
    });
    const router = createHealthRoutes({ getReadinessStatus });
    const handler = findRouteHandler(router, "/ready");
    const response = createResponse();
    const responsePromise = handler({}, response);

    await Promise.resolve();
    const [timerId] = timers.getTimerIds();
    timers.runTimer(timerId);
    await responsePromise;
    deferredPing.reject(new Error("late_abort_error"));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, unavailablePingBody);
    assert.deepEqual(unhandledRejections, []);
  } finally {
    process.removeListener("unhandledRejection", onUnhandledRejection);
  }
});

test("repeated timed-out requests each cancel their own operation", async () => {
  const timers = createTimerHarness();
  const signals = [];
  const deferredPings = [createDeferred(), createDeferred()];
  let index = 0;
  const getReadinessStatus = createReadinessStatusGetter({
    isDatabaseConnected: () => true,
    getDatabaseCommandRunner: () => ({
      command(_command, options) {
        signals.push(options.signal);
        return deferredPings[index++].promise;
      },
    }),
    setTimeoutFn: timers.setTimeout,
    clearTimeoutFn: timers.clearTimeout,
    pingTimeoutMs: 25,
    commandTimeoutMs: 25,
  });
  const router = createHealthRoutes({ getReadinessStatus });
  const handler = findRouteHandler(router, "/ready");
  const firstResponse = createResponse();
  const secondResponse = createResponse();

  const firstRequest = handler({}, firstResponse);
  const secondRequest = handler({}, secondResponse);

  await Promise.resolve();
  for (const timerId of timers.getTimerIds()) {
    timers.runTimer(timerId);
  }
  await Promise.all([firstRequest, secondRequest]);

  assert.equal(signals.length, 2);
  assert.notEqual(signals[0], signals[1]);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, true);
  assert.deepEqual(firstResponse.body, unavailablePingBody);
  assert.deepEqual(secondResponse.body, unavailablePingBody);
});

test("readiness returns 503 during shutdown with generic checks only", async () => {
  const getReadinessStatus = createReadinessStatusGetter({
    isShuttingDown: () => true,
  });
  const router = createHealthRoutes({ getReadinessStatus });
  const handler = findRouteHandler(router, "/ready");
  const response = createResponse();

  await handler({}, response);

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, {
    status: "unavailable",
    checks: {
      shutdown: "failed",
      database_connection: "ok",
      database_ping: "ok",
    },
  });
});
