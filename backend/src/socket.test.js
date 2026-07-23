import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import jwt from "jsonwebtoken";

import {
  __resetSocketAuthDependencies,
  __setSocketAuthDependencies,
  authenticateSocket,
  getSocketToken,
  handleAuthenticatedConnection,
  joinAuthenticatedUserRoom,
  socketAuthMiddleware,
} from "./socket.js";
import { signAccessTokenForUser } from "./services/auth/accessTokenService.js";

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
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

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
