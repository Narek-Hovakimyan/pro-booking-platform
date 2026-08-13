import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import jwt from "jsonwebtoken";

import {
  __resetSocketAuthDependencies,
  __setSocketAuthDependencies,
  authenticateSocket,
  disconnectAuthenticatedUserSockets,
  getSocketToken,
  handleAuthenticatedConnection,
  initSocket,
  joinAuthenticatedUserRoom,
  socketAuthMiddleware,
} from "./socket.js";
import Notification from "./models/Notification.js";
import { signAccessTokenForUser } from "./services/auth/accessTokenService.js";
import {
  __notificationServiceTestHooks,
  createNotification,
} from "./services/notification/notificationService.js";
import { createServerLifecycleService } from "./services/serverLifecycleService.js";

const originalJwtSecret = process.env.JWT_SECRET;
const jwtSecret = "socket-test-secret";
const tokenUserId = "64d000000000000000000001";
const trustedUserId = "64d000000000000000000002";

function createSocket({
  authToken,
  authorization,
  userId,
  auth = {},
} = {}) {
  const handlers = {};
  const joinedRooms = [];

  return {
    userId,
    handlers,
    joinedRooms,
    emittedEvents: [],
    disconnected: [],
    handshake: {
      auth: authToken === undefined ? auth : { ...auth, token: authToken },
      headers: authorization === undefined ? {} : { authorization },
    },
    join(room) {
      joinedRooms.push(room);
    },
    on(eventName, handler) {
      handlers[eventName] = handler;
    },
    off(eventName, handler) {
      if (handlers[eventName] === handler) {
        delete handlers[eventName];
      }
    },
    emit(eventName, payload) {
      this.emittedEvents.push([eventName, payload]);
    },
    disconnect(force) {
      this.disconnected.push(force);
    },
  };
}

function signVersionedToken({ id = tokenUserId, authVersion = 0 } = {}) {
  process.env.JWT_SECRET = jwtSecret;
  return signAccessTokenForUser({ _id: id, authVersion });
}

function signRawToken(payload, options) {
  process.env.JWT_SECRET = jwtSecret;
  return jwt.sign(payload, jwtSecret, options);
}

function installUserLookup({
  user = { _id: tokenUserId, authVersion: 0 },
  error,
  captures = {},
} = {}) {
  __setSocketAuthDependencies({
    User: {
      findById(userId) {
        captures.findById = userId;
        return {
          async select(selection) {
            captures.selection = selection;
            if (error) throw error;
            return user;
          },
        };
      },
    },
  });
  return captures;
}

async function runSocketMiddleware(socket) {
  const calls = [];

  await socketAuthMiddleware(socket, (error) => {
    calls.push(error);
  });

  assert.equal(calls.length, 1);
  return calls[0];
}

async function assertSocketAuthFailure(socket) {
  const error = await runSocketMiddleware(socket);

  assert.ok(error instanceof Error);
  assert.equal(error.message, "Not authorized");
  assert.deepEqual(error.data, { code: "SOCKET_AUTH_REQUIRED" });
}

