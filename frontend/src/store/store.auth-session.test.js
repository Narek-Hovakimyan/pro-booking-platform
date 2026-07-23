import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const loadStateMock = vi.fn();
const saveStateMock = vi.fn();
const configureHandlersMock = vi.fn();

vi.mock("./localStorage", () => ({
  loadState: loadStateMock,
  saveState: saveStateMock,
}));

vi.mock("@/shared/api/authSession", () => ({
  configureAuthSessionHandlers: configureHandlersMock,
}));

async function importStoreModule() {
  vi.resetModules();
  return import("./store");
}

describe("store auth-session bridge", () => {
  beforeEach(() => {
    loadStateMock.mockReset();
    saveStateMock.mockReset();
    configureHandlersMock.mockReset();
  });

  afterEach(async () => {
    const tokenStore = await import("@/shared/auth/accessTokenStore");
    tokenStore.clearAccessToken();
  });

  test("initializes memory from persisted auth and wires silent refresh handlers", async () => {
    loadStateMock.mockReturnValue({
      auth: {
        currentUser: { id: "user-1" },
        token: "persisted-token",
        isAuthenticated: true,
      },
    });

    const { store } = await importStoreModule();
    const tokenStore = await import("@/shared/auth/accessTokenStore");

    expect(store.getState().auth.token).toBe("persisted-token");
    expect(tokenStore.getAccessToken()).toBe("persisted-token");
    expect(configureHandlersMock).toHaveBeenCalledTimes(1);
    expect(configureHandlersMock.mock.calls[0][0]).toEqual({
      onRefresh: expect.any(Function),
      onExpire: expect.any(Function),
    });
  });

  test("syncs memory on login, restore, logout, and expiry", async () => {
    loadStateMock.mockReturnValue(undefined);
    const { store } = await importStoreModule();
    const tokenStore = await import("@/shared/auth/accessTokenStore");
    const authSlice = await import("./slices/authSlice");

    store.dispatch(
      authSlice.loginUser({ token: "login-token", user: { id: "user-1" } })
    );
    expect(tokenStore.getAccessToken()).toBe("login-token");

    store.dispatch(
      authSlice.restoreAuthSession({
        token: "refresh-token",
        user: { id: "user-1" },
      })
    );
    expect(tokenStore.getAccessToken()).toBe("refresh-token");

    store.dispatch(authSlice.expireAuthSession());
    expect(tokenStore.getAccessToken()).toBeNull();

    store.dispatch(
      authSlice.registerUser({
        token: "register-token",
        user: { id: "user-2" },
      })
    );
    expect(tokenStore.getAccessToken()).toBe("register-token");

    store.dispatch(authSlice.logoutUser());
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(saveStateMock).toHaveBeenCalled();
  });
});
