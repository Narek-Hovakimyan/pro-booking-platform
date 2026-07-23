import { StrictMode } from "react";
import { screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, test, vi } from "vitest";

import authReducer from "@/store/slices/authSlice";

const authSessionMocks = vi.hoisted(() => ({
  requestRefreshSessionMock: vi.fn(),
  applyRefreshedAuthSessionMock: vi.fn(),
  expireCurrentAuthSessionMock: vi.fn(),
}));

vi.mock("@/shared/api/authSession", () => ({
  requestRefreshSession: authSessionMocks.requestRefreshSessionMock,
  applyRefreshedAuthSession: authSessionMocks.applyRefreshedAuthSessionMock,
  expireCurrentAuthSession: authSessionMocks.expireCurrentAuthSessionMock,
}));

function createStore(preloadedAuth) {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: preloadedAuth },
  });
}

async function renderBootstrap(store) {
  vi.resetModules();
  const { default: AuthSessionBootstrap } = await import("./AuthSessionBootstrap");

  return (
    <Provider store={store}>
      <StrictMode>
        <AuthSessionBootstrap>
          <div>bootstrapped app</div>
        </AuthSessionBootstrap>
      </StrictMode>
    </Provider>
  );
}

describe("AuthSessionBootstrap", () => {
  beforeEach(() => {
    authSessionMocks.requestRefreshSessionMock.mockReset();
    authSessionMocks.applyRefreshedAuthSessionMock.mockReset();
    authSessionMocks.expireCurrentAuthSessionMock.mockReset();
  });

  test("waits for a successful refresh before mounting children", async () => {
    authSessionMocks.requestRefreshSessionMock.mockResolvedValueOnce({
      token: "fresh-token",
      user: { id: "user-1" },
    });
    authSessionMocks.applyRefreshedAuthSessionMock.mockResolvedValueOnce(undefined);
    const { render } = await import("@testing-library/react");
    render(
      await renderBootstrap(
        createStore({ currentUser: null, token: null, isAuthenticated: false })
      )
    );

    expect(screen.queryByText("bootstrapped app")).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("bootstrapped app")).toBeInTheDocument()
    );
    expect(authSessionMocks.requestRefreshSessionMock).toHaveBeenCalledTimes(1);
    expect(authSessionMocks.applyRefreshedAuthSessionMock).toHaveBeenCalledWith({
      token: "fresh-token",
      user: { id: "user-1" },
    });
  });

  test("preserves a complete legacy session on refresh 401", async () => {
    authSessionMocks.requestRefreshSessionMock.mockRejectedValueOnce({
      response: { status: 401 },
    });
    const { render } = await import("@testing-library/react");
    render(
      await renderBootstrap(
        createStore({
          currentUser: { id: "legacy-user" },
          token: "legacy-token",
          isAuthenticated: true,
        })
      )
    );

    await waitFor(() =>
      expect(screen.getByText("bootstrapped app")).toBeInTheDocument()
    );
    expect(authSessionMocks.expireCurrentAuthSessionMock).not.toHaveBeenCalled();
  });

  test("expires malformed refresh success and mounts children after settlement", async () => {
    authSessionMocks.requestRefreshSessionMock.mockRejectedValueOnce({
      code: "AUTH_SESSION_INVALID_RESPONSE",
    });
    const { render } = await import("@testing-library/react");
    render(
      await renderBootstrap(
        createStore({ currentUser: null, token: null, isAuthenticated: false })
      )
    );

    await waitFor(() =>
      expect(screen.getByText("bootstrapped app")).toBeInTheDocument()
    );
    expect(authSessionMocks.expireCurrentAuthSessionMock).toHaveBeenCalledTimes(1);
  });

  test("StrictMode still performs only one refresh request", async () => {
    authSessionMocks.requestRefreshSessionMock.mockResolvedValueOnce({
      token: "fresh-token",
      user: { id: "user-1" },
    });
    authSessionMocks.applyRefreshedAuthSessionMock.mockResolvedValueOnce(undefined);
    const { render } = await import("@testing-library/react");
    render(
      await renderBootstrap(
        createStore({ currentUser: null, token: null, isAuthenticated: false })
      )
    );

    await waitFor(() =>
      expect(screen.getByText("bootstrapped app")).toBeInTheDocument()
    );
    expect(authSessionMocks.requestRefreshSessionMock).toHaveBeenCalledTimes(1);
  });
});
