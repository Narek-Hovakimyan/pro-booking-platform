import { describe, expect, test, vi } from "vitest";

import { createSocketAuthRecovery } from "./socketAuthRecovery";

function createDependencies(overrides = {}) {
  return {
    requestRefreshSession: vi.fn(),
    applyRefreshedAuthSession: vi.fn(),
    expireCurrentAuthSession: vi.fn(),
    getAccessToken: vi.fn(),
    ...overrides,
  };
}

function createCurrentAuthController(initialAuth = {}) {
  let currentAuth = {
    userId: initialAuth.userId ?? "user-1",
    token: initialAuth.token ?? "token-1",
    generation: initialAuth.generation ?? 1,
    active: initialAuth.active ?? true,
  };

  return {
    getCurrentAuth: () => currentAuth,
    setCurrentAuth(nextAuth) {
      currentAuth = { ...currentAuth, ...nextAuth };
    },
  };
}

describe("socketAuthRecovery", () => {
  test("valid current pair refreshes and applies once", async () => {
    const deps = createDependencies({
      requestRefreshSession: vi.fn().mockResolvedValue({
        token: "token-2",
        user: { id: "user-1" },
      }),
      applyRefreshedAuthSession: vi.fn().mockResolvedValue(undefined),
      getAccessToken: vi.fn(() => "token-1"),
    });
    const recover = createSocketAuthRecovery(deps);
    const auth = createCurrentAuthController();

    await expect(
      recover({
        expectedUserId: "user-1",
        expectedAccessToken: "token-1",
        expectedGeneration: 1,
        getCurrentAuth: auth.getCurrentAuth,
      })
    ).resolves.toEqual({
      token: "token-2",
      user: { id: "user-1" },
    });

    expect(deps.requestRefreshSession).toHaveBeenCalledTimes(1);
    expect(deps.applyRefreshedAuthSession).toHaveBeenCalledWith({
      token: "token-2",
      user: { id: "user-1" },
    });
    expect(deps.expireCurrentAuthSession).not.toHaveBeenCalled();
  });

  test("duplicate same-pair requests share one attempt and never reconnect directly", async () => {
    let resolveRefresh;
    const deps = createDependencies({
      requestRefreshSession: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          })
      ),
      applyRefreshedAuthSession: vi.fn().mockResolvedValue(undefined),
      getAccessToken: vi.fn(() => "token-1"),
    });
    const recover = createSocketAuthRecovery(deps);
    const auth = createCurrentAuthController();

    const first = recover({
      expectedUserId: "user-1",
      expectedAccessToken: "token-1",
      expectedGeneration: 1,
      getCurrentAuth: auth.getCurrentAuth,
    });
    const second = recover({
      expectedUserId: "user-1",
      expectedAccessToken: "token-1",
      expectedGeneration: 1,
      getCurrentAuth: auth.getCurrentAuth,
    });

    resolveRefresh({ token: "token-2", user: { id: "user-1" } });

    await expect(first).resolves.toEqual({ token: "token-2", user: { id: "user-1" } });
    await expect(second).resolves.toEqual({ token: "token-2", user: { id: "user-1" } });
    expect(deps.requestRefreshSession).toHaveBeenCalledTimes(1);
    expect(deps.applyRefreshedAuthSession).toHaveBeenCalledTimes(1);
  });

  test("refresh failure expires once while the same auth pair is still current", async () => {
    const deps = createDependencies({
      requestRefreshSession: vi.fn().mockRejectedValue(new Error("401")),
      expireCurrentAuthSession: vi.fn().mockResolvedValue(undefined),
      getAccessToken: vi.fn(() => "token-1"),
    });
    const recover = createSocketAuthRecovery(deps);
    const auth = createCurrentAuthController();

    await expect(
      recover({
        expectedUserId: "user-1",
        expectedAccessToken: "token-1",
        expectedGeneration: 1,
        getCurrentAuth: auth.getCurrentAuth,
      })
    ).resolves.toBeNull();

    expect(deps.expireCurrentAuthSession).toHaveBeenCalledTimes(1);
    expect(deps.applyRefreshedAuthSession).not.toHaveBeenCalled();
  });

  test("logout during refresh ignores stale success and stale failure", async () => {
    let resolveRefresh;
    let rejectRefresh;
    const deps = createDependencies({
      requestRefreshSession: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveRefresh = resolve;
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise((_, reject) => {
              rejectRefresh = reject;
            })
        ),
      applyRefreshedAuthSession: vi.fn().mockResolvedValue(undefined),
      expireCurrentAuthSession: vi.fn().mockResolvedValue(undefined),
      getAccessToken: vi.fn(() => "token-1"),
    });
    const recover = createSocketAuthRecovery(deps);
    const auth = createCurrentAuthController();

    const first = recover({
      expectedUserId: "user-1",
      expectedAccessToken: "token-1",
      expectedGeneration: 1,
      getCurrentAuth: auth.getCurrentAuth,
    });
    auth.setCurrentAuth({ userId: null, token: null, active: false, generation: 2 });
    resolveRefresh({ token: "token-2", user: { id: "user-1" } });
    await expect(first).resolves.toBeNull();

    auth.setCurrentAuth({ userId: "user-1", token: "token-1", active: true, generation: 3 });
    const second = recover({
      expectedUserId: "user-1",
      expectedAccessToken: "token-1",
      expectedGeneration: 3,
      getCurrentAuth: auth.getCurrentAuth,
    });
    auth.setCurrentAuth({ userId: null, token: null, active: false, generation: 4 });
    rejectRefresh(new Error("401"));
    await expect(second).resolves.toBeNull();

    expect(deps.applyRefreshedAuthSession).not.toHaveBeenCalled();
    expect(deps.expireCurrentAuthSession).not.toHaveBeenCalled();
  });

  test("user switch and newer token prevent stale apply", async () => {
    let resolveRefresh;
    const deps = createDependencies({
      requestRefreshSession: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          })
      ),
      applyRefreshedAuthSession: vi.fn().mockResolvedValue(undefined),
      getAccessToken: vi.fn(() => "token-1"),
    });
    const recover = createSocketAuthRecovery(deps);
    const auth = createCurrentAuthController();

    const first = recover({
      expectedUserId: "user-1",
      expectedAccessToken: "token-1",
      expectedGeneration: 1,
      getCurrentAuth: auth.getCurrentAuth,
    });
    auth.setCurrentAuth({ userId: "user-2", token: "token-2", generation: 2 });
    deps.getAccessToken.mockImplementation(() => "token-2");
    resolveRefresh({ token: "token-3", user: { id: "user-1" } });

    await expect(first).resolves.toBeNull();
    expect(deps.applyRefreshedAuthSession).not.toHaveBeenCalled();
    expect(deps.expireCurrentAuthSession).not.toHaveBeenCalled();
  });

  test("returned different-user session expires current auth instead of restoring it", async () => {
    const deps = createDependencies({
      requestRefreshSession: vi.fn().mockResolvedValue({
        token: "token-2",
        user: { id: "user-2" },
      }),
      expireCurrentAuthSession: vi.fn().mockResolvedValue(undefined),
      getAccessToken: vi.fn(() => "token-1"),
    });
    const recover = createSocketAuthRecovery(deps);
    const auth = createCurrentAuthController();

    await expect(
      recover({
        expectedUserId: "user-1",
        expectedAccessToken: "token-1",
        expectedGeneration: 1,
        getCurrentAuth: auth.getCurrentAuth,
      })
    ).resolves.toBeNull();

    expect(deps.applyRefreshedAuthSession).not.toHaveBeenCalled();
    expect(deps.expireCurrentAuthSession).toHaveBeenCalledTimes(1);
  });

  test("malformed input does nothing", async () => {
    const deps = createDependencies();
    const recover = createSocketAuthRecovery(deps);

    await expect(recover()).resolves.toBeNull();
    await expect(
      recover({
        expectedUserId: "user-1",
        expectedAccessToken: "",
        getCurrentAuth: () => ({ userId: "user-1", token: "token-1", active: true }),
      })
    ).resolves.toBeNull();

    expect(deps.requestRefreshSession).not.toHaveBeenCalled();
  });

  test("old-pair recovery cannot corrupt a new pair", async () => {
    let resolveOldPair;
    const deps = createDependencies({
      requestRefreshSession: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveOldPair = resolve;
            })
        )
        .mockResolvedValueOnce({
          token: "token-3",
          user: { id: "user-2" },
        }),
      applyRefreshedAuthSession: vi.fn().mockResolvedValue(undefined),
      getAccessToken: vi.fn(() => "token-1"),
    });
    const recover = createSocketAuthRecovery(deps);
    const auth = createCurrentAuthController();

    const staleRecovery = recover({
      expectedUserId: "user-1",
      expectedAccessToken: "token-1",
      expectedGeneration: 1,
      getCurrentAuth: auth.getCurrentAuth,
    });

    auth.setCurrentAuth({ userId: "user-2", token: "token-2", generation: 2 });
    deps.getAccessToken.mockImplementation(() => "token-2");

    const nextRecovery = recover({
      expectedUserId: "user-2",
      expectedAccessToken: "token-2",
      expectedGeneration: 2,
      getCurrentAuth: auth.getCurrentAuth,
    });

    resolveOldPair({ token: "token-2", user: { id: "user-1" } });

    await expect(staleRecovery).resolves.toBeNull();
    await expect(nextRecovery).resolves.toEqual({
      token: "token-3",
      user: { id: "user-2" },
    });

    expect(deps.applyRefreshedAuthSession).toHaveBeenCalledTimes(1);
    expect(deps.applyRefreshedAuthSession).toHaveBeenCalledWith({
      token: "token-3",
      user: { id: "user-2" },
    });
  });
});
