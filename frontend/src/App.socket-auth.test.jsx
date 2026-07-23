import { StrictMode } from "react";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import { expireAuthSession, restoreAuthSession } from "@/store/slices/authSlice";

const socketModuleMocks = vi.hoisted(() => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  scheduleSocketDisconnect: vi.fn(),
  subscribeToSocketAuthFailures: vi.fn(),
}));
const socketAuthRecoveryMocks = vi.hoisted(() => ({
  recoverSocketAuthSession: vi.fn(),
}));

vi.mock("./shared/lib/socket", () => socketModuleMocks);
vi.mock("./shared/lib/socketAuthRecovery", () => socketAuthRecoveryMocks);
vi.mock("./shared/components/Header", () => ({
  default: () => <div data-testid="header" />,
}));
vi.mock("./shared/components/Notifications", () => ({
  default: () => <div data-testid="notifications" />,
}));
vi.mock("./shared/api/subscriptions", () => ({
  getMySubscription: vi.fn(),
}));
vi.mock("./shared/hooks/useBookingFlow", () => ({
  useBookingFlow: () => ({
    step: "service",
    setStep: vi.fn(),
    selectedServiceId: null,
    setSelectedServiceId: vi.fn(),
    selectedDayKey: null,
    setSelectedDayKey: vi.fn(),
    selectedTime: null,
    setSelectedTime: vi.fn(),
    setClient: vi.fn(),
    bookingClient: null,
    startBooking: vi.fn(),
    resetBooking: vi.fn(),
  }),
}));
vi.mock("./shared/hooks/useBarberData", () => ({
  useBarberData: () => ({
    barberBookings: [],
    barberServices: [],
    barberScheduleEntry: null,
    barberSchedule: [],
    barberDateSchedules: [],
    barberScheduleOverrides: [],
    barberDefaultSchedule: null,
    barberNonWorkingDays: [],
    isDataLoading: false,
  }),
}));
vi.mock("./shared/hooks/useServiceManagement", () => ({
  useServiceManagement: () => ({
    addService: vi.fn(),
    updateService: vi.fn(),
    deleteService: vi.fn(),
  }),
}));
vi.mock("./shared/hooks/useScheduleManagement", () => ({
  useScheduleManagement: () => ({
    updateSchedule: vi.fn(),
    updateNonWorkingDay: vi.fn(),
    updateScheduleOverride: vi.fn(),
  }),
}));
vi.mock("./routes/ClientDiscoveryRoutes", () => ({ clientDiscoveryRoutes: null }));
vi.mock("./routes/AccountRoutes", () => ({ accountRoutes: null }));
vi.mock("./routes/BookingRoutes", () => ({ getBookingRoutes: () => null }));
vi.mock("./routes/BarberAdminRoutes", () => ({ getBarberAdminRoutes: () => null }));
vi.mock("./routes/PublicRoutes", () => ({ publicRoutes: null }));
vi.mock("./routes/EventRoutes", () => ({ eventRoutes: null }));
vi.mock("./routes/PlatformRoutes", () => ({ platformRoutes: null }));

const authState = (userId, token) => ({
  currentUser: userId ? { id: userId, role: "client", name: "Test Client" } : null,
  token,
  isAuthenticated: Boolean(userId && token),
});

async function renderApp({ auth = authState("user-1", "token-1"), strict = false } = {}) {
  const { default: App } = await import("./App");
  const ui = strict ? (
    <StrictMode>
      <App />
    </StrictMode>
  ) : (
    <App />
  );

  return renderWithProviders(ui, {
    initialEntries: ["/socket-test"],
    preloadedState: { auth },
  });
}

beforeEach(() => {
  Object.values(socketModuleMocks).forEach((mock) => mock.mockReset());
  Object.values(socketAuthRecoveryMocks).forEach((mock) => mock.mockReset());
  socketModuleMocks.subscribeToSocketAuthFailures.mockImplementation(() => vi.fn());
  socketAuthRecoveryMocks.recoverSocketAuthSession.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App Socket.IO auth ownership", () => {
  test("subscribes before connecting and auth failure triggers bounded recovery without direct reconnect", async () => {
    const calls = [];
    let authFailureListener;

    socketModuleMocks.subscribeToSocketAuthFailures.mockImplementation((listener) => {
      calls.push("subscribe");
      authFailureListener = listener;
      return vi.fn();
    });
    socketModuleMocks.connectSocket.mockImplementation(() => {
      calls.push("connect");
      return {};
    });

    await renderApp();

    expect(calls).toEqual(["subscribe", "connect"]);

    await authFailureListener();

    expect(socketAuthRecoveryMocks.recoverSocketAuthSession).toHaveBeenCalledTimes(1);
    expect(socketModuleMocks.connectSocket).toHaveBeenCalledTimes(1);

    const [{ expectedUserId, expectedAccessToken, getCurrentAuth }] =
      socketAuthRecoveryMocks.recoverSocketAuthSession.mock.calls[0];

    expect(expectedUserId).toBe("user-1");
    expect(expectedAccessToken).toBe("token-1");
    expect(getCurrentAuth()).toMatchObject({
      userId: "user-1",
      token: "token-1",
      active: true,
    });
  });

  test("refreshed Redux token drives same-user reauthentication and user switch replaces ownership", async () => {
    const unsubscribeFirst = vi.fn();
    const unsubscribeSecond = vi.fn();
    const unsubscribeThird = vi.fn();

    socketModuleMocks.subscribeToSocketAuthFailures
      .mockImplementationOnce(() => unsubscribeFirst)
      .mockImplementationOnce(() => unsubscribeSecond)
      .mockImplementationOnce(() => unsubscribeThird);
    const { store } = await renderApp();

    store.dispatch(
      restoreAuthSession({
        token: "token-2",
        user: { id: "user-1", role: "client", name: "Test Client" },
      })
    );
    await waitFor(() =>
      expect(socketModuleMocks.connectSocket.mock.calls).toEqual([
        ["user-1", "token-1"],
        ["user-1", "token-2"],
      ])
    );

    store.dispatch(
      restoreAuthSession({
        token: "token-3",
        user: { id: "user-2", role: "client", name: "Next User" },
      })
    );

    await waitFor(() =>
      expect(socketModuleMocks.connectSocket.mock.calls).toEqual([
        ["user-1", "token-1"],
        ["user-1", "token-2"],
        ["user-2", "token-3"],
      ])
    );

    expect(unsubscribeFirst).toHaveBeenCalledTimes(1);
    expect(unsubscribeSecond).toHaveBeenCalledTimes(1);
    expect(socketModuleMocks.scheduleSocketDisconnect).toHaveBeenCalledTimes(2);
  });

  test("logout disconnects without recovery, unmount cleanup is exact, and StrictMode does not duplicate ownership", async () => {
    const unsubscribe = vi.fn();
    socketModuleMocks.subscribeToSocketAuthFailures.mockImplementation(() => unsubscribe);
    const { store, unmount } = await renderApp({ strict: true });

    await waitFor(() => {
      expect(socketModuleMocks.subscribeToSocketAuthFailures).toHaveBeenCalledTimes(1);
      expect(socketModuleMocks.connectSocket).toHaveBeenCalledTimes(1);
    });

    store.dispatch(expireAuthSession());

    await waitFor(() => expect(socketModuleMocks.disconnectSocket).toHaveBeenCalledTimes(1));
    expect(socketAuthRecoveryMocks.recoverSocketAuthSession).not.toHaveBeenCalled();

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(socketModuleMocks.scheduleSocketDisconnect).toHaveBeenCalledTimes(1);
  });
});
