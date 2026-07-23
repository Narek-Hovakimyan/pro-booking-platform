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

async function renderBootstrap(preloadedAuth) {
  vi.resetModules();
  const { default: AuthSessionBootstrap } = await import("./AuthSessionBootstrap");

  return (
    <Provider store={createStore(preloadedAuth)}>
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
      await renderBootstrap({
        currentUser: null,
        token: null,
        isAuthenticated: false,
      })
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
    expect(authSessionMocks.expireCurrentAuthSessionMock).not.toHaveBeenCalled();
  });

  test.each([
    ["401", { response: { status: 401 } }],
    ["malformed refresh response", { code: "AUTH_SESSION_INVALID_RESPONSE" }],
    ["network error", new Error("Network Error")],
    ["403", { response: { status: 403 } }],
    ["429", { response: { status: 429 } }],
    ["5xx", { response: { status: 503 } }],
  ])("expires auth on bootstrap failure: %s", async (_label, error) => {
    authSessionMocks.requestRefreshSessionMock.mockRejectedValueOnce(error);
    const { render } = await import("@testing-library/react");
    render(
      await renderBootstrap({
        currentUser: { id: "legacy-user" },
        token: "legacy-token",
        isAuthenticated: true,
      })
    );

    expect(screen.queryByText("bootstrapped app")).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("bootstrapped app")).toBeInTheDocument()
    );
    expect(authSessionMocks.applyRefreshedAuthSessionMock).not.toHaveBeenCalled();
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
      await renderBootstrap({
        currentUser: null,
        token: null,
        isAuthenticated: false,
      })
    );

    await waitFor(() =>
      expect(screen.getByText("bootstrapped app")).toBeInTheDocument()
    );
    expect(authSessionMocks.requestRefreshSessionMock).toHaveBeenCalledTimes(1);
  });
});
