import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const ioMock = vi.hoisted(() => vi.fn());

vi.mock("socket.io-client", () => ({
  io: ioMock,
}));

function createFakeSocket(label) {
  const handlers = new Map();

  return {
    label,
    auth: {},
    connected: false,
    connect: vi.fn(function connect() {
      this.connected = true;
    }),
    disconnect: vi.fn(function disconnect() {
      this.connected = false;
    }),
    on: vi.fn((eventName, handler) => {
      handlers.set(eventName, handler);
    }),
    off: vi.fn((eventName, handler) => {
      if (handlers.get(eventName) === handler) {
        handlers.delete(eventName);
      }
    }),
    emitLocal(eventName, payload) {
      handlers.get(eventName)?.(payload);
    },
  };
}

async function importSocketModule() {
  vi.resetModules();
  return import("./socket");
}

beforeEach(() => {
  ioMock.mockReset();
});

afterEach(async () => {
  const socketModule = await importSocketModule();
  socketModule.disconnectSocket();
  vi.restoreAllMocks();
});

describe("Socket.IO client contracts", () => {
  test("never reads browser storage for socket credentials", async () => {
    const storageGet = vi.spyOn(Storage.prototype, "getItem");
    const fakeSocket = createFakeSocket("explicit");
    ioMock.mockReturnValue(fakeSocket);
    const socketModule = await importSocketModule();

    expect(socketModule.connectSocket(" user-1 ", " token-1 ")).toBe(fakeSocket);

    expect(storageGet).not.toHaveBeenCalled();
    expect(ioMock.mock.calls[0][1].auth).toEqual({ token: "token-1" });
  });

  test.each([
    ["missing user", null, "token-1"],
    ["blank user", "  ", "token-1"],
    ["non-string user", 42, "token-1"],
    ["missing token", "user-1", undefined],
    ["blank token", "user-1", "  "],
    ["non-string token", "user-1", { token: "token-1" }],
  ])("%s returns null without creating a socket", async (_label, userId, token) => {
    const socketModule = await importSocketModule();

    expect(socketModule.connectSocket(userId, token)).toBeNull();
    expect(ioMock).not.toHaveBeenCalled();
  });

  test("uses the explicit handshake token, connects once, and exposes the socket", async () => {
    const fakeSocket = createFakeSocket("explicit");
    ioMock.mockReturnValue(fakeSocket);
    const socketModule = await importSocketModule();

    expect(socketModule.connectSocket("user-1", "token-1")).toBe(fakeSocket);

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(ioMock.mock.calls[0][1]).toEqual({
      autoConnect: false,
      auth: { token: "token-1" },
    });
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
    expect(socketModule.getSocket()).toBe(fakeSocket);
  });

  test("same userId and token reuses the socket without reconnecting", async () => {
    const fakeSocket = createFakeSocket("same");
    ioMock.mockReturnValue(fakeSocket);
    const socketModule = await importSocketModule();

    expect(socketModule.connectSocket("user-1", "token-1")).toBe(fakeSocket);
    expect(socketModule.connectSocket("user-1", "token-1")).toBe(fakeSocket);

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
    expect(fakeSocket.disconnect).not.toHaveBeenCalled();
  });

  test("exact auth connect_error notifies once and generic failures are ignored", async () => {
    const fakeSocket = createFakeSocket("auth-error");
    const subscriber = vi.fn();
    ioMock.mockReturnValue(fakeSocket);
    const socketModule = await importSocketModule();
    const unsubscribe = socketModule.subscribeToSocketAuthFailures(subscriber);

    socketModule.connectSocket("user-1", "token-1");
    fakeSocket.emitLocal("connect_error", { data: { code: "SOCKET_AUTH_REQUIRED" } });
    fakeSocket.emitLocal("connect_error", { message: "transport error" });

    expect(subscriber).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  test("valid auth refresh event notifies and malformed auth events are ignored", async () => {
    const fakeSocket = createFakeSocket("refresh-required");
    const subscriber = vi.fn();
    ioMock.mockReturnValue(fakeSocket);
    const socketModule = await importSocketModule();
    const unsubscribe = socketModule.subscribeToSocketAuthFailures(subscriber);

    socketModule.connectSocket("user-1", "token-1");
    fakeSocket.emitLocal("auth:refresh-required", { code: "SOCKET_AUTH_REQUIRED" });
    fakeSocket.emitLocal("auth:refresh-required", { code: "OTHER" });
    fakeSocket.emitLocal("disconnect", "transport close");
    fakeSocket.emitLocal("disconnect", "io client disconnect");

    expect(subscriber).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  test("same userId and new token reauthenticates the same socket and keeps internal listeners once", async () => {
    const fakeSocket = createFakeSocket("same-user");
    const subscriber = vi.fn();
    ioMock.mockReturnValue(fakeSocket);
    const socketModule = await importSocketModule();
    const unsubscribe = socketModule.subscribeToSocketAuthFailures(subscriber);

    expect(socketModule.connectSocket("user-1", "token-1")).toBe(fakeSocket);
    const connectErrorHandler = fakeSocket.on.mock.calls.find(([name]) => name === "connect_error")[1];
    const refreshRequiredHandler = fakeSocket.on.mock.calls.find(
      ([name]) => name === "auth:refresh-required"
    )[1];

    expect(socketModule.connectSocket("user-1", "token-2")).toBe(fakeSocket);
    connectErrorHandler({ data: { code: "SOCKET_AUTH_REQUIRED" } });
    refreshRequiredHandler({ code: "SOCKET_AUTH_REQUIRED" });

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(fakeSocket.auth).toEqual({ token: "token-2" });
    expect(fakeSocket.on).toHaveBeenCalledTimes(2);
    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(fakeSocket.connect).toHaveBeenCalledTimes(2);
    expect(subscriber).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  test("changed userId disconnects old socket, detaches listeners, and old events become inert", async () => {
    const firstSocket = createFakeSocket("first");
    const secondSocket = createFakeSocket("second");
    const subscriber = vi.fn();
    ioMock.mockReturnValueOnce(firstSocket).mockReturnValueOnce(secondSocket);
    const socketModule = await importSocketModule();
    const unsubscribe = socketModule.subscribeToSocketAuthFailures(subscriber);

    socketModule.connectSocket("user-1", "token-1");
    const oldHandler = firstSocket.on.mock.calls.find(([name]) => name === "connect_error")[1];

    socketModule.connectSocket("user-2", "token-2");
    oldHandler({ data: { code: "SOCKET_AUTH_REQUIRED" } });
    secondSocket.emitLocal("connect_error", { data: { code: "SOCKET_AUTH_REQUIRED" } });

    expect(firstSocket.off).toHaveBeenCalledTimes(2);
    expect(firstSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(secondSocket.connect).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  test("disconnect cleanup and unsubscribe are exact and repeat-safe", async () => {
    const fakeSocket = createFakeSocket("cleanup");
    const subscriber = vi.fn();
    ioMock.mockReturnValue(fakeSocket);
    const socketModule = await importSocketModule();
    const unsubscribe = socketModule.subscribeToSocketAuthFailures(subscriber);

    socketModule.connectSocket("user-1", "token-1");
    unsubscribe();
    unsubscribe();
    socketModule.disconnectSocket();
    socketModule.disconnectSocket();
    fakeSocket.emitLocal("connect_error", { data: { code: "SOCKET_AUTH_REQUIRED" } });

    expect(fakeSocket.off).toHaveBeenCalledTimes(2);
    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(subscriber).not.toHaveBeenCalled();
    expect(socketModule.getSocket()).toBeNull();
  });

  test("subscriber rejection stays bounded without unhandled rejections", async () => {
    const fakeSocket = createFakeSocket("bounded");
    const rejectionHandler = vi.fn();
    ioMock.mockReturnValue(fakeSocket);
    const socketModule = await importSocketModule();
    const unsubscribe = socketModule.subscribeToSocketAuthFailures(() =>
      Promise.reject(new Error("refresh failed"))
    );

    process.once("unhandledRejection", rejectionHandler);
    socketModule.connectSocket("user-1", "token-1");
    fakeSocket.emitLocal("connect_error", { data: { code: "SOCKET_AUTH_REQUIRED" } });
    await Promise.resolve();

    expect(rejectionHandler).not.toHaveBeenCalled();

    process.removeListener("unhandledRejection", rejectionHandler);
    unsubscribe();
  });

  test("deferred release disconnects after true unmount and immediate reconnect cancels it", async () => {
    const fakeSocket = createFakeSocket("deferred");
    ioMock.mockReturnValue(fakeSocket);
    const socketModule = await importSocketModule();

    socketModule.connectSocket("user-1", "token-1");
    socketModule.scheduleSocketDisconnect();
    socketModule.connectSocket("user-1", "token-1");
    await Promise.resolve();

    expect(fakeSocket.disconnect).not.toHaveBeenCalled();

    socketModule.scheduleSocketDisconnect();
    await Promise.resolve();

    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(socketModule.getSocket()).toBeNull();
  });
});
