import { StrictMode } from "react";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import { expireAuthSession, restoreAuthSession } from "@/store/slices/authSlice";

const ioMock = vi.hoisted(() => vi.fn());

vi.mock("socket.io-client", () => ({
  io: ioMock,
}));

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

function createFakeSocket(label) {
  return {
    label,
    auth: {},
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

const authState = (userId, token) => ({
  currentUser: { id: userId, role: "client", name: "Test Client" },
  token,
  isAuthenticated: true,
});

async function renderApp({ strict = false, auth = authState("user-1", "token-1") } = {}) {
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
  ioMock.mockReset();
});

afterEach(async () => {
  const { disconnectSocket } = await import("./shared/lib/socket");
  disconnectSocket();
  vi.restoreAllMocks();
});

describe("App Socket.IO auth lifecycle", () => {
  test("StrictMode keeps one socket instance for the same user and token", async () => {
    const fakeSocket = createFakeSocket("strict");
    ioMock.mockReturnValue(fakeSocket);

    await renderApp({ strict: true });
    await Promise.resolve();

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);
    expect(fakeSocket.disconnect).not.toHaveBeenCalled();
  });

  test("refreshed token reauthenticates the same socket instance", async () => {
    const fakeSocket = createFakeSocket("refresh");
    ioMock.mockReturnValue(fakeSocket);
    const { store } = await renderApp();

    store.dispatch(
      restoreAuthSession({
        token: "token-2",
        user: { id: "user-1", role: "client", name: "Test Client" },
      })
    );

    await waitFor(() => expect(fakeSocket.auth).toEqual({ token: "token-2" }));

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(fakeSocket.connect).toHaveBeenCalledTimes(2);
  });

  test("session expiry disconnects the active socket immediately", async () => {
    const fakeSocket = createFakeSocket("expire");
    ioMock.mockReturnValue(fakeSocket);
    const { store } = await renderApp();

    store.dispatch(expireAuthSession());

    await waitFor(() => expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1));
  });
});
