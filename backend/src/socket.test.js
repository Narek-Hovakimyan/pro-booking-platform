import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import jwt from "jsonwebtoken";

import {
  getAuthenticatedSocketUserId,
  handleAuthenticatedConnection,
  joinAuthenticatedUserRoom,
} from "./socket.js";

const originalJwtSecret = process.env.JWT_SECRET;
const jwtSecret = "socket-test-secret";

afterEach(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

const createSocket = ({ token, userId } = {}) => {
  const handlers = {};
  const joinedRooms = [];

  return {
    userId,
    joinedRooms,
    handlers,
    handshake: {
      auth: token ? { token } : {},
      headers: {},
    },
    join(room) {
      joinedRooms.push(room);
    },
    on(eventName, handler) {
      handlers[eventName] = handler;
    },
  };
};

test("valid socket token authenticates to decoded user id", () => {
  process.env.JWT_SECRET = jwtSecret;
  const token = jwt.sign({ id: "user-a" }, jwtSecret);
  const socket = createSocket({ token });

  assert.equal(getAuthenticatedSocketUserId(socket), "user-a");
});

test("missing or invalid socket token is rejected", () => {
  process.env.JWT_SECRET = jwtSecret;

  assert.equal(getAuthenticatedSocketUserId(createSocket()), null);
  assert.equal(getAuthenticatedSocketUserId(createSocket({ token: "bad-token" })), null);
});

test("logged-in user joins their own room", () => {
  const socket = createSocket({ userId: "user-a" });

  const room = joinAuthenticatedUserRoom(socket);

  assert.equal(room, "user:user-a");
  assert.deepEqual(socket.joinedRooms, ["user:user-a"]);
});

test("join event payload cannot select another user's room", () => {
  const socket = createSocket({ userId: "user-a" });

  handleAuthenticatedConnection(socket);
  socket.handlers.join({ userId: "user-b" });

  assert.deepEqual(socket.joinedRooms, ["user:user-a", "user:user-a"]);
  assert.equal(socket.joinedRooms.includes("user:user-b"), false);
});