afterEach(() => {
  __resetSocketAuthDependencies();
  __notificationServiceTestHooks.resetGetIO();
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

function createSharedSocketAdapterHarness() {
  const servers = [];
  const broadcast = (origin, room, operation) => {
    for (const server of servers) {
      if (
        server !== origin &&
        (!origin.sharedAdapterInstalled || !server.sharedAdapterInstalled)
      ) {
        continue;
      }
      for (const socket of server.sockets) {
        if (socket.joinedRooms.includes(room)) operation(socket, server);
      }
    }
  };
  const disconnectReachableSockets = (origin, force) => {
    for (const server of servers) {
      if (
        server !== origin &&
        (!origin.sharedAdapterInstalled || !server.sharedAdapterInstalled)
      ) {
        continue;
      }
      for (const socket of [...server.sockets]) {
        socket.disconnect(force);
        server.sockets.delete(socket);
      }
    }
  };

  const createServer = (name) => {
    const server = {
      name,
      sockets: new Set(),
      adapter() {
        this.sharedAdapterInstalled = true;
      },
      use(handler) {
        this.middleware = handler;
      },
      on(eventName, handler) {
        if (eventName === "connection") this.connectionHandler = handler;
      },
      connect(socket) {
        this.sockets.add(socket);
        this.connectionHandler(socket);
      },
      get local() {
        return {
          disconnectSockets(force) {
            server.lifecycleCalls.push("local-disconnect");
            for (const socket of [...server.sockets]) {
              socket.disconnect(force);
              server.sockets.delete(socket);
            }
          },
        };
      },
      lifecycleCalls: [],
      disconnectSockets(force) {
        disconnectReachableSockets(server, force);
      },
      close(callback) {
        this.lifecycleCalls.push("socket-close");
        callback?.();
      },
      to(room) {
        return {
          emit(eventName, payload) {
            broadcast(server, room, (socket) => socket.emit(eventName, payload));
          },
        };
      },
      in(room) {
        return {
          disconnectSockets(force) {
            broadcast(server, room, (socket, targetServer) => {
              socket.disconnect(force);
              targetServer.sockets.delete(socket);
            });
          },
        };
      },
    };
    servers.push(server);
    return server;
  };

  return { createServer };
}

test("getSocketToken uses only trimmed handshake auth token", () => {
  const token = signVersionedToken();

  assert.equal(
    getSocketToken(createSocket({ authToken: `  ${token}  ` })),
    token
  );
  assert.equal(
    getSocketToken(createSocket({ authorization: "Bearer header-token" })),
    null
  );
  assert.equal(getSocketToken(createSocket({ authToken: "" })), null);
  assert.equal(getSocketToken(createSocket({ authToken: "  " })), null);
  assert.equal(getSocketToken(createSocket({ authToken: 42 })), null);
  assert.equal(getSocketToken(createSocket({ authToken: ["token"] })), null);
  assert.equal(getSocketToken(createSocket({ authToken: { token: "x" } })), null);
});

test("Socket.IO installs the shared Redis adapter with the configured channel key", () => {
  const calls = [];
  const fakeIo = {
    adapter(adapter) {
      calls.push(["adapter", adapter]);
    },
    use(handler) {
      calls.push(["use", handler]);
    },
    on(eventName, handler) {
      calls.push(["on", eventName, handler]);
    },
  };
  const pubClient = {};
  const subClient = {};
  const adapter = { shared: true };
  __setSocketAuthDependencies({
    createSocketServer: () => fakeIo,
    createSocketAdapter: (pub, sub, options) => {
      assert.equal(pub, pubClient);
      assert.equal(sub, subClient);
      assert.deepEqual(options, { key: "hairbook:test:socket.io" });
      return adapter;
    },
    getSocketAdapterClients: () => ({ pubClient, subClient }),
    getSocketAdapterKey: () => "hairbook:test:socket.io",
    isRedisReady: () => true,
    isRedisRequired: () => true,
  });

  assert.equal(initSocket({}), fakeIo);
  assert.deepEqual(calls.map(([name]) => name), ["adapter", "use", "on"]);
  assert.equal(calls[0][1], adapter);
});

test("required Redis unavailability prevents Socket.IO startup without exposing connection data", () => {
  __setSocketAuthDependencies({
    createSocketServer: () => ({ adapter() {}, use() {}, on() {} }),
    isRedisReady: () => false,
    isRedisRequired: () => true,
  });

  assert.throws(() => initSocket({}), (error) =>
    error instanceof Error && error.message === "Redis is unavailable"
  );
});

test("partial initSocket failure registers awaited candidate cleanup ahead of Redis", async () => {
  const calls = [];
  const listeners = new Map();
  let releaseCleanup;
  const cleanupGate = new Promise((resolve) => {
    releaseCleanup = resolve;
  });
  const httpServer = {
    close(callback) {
      calls.push("http");
      callback?.();
      return this;
    },
  };
  const candidate = {
    adapter() {},
    use() {},
    on(eventName, handler) {
      listeners.set(eventName, handler);
      throw new Error("rediss://user:secret@cache.internal/0 EVAL private-payload");
    },
    async close(callback) {
      calls.push("socket:start");
      await cleanupGate;
      listeners.clear();
      await new Promise((resolve) => {
        httpServer.close((error) => {
          calls.push("socket:finish");
          callback?.(error);
          resolve();
        });
      });
    },
  };
  __setSocketAuthDependencies({
    createSocketServer: () => candidate,
    createSocketAdapter: () => ({ shared: true }),
    getSocketAdapterClients: () => ({ pubClient: {}, subClient: {} }),
    isRedisReady: () => true,
    isRedisRequired: () => true,
  });

  assert.throws(
    () => initSocket(httpServer),
    (error) => error.message === "Socket initialization failed" && !error.message.includes("secret")
  );
  assert.equal(listeners.has("connection"), true);

  const lifecycle = createServerLifecycleService({
    stopBookingReminderSchedulerFn: async () => {},
    stopWaitlistExpirationSchedulerFn: async () => {},
    stopSubscriptionExpirationSchedulerFn: async () => {},
    closeSocketServerFn: async () => calls.push("global-socket"),
    shutdownRedisFn: async () => calls.push("redis"),
    disconnectDatabaseFn: async () => calls.push("db"),
  });
  lifecycle.configure({ server: httpServer });
  const firstShutdown = lifecycle.shutdown("startup_failure");
  const secondShutdown = lifecycle.shutdown("startup_failure");
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, ["socket:start"]);
  assert.equal(calls.includes("redis"), false);
  releaseCleanup();

  assert.deepEqual(await firstShutdown, { ok: true, exitCode: 0 });
  assert.deepEqual(await secondShutdown, { ok: true, exitCode: 0 });
  assert.deepEqual(calls, [
    "socket:start",
    "http",
    "socket:finish",
    "global-socket",
    "redis",
    "db",
  ]);
  assert.equal(listeners.size, 0);
  assert.equal(calls.filter((entry) => entry === "socket:start").length, 1);
});

test("shared adapter semantics deliver remote room emits and auth revocation across instances", () => {
  const cluster = createSharedSocketAdapterHarness();
  const instanceA = cluster.createServer("A");
  const instanceB = cluster.createServer("B");
  const commonDependencies = {
    createSocketAdapter: () => ({ shared: true }),
    getSocketAdapterClients: () => ({ pubClient: {}, subClient: {} }),
    isRedisReady: () => true,
    isRedisRequired: () => true,
  };

  __setSocketAuthDependencies({ ...commonDependencies, createSocketServer: () => instanceA });
  initSocket({});
  __setSocketAuthDependencies({ ...commonDependencies, createSocketServer: () => instanceB });
  initSocket({});

  const remoteSocket = createSocket({ userId: "remote-user" });
  remoteSocket.accessTokenExpiresAt = Date.now() + 60_000;
  const unrelatedSocket = createSocket({ userId: "unrelated-user" });
  unrelatedSocket.accessTokenExpiresAt = Date.now() + 60_000;
  instanceB.connect(remoteSocket);
  instanceB.connect(unrelatedSocket);

  instanceA.to("user:remote-user").emit("booking:updated", { id: "booking-1" });
  assert.deepEqual(remoteSocket.emittedEvents, [
    ["booking:updated", { id: "booking-1" }],
  ]);

  __setSocketAuthDependencies({ getIO: () => instanceA });
  assert.deepEqual(disconnectAuthenticatedUserSockets("remote-user"), {
    ok: true,
    room: "user:remote-user",
    disconnected: true,
  });
  assert.deepEqual(remoteSocket.emittedEvents[1], [
    "auth:refresh-required",
    { code: "SOCKET_AUTH_REQUIRED" },
  ]);
  assert.deepEqual(remoteSocket.disconnected, [true]);
  assert.deepEqual(unrelatedSocket.disconnected, []);

  instanceA.to("user:unrelated-user").emit("booking:updated", { id: "booking-2" });
  assert.deepEqual(unrelatedSocket.emittedEvents, [
    ["booking:updated", { id: "booking-2" }],
  ]);
  assert.equal(remoteSocket.emittedEvents.some(([, payload]) => payload?.id === "booking-2"), false);
});

test("lifecycle shutdown is local while explicit auth revocation remains cross-instance", async () => {
  const cluster = createSharedSocketAdapterHarness();
  const instanceA = cluster.createServer("A");
  const instanceB = cluster.createServer("B");
  const commonDependencies = {
    createSocketAdapter: () => ({ shared: true }),
    getSocketAdapterClients: () => ({ pubClient: {}, subClient: {} }),
    isRedisReady: () => true,
    isRedisRequired: () => true,
  };
  __setSocketAuthDependencies({ ...commonDependencies, createSocketServer: () => instanceA });
  initSocket({});
  __setSocketAuthDependencies({ ...commonDependencies, createSocketServer: () => instanceB });
  initSocket({});

  const localSocket = createSocket({ userId: "local-user" });
  const remoteTarget = createSocket({ userId: "remote-target" });
  const remoteUnrelated = createSocket({ userId: "remote-unrelated" });
  for (const socket of [localSocket, remoteTarget, remoteUnrelated]) {
    socket.accessTokenExpiresAt = Date.now() + 60_000;
  }
  instanceA.connect(localSocket);
  instanceB.connect(remoteTarget);
  instanceB.connect(remoteUnrelated);

  __setSocketAuthDependencies({ getIO: () => instanceA });
  disconnectAuthenticatedUserSockets("remote-target");
  assert.deepEqual(remoteTarget.disconnected, [true]);
  assert.deepEqual(remoteUnrelated.disconnected, []);

  const calls = [];
  instanceA.lifecycleCalls = calls;
  const lifecycle = createServerLifecycleService({
    stopBookingReminderSchedulerFn: async () => {},
    stopWaitlistExpirationSchedulerFn: async () => {},
    stopSubscriptionExpirationSchedulerFn: async () => {},
    closeHttpServerFn: async () => {},
    shutdownRedisFn: async () => calls.push("redis"),
    disconnectDatabaseFn: async () => calls.push("db"),
  });
  lifecycle.configure({ socketServer: instanceA });

  const [first, second] = await Promise.all([
    lifecycle.shutdown("SIGTERM"),
    lifecycle.shutdown("SIGTERM"),
  ]);

  assert.deepEqual(first, { ok: true, exitCode: 0 });
  assert.deepEqual(second, first);
  assert.deepEqual(localSocket.disconnected, [true]);
  assert.deepEqual(remoteUnrelated.disconnected, []);
  assert.deepEqual(calls, ["local-disconnect", "socket-close", "redis", "db"]);

  instanceB.to("user:remote-unrelated").emit("booking:updated", { id: "booking-after-shutdown" });
  assert.deepEqual(remoteUnrelated.emittedEvents, [
    ["booking:updated", { id: "booking-after-shutdown" }],
  ]);
});

test("cross-instance notification delivery persists and emits exactly once", async () => {
  const cluster = createSharedSocketAdapterHarness();
  const instanceA = cluster.createServer("A");
  const instanceB = cluster.createServer("B");
  const commonDependencies = {
    createSocketAdapter: () => ({ shared: true }),
    getSocketAdapterClients: () => ({ pubClient: {}, subClient: {} }),
    isRedisReady: () => true,
    isRedisRequired: () => true,
  };
  __setSocketAuthDependencies({ ...commonDependencies, createSocketServer: () => instanceA });
  initSocket({});
  __setSocketAuthDependencies({ ...commonDependencies, createSocketServer: () => instanceB });
  initSocket({});
  const recipient = createSocket({ userId: "recipient-user" });
  recipient.accessTokenExpiresAt = Date.now() + 60_000;
  instanceA.connect(recipient);

  const originalCreate = Notification.create;
  let persistenceCount = 0;
  Notification.create = async (payload) => {
    persistenceCount += 1;
    return { toObject: () => ({ _id: "notification-1", ...payload }) };
  };
  __notificationServiceTestHooks.setGetIO(() => instanceB);

  try {
    await createNotification({
      userId: "recipient-user",
      type: "booking_update",
      message: "Booking updated",
    });
  } finally {
    Notification.create = originalCreate;
  }

  assert.equal(persistenceCount, 1);
  assert.equal(recipient.emittedEvents.length, 1);
  assert.equal(recipient.emittedEvents[0][0], "notification");
});

test("socket handshake verifies token, loads fresh authVersion, and trusts fetched user identity", async () => {
  const captures = installUserLookup({
    user: { _id: trustedUserId, authVersion: 4 },
  });
  const socket = createSocket({
    authToken: signVersionedToken({ authVersion: 4 }),
    auth: { userId: "forged-user", role: "admin", room: "user:forged" },
  });

  const result = await authenticateSocket(socket);

  assert.equal(captures.findById, tokenUserId);
  assert.equal(captures.selection, "-password +authVersion");
  assert.equal(socket.userId, trustedUserId);
  assert.equal(result.userId, trustedUserId);
  assert.ok(Number.isInteger(socket.accessTokenExpiresAt));
  assert.equal(socket.password, undefined);
  assert.equal(socket.authVersion, undefined);
  assert.equal(socket.token, undefined);
});

test("socket middleware succeeds once for a valid matching user", async () => {
  installUserLookup({ user: { _id: tokenUserId, authVersion: 0 } });
  const socket = createSocket({ authToken: signVersionedToken() });

  const error = await runSocketMiddleware(socket);

  assert.equal(error, undefined);
  assert.equal(socket.userId, tokenUserId);
});

test("Authorization header is ignored even when it contains a valid token", async () => {
  installUserLookup();

  await assertSocketAuthFailure(createSocket({
    authorization: `Bearer ${signVersionedToken()}`,
  }));
});

test("missing, blank, and non-string handshake tokens fail generically", async () => {
  for (const authToken of [undefined, "", "  ", 7, [], { token: "x" }]) {
    await assertSocketAuthFailure(createSocket({ authToken }));
  }
});

test("legacy or malformed authVersion access tokens fail generically", async () => {
  installUserLookup();
  const exp = Math.floor(Date.now() / 1000) + 60;

  for (const payload of [
    { id: tokenUserId, exp },
    { id: tokenUserId, av: -1, exp },
    { id: tokenUserId, av: 1.5, exp },
    { id: tokenUserId, av: "0", exp },
    { id: tokenUserId, av: null, exp },
  ]) {
    await assertSocketAuthFailure(createSocket({ authToken: signRawToken(payload) }));
  }
});

test("missing, malformed, non-positive, and expired exp fail generically", async () => {
  installUserLookup();
  const goodToken = signVersionedToken();

  await assertSocketAuthFailure(createSocket({
    authToken: signRawToken({ id: tokenUserId, av: 0 }),
  }));
  await assertSocketAuthFailure(createSocket({
    authToken: jwt.sign({ id: tokenUserId, av: 0, exp: 0 }, jwtSecret),
  }));
  await assertSocketAuthFailure(createSocket({
    authToken: jwt.sign({ id: tokenUserId, av: 0 }, jwtSecret, { expiresIn: -1 }),
  }));

  __setSocketAuthDependencies({
    verifyAccessToken: () => ({ id: tokenUserId, av: 0, exp: "soon" }),
  });
  await assertSocketAuthFailure(createSocket({ authToken: goodToken }));
});

test("invalid signature and missing secret fail generically", async () => {
  installUserLookup();

  await assertSocketAuthFailure(createSocket({
    authToken: jwt.sign({ id: tokenUserId, av: 0, exp: Math.floor(Date.now() / 1000) + 60 }, "other-secret"),
  }));

  const token = signVersionedToken();
  delete process.env.JWT_SECRET;
  await assertSocketAuthFailure(createSocket({ authToken: token }));
});

test("missing user, mismatched version, malformed database version, and database errors fail generically", async () => {
  for (const setup of [
    { user: null },
    { user: { _id: tokenUserId, authVersion: 2 } },
    { user: { _id: tokenUserId, authVersion: "0" } },
    { error: new Error("database unavailable") },
  ]) {
    installUserLookup(setup);
    await assertSocketAuthFailure(createSocket({ authToken: signVersionedToken() }));
  }
});

test("socket authentication failures do not log token or secret values", async () => {
  installUserLookup({ error: new Error("database unavailable") });
  const calls = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args) => calls.push(args);
  console.warn = (...args) => calls.push(args);

  try {
    await assertSocketAuthFailure(createSocket({ authToken: signVersionedToken() }));
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }

  assert.deepEqual(calls, []);
});

