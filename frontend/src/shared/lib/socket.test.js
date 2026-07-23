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
      if (handlers.get(eventName) === handler) handlers.delete(eventName);
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
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
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
    expect(ioMock.mock.calls[0][0]).toSatisfy(
      (url) => url === undefined || typeof url === "string"
    );
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

  test("same userId and new token reauthenticates the same socket and preserves listeners", async () => {
    const fakeSocket = createFakeSocket("same-user");
    ioMock.mockReturnValue(fakeSocket);
    const socketModule = await importSocketModule();
    const handler = vi.fn();

    expect(socketModule.connectSocket("user-1", "token-1")).toBe(fakeSocket);
    fakeSocket.on("notification", handler);

    expect(socketModule.connectSocket("user-1", "token-2")).toBe(fakeSocket);
    fakeSocket.emitLocal("notification", { id: "n1" });

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(fakeSocket.auth).toEqual({ token: "token-2" });
    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(fakeSocket.connect).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith({ id: "n1" });
  });

  test("changed userId disconnects the old socket and creates a replacement", async () => {
    const firstSocket = createFakeSocket("first");
    const secondSocket = createFakeSocket("second");
    ioMock.mockReturnValueOnce(firstSocket).mockReturnValueOnce(secondSocket);
    const socketModule = await importSocketModule();

    expect(socketModule.connectSocket("user-1", "token-1")).toBe(firstSocket);
    expect(socketModule.connectSocket("user-2", "token-2")).toBe(secondSocket);

    expect(firstSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(secondSocket.connect).toHaveBeenCalledTimes(1);
    expect(socketModule.getSocket()).toBe(secondSocket);
  });

  test("disconnectSocket clears the active socket, is repeat-safe, and allows reconnect", async () => {
    const firstSocket = createFakeSocket("first");
    const secondSocket = createFakeSocket("second");
    ioMock.mockReturnValueOnce(firstSocket).mockReturnValueOnce(secondSocket);
    const socketModule = await importSocketModule();

    socketModule.connectSocket("user-1", "token-1");
    socketModule.disconnectSocket();
    socketModule.disconnectSocket();

    expect(firstSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(socketModule.getSocket()).toBeNull();

    expect(socketModule.connectSocket("user-1", "token-1")).toBe(secondSocket);
    expect(secondSocket.connect).toHaveBeenCalledTimes(1);
    expect(ioMock).toHaveBeenCalledTimes(2);
  });

  test("deferred release disconnects after true unmount", async () => {
    const fakeSocket = createFakeSocket("deferred");
    ioMock.mockReturnValue(fakeSocket);
    const socketModule = await importSocketModule();

    socketModule.connectSocket("user-1", "token-1");
    socketModule.scheduleSocketDisconnect();

    expect(fakeSocket.disconnect).not.toHaveBeenCalled();

    await Promise.resolve();

    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(socketModule.getSocket()).toBeNull();
  });

  test("immediate reconnect cancels a deferred release", async () => {
    const fakeSocket = createFakeSocket("strict");
    ioMock.mockReturnValue(fakeSocket);
    const socketModule = await importSocketModule();

    socketModule.connectSocket("user-1", "token-1");
    socketModule.scheduleSocketDisconnect();
    socketModule.connectSocket("user-1", "token-1");

    await Promise.resolve();

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(fakeSocket.disconnect).not.toHaveBeenCalled();
    expect(socketModule.getSocket()).toBe(fakeSocket);
  });
});
