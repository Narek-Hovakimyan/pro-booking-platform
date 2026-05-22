import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : undefined);

let socket;
let activeUserId;
let activeToken;

function getStoredToken() {
  try {
    const serializedState = localStorage.getItem("hairbook-redux-state");

    if (!serializedState) {
      return null;
    }

    return JSON.parse(serializedState)?.auth?.token ?? null;
  } catch {
    return null;
  }
}

export function connectSocket(userId, token = getStoredToken()) {
  if (!userId || !token) return null;

  if (socket && activeUserId === userId && activeToken === token) {
    return socket;
  }

  disconnectSocket();

  activeUserId = userId;
  activeToken = token;
  socket = io(SOCKET_URL, {
    autoConnect: false,
    auth: { token },
  });

  socket.connect();

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
  }

  socket = null;
  activeUserId = null;
  activeToken = null;
}

export function getSocket() {
  return socket;
}
