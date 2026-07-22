import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import jwt from "jsonwebtoken";

import {
  getAuthenticatedSocketUserId,
  getSocketToken,
  handleAuthenticatedConnection,
  joinAuthenticatedUserRoom,
} from "./socket.js";

const originalJwtSecret = process.env.JWT_SECRET;
const jwtSecret = "socket-test-secret";

const createSocket = ({
  authToken,
  authorization,
  userId,
} = {}) => {
  const handlers = {};
  const joinedRooms = [];

  return {
    userId,
    handlers,
    joinedRooms,
    handshake: {
      auth: authToken === undefined ? {} : { token: authToken },
      headers: authorization === undefined ? {} : { authorization },
    },
    join(room) {
      joinedRooms.push(room);
    },
    on(eventName, handler) {
      handlers[eventName] = handler;
    },
  };
};

afterEach(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

test("getSocketToken prefers handshake auth token over authorization header", () => {
  const socket = createSocket({
    authToken: "auth-token",
    authorization: "Bearer header-token",
  });

  assert.equal(getSocketToken(socket), "auth-token");
});

test("getSocketToken falls back to a case-insensitive Bearer authorization header", () => {
  const socket = createSocket({
    authorization: "bEaReR header-token",
  });

  assert.equal(getSocketToken(socket), "header-token");
});

test("getSocketToken returns the current empty or malformed values without throwing", () => {
  assert.equal(getSocketToken(createSocket()), undefined);
  assert.equal(
    getSocketToken(createSocket({ authorization: "Token raw-value" })),
    "Token raw-value"
  );
  assert.equal(
    getSocketToken(createSocket({ authorization: "" })),
    ""
  );
});

test("getAuthenticatedSocketUserId returns the decoded user id for a valid JWT", () => {
  process.env.JWT_SECRET = jwtSecret;
  const token = jwt.sign({ id: "64d000000000000000000001" }, jwtSecret);

  assert.equal(
    getAuthenticatedSocketUserId(createSocket({ authToken: token })),
    "64d000000000000000000001"
  );
});

test("getAuthenticatedSocketUserId returns null for invalid, expired, missing, or unusable tokens", () => {
  process.env.JWT_SECRET = jwtSecret;
  const expiredToken = jwt.sign(
    { id: "64d000000000000000000001" },
    jwtSecret,
    { expiresIn: -1 }
  );
  const noIdToken = jwt.sign({ role: "barber" }, jwtSecret);

  assert.equal(getAuthenticatedSocketUserId(createSocket({ authToken: "bad-token" })), null);
  assert.equal(getAuthenticatedSocketUserId(createSocket({ authToken: expiredToken })), null);
  assert.equal(getAuthenticatedSocketUserId(createSocket()), null);
  assert.equal(getAuthenticatedSocketUserId(createSocket({ authToken: noIdToken })), null);

  delete process.env.JWT_SECRET;
  const validToken = jwt.sign({ id: "64d000000000000000000001" }, jwtSecret);
  assert.equal(getAuthenticatedSocketUserId(createSocket({ authToken: validToken })), null);
});

test("joinAuthenticatedUserRoom joins only the authenticated user's room", () => {
  const authenticatedSocket = createSocket({ userId: "user-a" });
  const anonymousSocket = createSocket();

  assert.equal(joinAuthenticatedUserRoom(authenticatedSocket), "user:user-a");
  assert.deepEqual(authenticatedSocket.joinedRooms, ["user:user-a"]);
  assert.equal(joinAuthenticatedUserRoom(anonymousSocket), null);
  assert.deepEqual(anonymousSocket.joinedRooms, []);
});

test("handleAuthenticatedConnection joins the authenticated room immediately and on repeated join events", () => {
  const socket = createSocket({ userId: "user-a", authToken: "secret-token" });

  handleAuthenticatedConnection(socket);

  assert.deepEqual(Object.keys(socket.handlers), ["join"]);
  assert.equal(socket.handlers.join.length, 0);
  assert.deepEqual(socket.joinedRooms, ["user:user-a"]);

  socket.handlers.join({ userId: "user-b", token: "forged-token" });
  socket.handlers.join({ room: "user:user-c" });

  assert.deepEqual(socket.joinedRooms, [
    "user:user-a",
    "user:user-a",
    "user:user-a",
  ]);
  assert.equal(socket.joinedRooms.includes("user:user-b"), false);
  assert.equal(socket.joinedRooms.includes("user:user-c"), false);
});

test("handleAuthenticatedConnection does not join rooms for unauthenticated sockets", () => {
  const socket = createSocket();

  handleAuthenticatedConnection(socket);

  assert.deepEqual(Object.keys(socket.handlers), ["join"]);
  assert.deepEqual(socket.joinedRooms, []);

  socket.handlers.join({ userId: "ignored" });

  assert.deepEqual(socket.joinedRooms, []);
});