test("joinAuthenticatedUserRoom joins only the authenticated user's room", () => {
  const authenticatedSocket = createSocket({ userId: "user-a" });
  const anonymousSocket = createSocket();

  assert.equal(joinAuthenticatedUserRoom(authenticatedSocket), "user:user-a");
  assert.deepEqual(authenticatedSocket.joinedRooms, ["user:user-a"]);
  assert.equal(joinAuthenticatedUserRoom(anonymousSocket), null);
  assert.deepEqual(anonymousSocket.joinedRooms, []);
});

test("handleAuthenticatedConnection rejoins only the verified user's room", () => {
  const futureExpirySocket = createSocket({
    userId: "user-a",
    authToken: "secret-token",
  });
  futureExpirySocket.accessTokenExpiresAt = Date.now() + 60_000;

  handleAuthenticatedConnection(futureExpirySocket);

  assert.deepEqual(Object.keys(futureExpirySocket.handlers).sort(), [
    "disconnect",
    "join",
  ]);
  assert.equal(futureExpirySocket.handlers.join.length, 0);
  assert.deepEqual(futureExpirySocket.joinedRooms, ["user:user-a"]);

  futureExpirySocket.handlers.join({
    userId: "user-b",
    token: "forged-token",
    room: "user:user-c",
  });
  futureExpirySocket.handlers.join("user:user-d");

  assert.deepEqual(futureExpirySocket.joinedRooms, [
    "user:user-a",
    "user:user-a",
    "user:user-a",
  ]);
  assert.deepEqual(futureExpirySocket.emittedEvents, []);
  assert.deepEqual(futureExpirySocket.disconnected, []);
});
