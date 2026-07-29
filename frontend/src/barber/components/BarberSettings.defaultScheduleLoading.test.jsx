import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import { restoreAuthSession } from "@/store/slices/authSlice";
import BarberSettings from "./BarberSettings";
import api from "@/shared/api/axios";

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock("@/barber/hooks/useDefaultSalonScheduleSettings", () => ({
  default: () => ({
    salonSchedules: {},
    savingSalonId: null,
    savedSalonId: null,
    errorSalonId: null,
    salonScheduleErrors: {},
    updateSalonSchedule: vi.fn(),
    updateWeeklyDaySchedule: vi.fn(),
    saveDefaultSchedule: vi.fn(),
  }),
}));

const baseUser = {
  id: "barber-1",
  role: "barber",
  name: "Test Barber",
};

function authState(currentUser = baseUser) {
  return {
    auth: {
      currentUser,
      token: "token",
      isAuthenticated: true,
    },
  };
}

function renderDefaultSchedule(preloadedState = authState()) {
  return renderWithProviders(
    <BarberSettings settingsView="default-schedule" />,
    { preloadedState }
  );
}

function mockSuccessfulSalonLoad({
  salons = [],
  status = { salonStatus: "none", salons: [], ownedSalons: [], managedSalons: [] },
  ownerRequests = [],
} = {}) {
  api.get.mockImplementation((url) => {
    if (url.startsWith("/barbers/")) {
      return Promise.resolve({ data: [] });
    }
    if (url === "/salons") {
      return Promise.resolve({ data: salons });
    }
    if (url === "/salons/me/status") {
      return Promise.resolve({ data: status });
    }
    if (url === "/salons/owner/requests") {
      return Promise.resolve({ data: ownerRequests });
    }
    throw new Error(`Unexpected GET ${url}`);
  });
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("BarberSettings default schedule loading state", () => {
  it("does not show the empty message while the initial salon request is unresolved", () => {
    const salonsDeferred = createDeferred();
    const statusDeferred = createDeferred();
    const ownerRequestsDeferred = createDeferred();

    api.get.mockImplementation((url) => {
      if (url.startsWith("/barbers/")) {
        return Promise.resolve({ data: [] });
      }
      if (url === "/salons") return salonsDeferred.promise;
      if (url === "/salons/me/status") return statusDeferred.promise;
      if (url === "/salons/owner/requests") return ownerRequestsDeferred.promise;
      throw new Error(`Unexpected GET ${url}`);
    });

    renderDefaultSchedule();

    expect(screen.getByText("Loading...")).toBeVisible();
    expect(
      screen.queryByText("No salons found. Join a salon first.")
    ).not.toBeInTheDocument();
  });

  it("shows the empty message after a successful empty response", async () => {
    mockSuccessfulSalonLoad();

    renderDefaultSchedule();

    expect(
      await screen.findByText("No salons found. Join a salon first.")
    ).toBeVisible();
  });

  it("renders salon schedule content after a successful salon response", async () => {
    mockSuccessfulSalonLoad({
      salons: [{ _id: "salon-1", name: "North Studio" }],
      status: {
        salonStatus: "approved",
        salons: [{ _id: "salon-1", salon: "salon-1", status: "approved" }],
        ownedSalons: [],
        managedSalons: [],
      },
    });

    renderDefaultSchedule();

    expect(await screen.findByText("North Studio")).toBeVisible();
    expect(
      screen.queryByText("No salons found. Join a salon first.")
    ).not.toBeInTheDocument();
  });

  it("shows the salon read error instead of the empty message when the request fails", async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith("/barbers/")) {
        return Promise.resolve({ data: [] });
      }
      if (url === "/salons/me/status") {
        return Promise.reject(new Error("status failed"));
      }
      if (url === "/salons" || url === "/salons/owner/requests") {
        return Promise.resolve({ data: [] });
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    renderDefaultSchedule();

    expect(
      await screen.findByText("Could not load salon settings. Please try again.")
    ).toBeVisible();
    expect(
      screen.queryByText("No salons found. Join a salon first.")
    ).not.toBeInTheDocument();
  });

  it("shows an error instead of stale content after a populated load fails, then recovers", async () => {
    const statuses = [
      {
        salonStatus: "approved",
        salons: [{ _id: "salon-1", salon: "salon-1", status: "approved" }],
        ownedSalons: [],
        managedSalons: [],
      },
      new Error("refresh failed"),
      {
        salonStatus: "approved",
        salons: [{ _id: "salon-3", salon: "salon-3", status: "approved" }],
        ownedSalons: [],
        managedSalons: [],
      },
    ];
    const salons = [
      [{ _id: "salon-1", name: "Old Studio" }],
      [],
      [{ _id: "salon-3", name: "Fresh Studio" }],
    ];

    api.get.mockImplementation((url) => {
      if (url.startsWith("/barbers/")) return Promise.resolve({ data: [] });
      if (url === "/salons") return Promise.resolve({ data: salons.shift() });
      if (url === "/salons/me/status") {
        const result = statuses.shift();
        return result instanceof Error
          ? Promise.reject(result)
          : Promise.resolve({ data: result });
      }
      if (url === "/salons/owner/requests") {
        return Promise.resolve({ data: [] });
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const { store } = renderDefaultSchedule();
    expect(await screen.findByText("Old Studio")).toBeVisible();

    await act(async () => {
      store.dispatch(
        restoreAuthSession({ user: { ...baseUser, id: "barber-2" }, token: "token" })
      );
    });

    expect(
      await screen.findByText("Could not load salon settings. Please try again.")
    ).toBeVisible();
    expect(screen.queryByText("Old Studio")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No salons found. Join a salon first.")
    ).not.toBeInTheDocument();

    await act(async () => {
      store.dispatch(
        restoreAuthSession({ user: { ...baseUser, id: "barber-3" }, token: "token" })
      );
    });

    expect(await screen.findByText("Fresh Studio")).toBeVisible();
    expect(
      screen.queryByText("Could not load salon settings. Please try again.")
    ).not.toBeInTheDocument();
  });

  it("ignores a stale earlier failure after a newer request succeeds", async () => {
    const firstSalons = createDeferred();
    const firstStatus = createDeferred();
    const firstRequests = createDeferred();
    const secondSalons = createDeferred();
    const secondStatus = createDeferred();
    const secondRequests = createDeferred();

    const salonsQueue = [firstSalons, secondSalons];
    const statusQueue = [firstStatus, secondStatus];
    const requestsQueue = [firstRequests, secondRequests];

    api.get.mockImplementation((url) => {
      if (url.startsWith("/barbers/")) {
        return Promise.resolve({ data: [] });
      }
      if (url === "/salons") return salonsQueue.shift().promise;
      if (url === "/salons/me/status") return statusQueue.shift().promise;
      if (url === "/salons/owner/requests") return requestsQueue.shift().promise;
      throw new Error(`Unexpected GET ${url}`);
    });

    const { store } = renderDefaultSchedule();

    await act(async () => {
      store.dispatch(
        restoreAuthSession({
          user: { ...baseUser, id: "barber-2" },
          token: "token",
        })
      );
    });

    await act(async () => {
      secondSalons.resolve({ data: [{ _id: "salon-2", name: "Fresh Fade" }] });
      secondStatus.resolve({
        data: {
          salonStatus: "approved",
          salons: [{ _id: "salon-2", salon: "salon-2", status: "approved" }],
          ownedSalons: [],
          managedSalons: [],
        },
      });
      secondRequests.resolve({ data: [] });
      await Promise.resolve();
    });

    expect(await screen.findByText("Fresh Fade")).toBeVisible();

    await act(async () => {
      firstStatus.reject(new Error("stale status failure"));
      firstSalons.resolve({ data: [] });
      firstRequests.resolve({ data: [] });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("Fresh Fade")).toBeVisible();
    });
    expect(
      screen.queryByText("No salons found. Join a salon first.")
    ).not.toBeInTheDocument();
  });
});
