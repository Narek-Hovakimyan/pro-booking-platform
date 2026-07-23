import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : undefined);

let socket;
let activeUserId;
let activeToken;
let pendingDisconnect = false;

function normalizeCredential(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function connectSocket(userId, token) {
  const normalizedUserId = normalizeCredential(userId);
  const normalizedToken = normalizeCredential(token);

  pendingDisconnect = false;

  if (!normalizedUserId || !normalizedToken) return null;

  if (socket && activeUserId === normalizedUserId && activeToken === normalizedToken) {
    return socket;
  }

  if (socket && activeUserId === normalizedUserId) {
    activeToken = normalizedToken;
    socket.auth = { token: normalizedToken };
    socket.disconnect();
    socket.connect();
    return socket;
  }

  disconnectSocket();

  activeUserId = normalizedUserId;
  activeToken = normalizedToken;
  socket = io(SOCKET_URL, {
    autoConnect: false,
    auth: { token: normalizedToken },
  });

  socket.connect();

  return socket;
}

export function disconnectSocket() {
  pendingDisconnect = false;

  if (socket) {
    socket.disconnect();
  }

  socket = null;
  activeUserId = null;
  activeToken = null;
}

export function scheduleSocketDisconnect() {
  pendingDisconnect = true;

  queueMicrotask(() => {
    if (pendingDisconnect) {
      disconnectSocket();
    }
  });
}

export function getSocket() {
  return socket;
}
