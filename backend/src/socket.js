import { Server } from "socket.io";
import jwt from "jsonwebtoken";

let io;

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
  return socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");
}

export function getAuthenticatedSocketUserId(socket) {
  const token = getSocketToken(socket);

  if (!token || !process.env.JWT_SECRET) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?.id ? String(decoded.id) : null;
  } catch {
    return null;
  }
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

  io.use((socket, next) => {
    const userId = getAuthenticatedSocketUserId(socket);

    if (!userId) {
      return next(new Error("Not authorized"));
    }

    socket.userId = userId;
    return next();
  });

  io.on("connection", handleAuthenticatedConnection);

  return io;
}

export function getIO() {
  return io;
}
