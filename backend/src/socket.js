import { Server } from "socket.io";

import User from "./models/User.js";
import {
  assertAccessTokenMatchesUser,
  verifyAccessToken,
} from "./services/auth/accessTokenService.js";

export const SOCKET_AUTH_REQUIRED_CODE = "SOCKET_AUTH_REQUIRED";
export const SOCKET_AUTH_REFRESH_EVENT = "auth:refresh-required";
export const SOCKET_AUTH_REFRESH_PAYLOAD = { code: SOCKET_AUTH_REQUIRED_CODE };
export const MAX_TIMEOUT_MS = 2_147_483_647;

let io;
let dependencies = {
  User,
  verifyAccessToken,
  assertAccessTokenMatchesUser,
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timer) => clearTimeout(timer),
  getIO: () => io,
};

export function __setSocketAuthDependencies(overrides = {}) {
  dependencies = { ...dependencies, ...overrides };
}

export function __resetSocketAuthDependencies() {
  dependencies = {
    User,
    verifyAccessToken,
    assertAccessTokenMatchesUser,
    now: () => Date.now(),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timer) => clearTimeout(timer),
    getIO: () => io,
  };
}

function getAllowedSocketOrigins() {
  const configuredOrigins = (process.env.CLIENT_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV === "production") {
    return configuredOrigins;
  }

  return [
    ...configuredOrigins,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];
}

export function getSocketToken(socket) {
  const token = socket?.handshake?.auth?.token;

  return typeof token === "string" && token.trim() ? token.trim() : null;
}

function createSocketAuthError() {
  const error = new Error("Not authorized");
  error.data = SOCKET_AUTH_REFRESH_PAYLOAD;
  return error;
}

function assertTokenExpiry(decoded) {
  if (!Number.isInteger(decoded?.exp) || decoded.exp <= 0) {
    throw createSocketAuthError();
  }
}

function getTrustedUserId(user) {
  const userId = user?._id ? String(user._id).trim() : "";

  if (!userId) {
    throw createSocketAuthError();
  }

  return userId;
}

async function findSocketUser(userId) {
  return dependencies.User.findById(userId).select("-password +authVersion");
}

function normalizeSocketExpiry(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function clearSocketExpiryTimer(socket) {
  const lifecycle = socket?._authExpiryLifecycle;

  if (!lifecycle?.timer) {
    return;
  }

  dependencies.clearTimeout(lifecycle.timer);
  lifecycle.timer = null;
}

function disconnectSocketForAuthExpiry(socket, lifecycle) {
  if (!socket || !lifecycle || lifecycle.completed) {
    return false;
  }

  lifecycle.completed = true;
  clearSocketExpiryTimer(socket);
  socket.emit(SOCKET_AUTH_REFRESH_EVENT, SOCKET_AUTH_REFRESH_PAYLOAD);
  socket.disconnect(true);
  return true;
}

function armSocketExpiryTimer(socket, lifecycle) {
  if (!socket || !lifecycle || lifecycle.completed) {
    return;
  }

  clearSocketExpiryTimer(socket);

  const expiresAt = normalizeSocketExpiry(socket.accessTokenExpiresAt);

  if (!expiresAt) {
    disconnectSocketForAuthExpiry(socket, lifecycle);
    return;
  }

  const remainingMs = expiresAt - dependencies.now();

  if (remainingMs <= 0) {
    disconnectSocketForAuthExpiry(socket, lifecycle);
    return;
  }

  const timerGeneration = lifecycle.generation + 1;
  const delay = Math.min(remainingMs, MAX_TIMEOUT_MS);
  lifecycle.generation = timerGeneration;
  lifecycle.timer = dependencies.setTimeout(() => {
    if (
      socket._authExpiryLifecycle !== lifecycle ||
      lifecycle.completed ||
      lifecycle.generation !== timerGeneration
    ) {
      return;
    }

    armSocketExpiryTimer(socket, lifecycle);
  }, delay);

  if (typeof lifecycle.timer?.unref === "function") {
    lifecycle.timer.unref();
  }
}

export function installAuthenticatedSocketLifecycle(socket) {
  const existingLifecycle = socket?._authExpiryLifecycle;

  if (existingLifecycle) {
    existingLifecycle.completed = true;
    clearSocketExpiryTimer(socket);

    if (typeof socket.off === "function" && existingLifecycle.onDisconnect) {
      socket.off("disconnect", existingLifecycle.onDisconnect);
    }
  }

  const lifecycle = {
    completed: false,
    generation: 0,
    timer: null,
    onDisconnect: () => {
      if (socket._authExpiryLifecycle !== lifecycle) {
        return;
      }

      lifecycle.completed = true;
      clearSocketExpiryTimer(socket);
    },
  };

  socket._authExpiryLifecycle = lifecycle;
  socket.on("disconnect", lifecycle.onDisconnect);
  armSocketExpiryTimer(socket, lifecycle);

  return !lifecycle.completed;
}

function normalizeUserId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function disconnectAuthenticatedUserSockets(userId) {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    return { ok: false, room: null, disconnected: false };
  }

  const socketServer = dependencies.getIO();

  if (!socketServer) {
    return { ok: true, room: `user:${normalizedUserId}`, disconnected: false };
  }

  const room = `user:${normalizedUserId}`;
  socketServer.to(room).emit(SOCKET_AUTH_REFRESH_EVENT, SOCKET_AUTH_REFRESH_PAYLOAD);
  socketServer.in(room).disconnectSockets(true);

  return { ok: true, room, disconnected: true };
}

export async function authenticateSocket(socket) {
  const token = getSocketToken(socket);

  if (!token) {
    throw createSocketAuthError();
  }

  const decoded = dependencies.verifyAccessToken(token);
  assertTokenExpiry(decoded);

  const user = await findSocketUser(decoded.id);
  dependencies.assertAccessTokenMatchesUser(decoded, user);

  const userId = getTrustedUserId(user);
  socket.userId = userId;
  socket.accessTokenExpiresAt = decoded.exp * 1000;

  return { userId, expiresAt: socket.accessTokenExpiresAt };
}

export async function socketAuthMiddleware(socket, next) {
  try {
    await authenticateSocket(socket);
  } catch {
    return next(createSocketAuthError());
  }

  return next();
}

export function joinAuthenticatedUserRoom(socket) {
  if (!socket.userId) return null;

  const room = `user:${socket.userId}`;
  socket.join(room);
  return room;
}

export function handleAuthenticatedConnection(socket) {
  if (!installAuthenticatedSocketLifecycle(socket)) {
    return;
  }

  joinAuthenticatedUserRoom(socket);

  socket.on("join", () => {
    joinAuthenticatedUserRoom(socket);
  });
}

export function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: getAllowedSocketOrigins(),
      methods: ["GET", "POST"],
    },
  });

  io.use(socketAuthMiddleware);

  io.on("connection", handleAuthenticatedConnection);

  return io;
}

export function getIO() {
  return io;
}
