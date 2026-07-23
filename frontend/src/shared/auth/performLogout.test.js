import { beforeEach, describe, expect, test, vi } from "vitest";

const requestLogoutSessionMock = vi.fn();

vi.mock("@/shared/api/authSession", () => ({
  requestLogoutSession: requestLogoutSessionMock,
}));

describe("performLogout", () => {
  beforeEach(() => {
    requestLogoutSessionMock.mockReset();
  });

  test("logs out remotely and always cleans up locally", async () => {
    const dispatch = vi.fn();
    const navigate = vi.fn();
    const cleanup = vi.fn();
    requestLogoutSessionMock.mockResolvedValueOnce({});
    const { performLogout } = await import("./performLogout");
    const { logoutUser } = await import("@/store/slices/authSlice");

    await performLogout({ dispatch, navigate, onCleanup: cleanup });

    expect(requestLogoutSessionMock).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(logoutUser());
    expect(navigate).toHaveBeenCalledWith("/login");
  });

  test("local logout still completes when backend logout fails", async () => {
    const dispatch = vi.fn();
    const navigate = vi.fn();
    const cleanup = vi.fn();
    requestLogoutSessionMock.mockRejectedValueOnce(new Error("offline"));
    const { performLogout } = await import("./performLogout");
    const { logoutUser } = await import("@/store/slices/authSlice");

    await performLogout({ dispatch, navigate, onCleanup: cleanup });

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(logoutUser());
    expect(navigate).toHaveBeenCalledWith("/login");
  });
});
