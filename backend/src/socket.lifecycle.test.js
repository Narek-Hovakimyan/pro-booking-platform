import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  __resetSocketAuthDependencies,
  __setSocketAuthDependencies,
  disconnectAuthenticatedUserSockets,
  installAuthenticatedSocketLifecycle,
  MAX_TIMEOUT_MS,
  SOCKET_AUTH_REFRESH_EVENT,
  SOCKET_AUTH_REFRESH_PAYLOAD,
} from "./socket.js";

function createFakeSocket(expiresAt) {
  const handlers = new Map();
  const events = [];

  return {
    accessTokenExpiresAt: expiresAt,
    events,
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    off(eventName, handler) {
      if (handlers.get(eventName) === handler) {
        handlers.delete(eventName);
      }
    },
    emit(eventName, payload) {
      events.push(["emit", eventName, payload]);
    },
    disconnect(force) {
      events.push(["disconnect", force]);
    },
    trigger(eventName, ...args) {
      handlers.get(eventName)?.(...args);
    },
    getHandler(eventName) {
      return handlers.get(eventName);
    },
  };
}

function createTimerHarness(now = 1_000) {
  const timers = [];

  return {
    timers,
    get now() {
      return now;
    },
    setNow(value) {
      now = value;
    },
    install() {
      __setSocketAuthDependencies({
        now: () => now,
        setTimeout: (callback, delay) => {
          const timer = {
            callback,
            delay,
            cleared: false,
            unrefCalled: false,
            unref() {
              timer.unrefCalled = true;
            },
          };
          timers.push(timer);
          return timer;
        },
        clearTimeout: (timer) => {
          if (timer) {
            timer.cleared = true;
          }
        },
      });
    },
  };
}

afterEach(() => {
  __resetSocketAuthDependencies();
});

test("valid near-future expiry schedules the exact remaining delay and unreferences the timer", () => {
  const harness = createTimerHarness(5_000);
  harness.install();
  const socket = createFakeSocket(5_750);

  assert.equal(installAuthenticatedSocketLifecycle(socket), true);
  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].delay, 750);
  assert.equal(harness.timers[0].unrefCalled, true);
  assert.equal(typeof socket.getHandler("disconnect"), "function");
});

test("timer callback recalculates time, emits before forced disconnect, and reaches actual expiry", () => {
  const expiresAt = 10_000 + MAX_TIMEOUT_MS + 5_000;
  const harness = createTimerHarness(10_000);
  harness.install();
  const socket = createFakeSocket(expiresAt);

  installAuthenticatedSocketLifecycle(socket);

  assert.equal(harness.timers[0].delay, MAX_TIMEOUT_MS);

  harness.setNow(10_001 + MAX_TIMEOUT_MS);
  harness.timers[0].callback();

  assert.equal(socket.events.length, 0);
  assert.equal(harness.timers.length, 2);
  assert.equal(harness.timers[1].delay, 4_999);

  harness.setNow(expiresAt);
  harness.timers[1].callback();

  assert.deepEqual(socket.events, [
    ["emit", SOCKET_AUTH_REFRESH_EVENT, SOCKET_AUTH_REFRESH_PAYLOAD],
    ["disconnect", true],
  ]);
});

test("expired or malformed expiry fails closed immediately without leaving an active lifecycle", () => {
  const harness = createTimerHarness(8_000);
  harness.install();

  for (const expiresAt of [8_000, 7_999, null, "soon", Number.NaN]) {
    const socket = createFakeSocket(expiresAt);
    assert.equal(installAuthenticatedSocketLifecycle(socket), false);
    assert.deepEqual(socket.events, [
      ["emit", SOCKET_AUTH_REFRESH_EVENT, SOCKET_AUTH_REFRESH_PAYLOAD],
      ["disconnect", true],
    ]);
  }
});

test("client disconnect clears the timer and stale timer callbacks become inert", () => {
  const harness = createTimerHarness(2_000);
  harness.install();
  const socket = createFakeSocket(4_000);

  installAuthenticatedSocketLifecycle(socket);
  const firstTimer = harness.timers[0];

  socket.trigger("disconnect", "transport close");
  assert.equal(firstTimer.cleared, true);

  harness.setNow(4_000);
  firstTimer.callback();
  assert.deepEqual(socket.events, []);
});

test("duplicate lifecycle installation clears the prior timer and handler without leaving two active timers", () => {
  const harness = createTimerHarness(3_000);
  harness.install();
  const socket = createFakeSocket(6_000);

  installAuthenticatedSocketLifecycle(socket);
  const firstTimer = harness.timers[0];
  const firstDisconnectHandler = socket.getHandler("disconnect");

  installAuthenticatedSocketLifecycle(socket);

  assert.equal(firstTimer.cleared, true);
  assert.notEqual(socket.getHandler("disconnect"), firstDisconnectHandler);
  assert.equal(harness.timers.length, 2);

  harness.setNow(6_000);
  firstTimer.callback();
  assert.deepEqual(socket.events, []);
});

test("multiple sockets and reconnects receive independent lifecycle timers", () => {
  const harness = createTimerHarness(1_000);
  harness.install();
  const firstSocket = createFakeSocket(2_500);
  const secondSocket = createFakeSocket(3_000);

  installAuthenticatedSocketLifecycle(firstSocket);
  installAuthenticatedSocketLifecycle(secondSocket);

  assert.equal(harness.timers.length, 2);
  assert.equal(harness.timers[0].delay, 1_500);
  assert.equal(harness.timers[1].delay, 2_000);
});

test("disconnectAuthenticatedUserSockets targets only the exact user room in bounded order", () => {
  const calls = [];
  __setSocketAuthDependencies({
    getIO: () => ({
      to(room) {
        return {
          emit(eventName, payload) {
            calls.push(["emit", room, eventName, payload]);
          },
        };
      },
      in(room) {
        return {
          disconnectSockets(force) {
            calls.push(["disconnect", room, force]);
          },
        };
      },
    }),
  });

  assert.deepEqual(disconnectAuthenticatedUserSockets(" user-1 "), {
    ok: true,
    room: "user:user-1",
    disconnected: true,
  });
  assert.deepEqual(calls, [
    ["emit", "user:user-1", SOCKET_AUTH_REFRESH_EVENT, SOCKET_AUTH_REFRESH_PAYLOAD],
    ["disconnect", "user:user-1", true],
  ]);
});

test("disconnectAuthenticatedUserSockets safely handles malformed users, missing io, and propagates room-operation failures", () => {
  assert.deepEqual(disconnectAuthenticatedUserSockets("   "), {
    ok: false,
    room: null,
    disconnected: false,
  });

  __setSocketAuthDependencies({ getIO: () => null });
  assert.deepEqual(disconnectAuthenticatedUserSockets("user-2"), {
    ok: true,
    room: "user:user-2",
    disconnected: false,
  });

  __setSocketAuthDependencies({
    getIO: () => ({
      to() {
        return {
          emit() {
            throw new Error("adapter down");
          },
        };
      },
      in() {
        return {
          disconnectSockets() {},
        };
      },
    }),
  });

  assert.throws(
    () => disconnectAuthenticatedUserSockets("user-3"),
    /adapter down/
  );
});
