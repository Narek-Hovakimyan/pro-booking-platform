import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const configureHandlersMock = vi.fn();

vi.mock("@/shared/api/authSession", () => ({
  configureAuthSessionHandlers: configureHandlersMock,
}));

const STORAGE_KEY = "hairbook-redux-state";

async function importFreshStore() {
  vi.resetModules();
  return import("./store");
}

async function flushListeners() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("store auth-session bridge", () => {
  beforeEach(() => {
    configureHandlersMock.mockReset();
    localStorage.clear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const tokenStore = await import("@/shared/auth/accessTokenStore");
    tokenStore.clearAccessToken();
    localStorage.clear();
  });

  test("starts unauthenticated, clears legacy persisted state, and wires refresh handlers", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        auth: {
          currentUser: { id: "legacy-user" },
          token: "legacy-token",
          isAuthenticated: true,
        },
        users: [{ id: "legacy-user", password: "stored-password" }],
      })
    );
    localStorage.setItem("hairbook-language", "hy");

    const { store } = await importFreshStore();
    const tokenStore = await import("@/shared/auth/accessTokenStore");

    expect(store.getState().auth).toEqual({
      currentUser: null,
      token: null,
      isAuthenticated: false,
    });
    expect(store.getState().users).toEqual([]);
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem("hairbook-language")).toBe("hy");
    expect(configureHandlersMock).toHaveBeenCalledTimes(1);
    expect(configureHandlersMock.mock.calls[0][0]).toEqual({
      onRefresh: expect.any(Function),
      onExpire: expect.any(Function),
    });
  });

  test("login, register, restore, logout, and expiry update Redux and memory without storage writes", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const { store } = await importFreshStore();
    const tokenStore = await import("@/shared/auth/accessTokenStore");
    const authSlice = await import("./slices/authSlice");

    store.dispatch(
      authSlice.loginUser({ token: "login-token", user: { id: "user-1" } })
    );
    await flushListeners();
    expect(store.getState().auth).toMatchObject({
      currentUser: { id: "user-1" },
      token: "login-token",
      isAuthenticated: true,
    });
    expect(tokenStore.getAccessToken()).toBe("login-token");

    store.dispatch(
      authSlice.restoreAuthSession({
        token: "refresh-token",
        user: { id: "user-1" },
      })
    );
    await flushListeners();
    expect(store.getState().auth.token).toBe("refresh-token");
    expect(tokenStore.getAccessToken()).toBe("refresh-token");

    store.dispatch(
      authSlice.registerUser({
        token: "register-token",
        user: { id: "user-2" },
      })
    );
    await flushListeners();
    expect(store.getState().auth).toMatchObject({
      currentUser: { id: "user-2" },
      token: "register-token",
      isAuthenticated: true,
    });
    expect(tokenStore.getAccessToken()).toBe("register-token");

    store.dispatch(authSlice.expireAuthSession());
    await flushListeners();
    expect(store.getState().auth).toEqual({
      currentUser: null,
      token: null,
      isAuthenticated: false,
    });
    expect(tokenStore.getAccessToken()).toBeNull();

    store.dispatch(
      authSlice.loginUser({ token: "logout-token", user: { id: "user-3" } })
    );
    await flushListeners();
    store.dispatch(authSlice.logoutUser());
    await flushListeners();
    expect(store.getState().auth).toEqual({
      currentUser: null,
      token: null,
      isAuthenticated: false,
    });
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  test("configured refresh and expire handlers bridge auth session callbacks", async () => {
    const { store } = await importFreshStore();
    const tokenStore = await import("@/shared/auth/accessTokenStore");
    const handlers = configureHandlersMock.mock.calls[0][0];

    handlers.onRefresh({ token: "fresh-token", user: { id: "user-1" } });
    await flushListeners();

    expect(store.getState().auth).toMatchObject({
      currentUser: { id: "user-1" },
      token: "fresh-token",
      isAuthenticated: true,
    });
    expect(tokenStore.getAccessToken()).toBe("fresh-token");

    handlers.onExpire();
    await flushListeners();

    expect(store.getState().auth).toEqual({
      currentUser: null,
      token: null,
      isAuthenticated: false,
    });
    expect(tokenStore.getAccessToken()).toBeNull();
  });
});
