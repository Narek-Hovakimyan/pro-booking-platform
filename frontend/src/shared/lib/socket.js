import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : undefined);
export const SOCKET_AUTH_REQUIRED_CODE = "SOCKET_AUTH_REQUIRED";
export const SOCKET_AUTH_REFRESH_EVENT = "auth:refresh-required";

let socket;
let activeUserId;
let activeToken;
let pendingDisconnectId = 0;
let socketAuthHandlers = null;
const socketAuthFailureSubscribers = new Set();

function normalizeCredential(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isManagedSocket(candidateSocket) {
  return Boolean(socket && candidateSocket && candidateSocket === socket);
}

function notifySocketAuthFailure(candidateSocket) {
  if (!isManagedSocket(candidateSocket)) {
    return;
  }

  socketAuthFailureSubscribers.forEach((subscriber) => {
    try {
      const result = subscriber();

      if (result && typeof result.then === "function") {
        result.catch(() => {});
      }
    } catch {
      // Intentionally ignore subscriber failures so socket listeners stay bounded.
    }
  });
}

function detachSocketAuthHandlers() {
  if (!socketAuthHandlers?.socket) {
    return;
  }

  socketAuthHandlers.socket.off("connect_error", socketAuthHandlers.onConnectError);
  socketAuthHandlers.socket.off(
    SOCKET_AUTH_REFRESH_EVENT,
    socketAuthHandlers.onRefreshRequired
  );
  socketAuthHandlers = null;
}

function attachSocketAuthHandlers(nextSocket) {
  if (!nextSocket || socketAuthHandlers?.socket === nextSocket) {
    return;
  }

  detachSocketAuthHandlers();

  const onConnectError = (error) => {
    if (error?.data?.code === SOCKET_AUTH_REQUIRED_CODE) {
      notifySocketAuthFailure(nextSocket);
    }
  };
  const onRefreshRequired = (payload) => {
    if (payload?.code === SOCKET_AUTH_REQUIRED_CODE) {
      notifySocketAuthFailure(nextSocket);
    }
  };

  nextSocket.on("connect_error", onConnectError);
  nextSocket.on(SOCKET_AUTH_REFRESH_EVENT, onRefreshRequired);
  socketAuthHandlers = { socket: nextSocket, onConnectError, onRefreshRequired };
}

export function connectSocket(userId, token) {
  const normalizedUserId = normalizeCredential(userId);
  const normalizedToken = normalizeCredential(token);

  pendingDisconnectId += 1;

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
  attachSocketAuthHandlers(socket);

  socket.connect();

  return socket;
}

export function disconnectSocket() {
  pendingDisconnectId += 1;

  detachSocketAuthHandlers();

  if (socket) {
    socket.disconnect();
  }

  socket = null;
  activeUserId = null;
  activeToken = null;
}

export function scheduleSocketDisconnect() {
  pendingDisconnectId += 1;
  const scheduledDisconnectId = pendingDisconnectId;

  queueMicrotask(() => {
    if (scheduledDisconnectId === pendingDisconnectId) {
      disconnectSocket();
    }
  });
}

export function subscribeToSocketAuthFailures(subscriber) {
  if (typeof subscriber !== "function") {
    return () => {};
  }

  socketAuthFailureSubscribers.add(subscriber);

  let unsubscribed = false;

  return () => {
    if (unsubscribed) {
      return;
    }

    unsubscribed = true;
    socketAuthFailureSubscribers.delete(subscriber);
  };
}

export function getSocket() {
  return socket;
}
