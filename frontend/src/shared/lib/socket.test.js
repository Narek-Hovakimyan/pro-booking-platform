import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const STORAGE_KEY = "hairbook-redux-state";

const ioMock = vi.hoisted(() => vi.fn());

vi.mock("socket.io-client", () => ({
  io: ioMock,
}));

function persistToken(token) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ auth: { token, currentUser: { id: "user-1" } } })
  );
}

function createFakeSocket(label) {
  return {
    label,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

async function importSocketModule() {
  vi.resetModules();
  return import("./socket");
}

beforeEach(() => {
  ioMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("Socket.IO client contracts", () => {
  test("missing userId or token returns null without creating a socket", async () => {
    const socketModule = await importSocketModule();

    expect(socketModule.connectSocket(null, "token-1")).toBeNull();
    expect(socketModule.connectSocket("user-1")).toBeNull();
    expect(ioMock).not.toHaveBeenCalled();
  });

  test("malformed or incomplete stored auth returns null without throwing", async () => {
    const socketModule = await importSocketModule();

    localStorage.setItem(STORAGE_KEY, "{not-json");
    expect(socketModule.connectSocket("user-1")).toBeNull();

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { currentUser: { id: "u1" } } }));
    expect(socketModule.connectSocket("user-1")).toBeNull();
    expect(ioMock).not.toHaveBeenCalled();
  });

  test("uses stored token, configures handshake auth, connects once, and exposes the socket", async () => {
    persistToken("stored-token");
    const fakeSocket = createFakeSocket("stored");
    ioMock.mockReturnValue(fakeSocket);
    const socketModule = await importSocketModule();

    expect(socketModule.connectSocket("user-1")).toBe(fakeSocket);

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(ioMock.mock.calls[0][0]).toSatisfy(
      (url) => url === undefined || typeof url === "string"
    );
    expect(ioMock.mock.calls[0][1]).toEqual({
      autoConnect: false,
      auth: { token: "stored-token" },
    });
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
    expect(socketModule.getSocket()).toBe(fakeSocket);
  });

  test("explicit token overrides a different stored token", async () => {
    persistToken("stored-token");
    const fakeSocket = createFakeSocket("explicit");
    ioMock.mockReturnValue(fakeSocket);
    const socketModule = await importSocketModule();

    socketModule.connectSocket("user-1", "explicit-token");

    expect(ioMock.mock.calls[0][1].auth).toEqual({ token: "explicit-token" });
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

  test.each([
    ["changed token", ["user-1", "token-1"], ["user-1", "token-2"]],
    ["changed userId", ["user-1", "token-1"], ["user-2", "token-1"]],
  ])("%s disconnects the old socket and creates a replacement", async (_label, firstArgs, secondArgs) => {
    const firstSocket = createFakeSocket("first");
    const secondSocket = createFakeSocket("second");
    ioMock.mockReturnValueOnce(firstSocket).mockReturnValueOnce(secondSocket);
    const socketModule = await importSocketModule();

    expect(socketModule.connectSocket(...firstArgs)).toBe(firstSocket);
    expect(socketModule.connectSocket(...secondArgs)).toBe(secondSocket);

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
});
