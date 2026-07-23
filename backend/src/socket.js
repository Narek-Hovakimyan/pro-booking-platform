import { Server } from "socket.io";

import User from "./models/User.js";
import {
  assertAccessTokenMatchesUser,
  verifyAccessToken,
} from "./services/auth/accessTokenService.js";

let io;
let dependencies = {
  User,
  verifyAccessToken,
  assertAccessTokenMatchesUser,
};

export function __setSocketAuthDependencies(overrides = {}) {
  dependencies = { ...dependencies, ...overrides };
}

export function __resetSocketAuthDependencies() {
  dependencies = {
    User,
    verifyAccessToken,
    assertAccessTokenMatchesUser,
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
  error.data = { code: "SOCKET_AUTH_REQUIRED" };
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
