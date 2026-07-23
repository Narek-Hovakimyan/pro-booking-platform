import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const postMock = vi.fn();
const createMock = vi.fn(() => ({ post: postMock }));

vi.mock("axios", () => ({
  default: {
    create: createMock,
  },
}));

async function importAuthSession() {
  vi.resetModules();
  return import("./authSession");
}

describe("authSession", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  afterEach(async () => {
    const module = await importAuthSession();
    module.resetAuthSessionHandlers();
  });

  test("shares one refresh promise across concurrent calls and clears it afterwards", async () => {
    let resolveRequest;
    postMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    const module = await importAuthSession();

    const first = module.requestRefreshSession();
    const second = module.requestRefreshSession();

    expect(postMock).toHaveBeenCalledTimes(1);
    resolveRequest({ data: { token: "next-token", user: { id: "user-1" } } });

    await expect(first).resolves.toEqual({
      token: "next-token",
      user: { id: "user-1" },
    });
    await expect(second).resolves.toEqual({
      token: "next-token",
      user: { id: "user-1" },
    });

    postMock.mockResolvedValueOnce({
      data: { token: "another-token", user: { id: "user-1" } },
    });

    await module.requestRefreshSession();
    expect(postMock).toHaveBeenCalledTimes(2);
  });

  test("applies refreshed auth to memory and redux handler, and expires silently", async () => {
    const refreshed = vi.fn();
    const expired = vi.fn();
    const module = await importAuthSession();
    const tokenStore = await import("@/shared/auth/accessTokenStore");

    module.configureAuthSessionHandlers({
      onRefresh: refreshed,
      onExpire: expired,
    });

    await module.applyRefreshedAuthSession({
      token: "fresh-token",
      user: { id: "user-1" },
    });

    expect(tokenStore.getAccessToken()).toBe("fresh-token");
    expect(refreshed).toHaveBeenCalledWith({
      token: "fresh-token",
      user: { id: "user-1" },
    });

    await module.expireCurrentAuthSession();
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  test("rejects malformed refresh responses and leaves memory cleared", async () => {
    postMock.mockResolvedValueOnce({ data: { token: "", user: null } });
    const module = await importAuthSession();
    const tokenStore = await import("@/shared/auth/accessTokenStore");

    await expect(module.requestRefreshSession()).rejects.toMatchObject({
      code: "AUTH_SESSION_INVALID_RESPONSE",
    });
    expect(tokenStore.getAccessToken()).toBeNull();
  });

  test("accepts a refreshed session only when user is a non-null object", async () => {
    postMock.mockResolvedValueOnce({
      data: { token: "valid-token", user: { id: "user-1" } },
    });
    const module = await importAuthSession();

    await expect(module.requestRefreshSession()).resolves.toEqual({
      token: "valid-token",
      user: { id: "user-1" },
    });
  });

  test.each([
    [{ token: "token", user: "x" }],
    [{ token: "token", user: 1 }],
    [{ token: "token", user: true }],
    [{ token: "token", user: [] }],
    [{ token: "token", user: null }],
    [{ token: "token" }],
    [{ token: "   ", user: { id: "user-1" } }],
    [{ token: 123, user: { id: "user-1" } }],
  ])(
    "rejects malformed refreshed session payloads: %j",
    async (data) => {
      postMock.mockResolvedValueOnce({ data });
      const refreshed = vi.fn();
      const module = await importAuthSession();
      const tokenStore = await import("@/shared/auth/accessTokenStore");

      module.configureAuthSessionHandlers({ onRefresh: refreshed });

      await expect(module.requestRefreshSession()).rejects.toMatchObject({
        code: "AUTH_SESSION_INVALID_RESPONSE",
      });
      expect(refreshed).not.toHaveBeenCalled();
      expect(tokenStore.getAccessToken()).toBeNull();
    }
  );

  test("logout uses the bare auth-session client", async () => {
    postMock.mockResolvedValueOnce({ data: {} });
    const module = await importAuthSession();

    await module.requestLogoutSession();

    expect(postMock).toHaveBeenCalledWith("/auth/logout");
  });
});
