import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import DashboardAnalytics from "./DashboardAnalytics";
import api from "@/shared/api/axios";
import { getMyBarberOnboarding } from "@/shared/api/barberOnboarding";

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("@/shared/api/barberOnboarding", () => ({
  getMyBarberOnboarding: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));

vi.mock("@/barber/components/analytics/AnalyticsHeader", () => ({
  default: () => <section aria-label="analytics header">Analytics header marker</section>,
}));

vi.mock("@/barber/components/analytics/AnalyticsSummaryCards", () => ({
  default: () => <section aria-label="analytics summary">Personal summary marker</section>,
}));

vi.mock("@/barber/components/analytics/AnalyticsNextBooking", () => ({
  default: () => <section aria-label="analytics next booking">Next booking marker</section>,
}));

vi.mock("@/barber/components/analytics/AnalyticsPendingActions", () => ({
  default: () => <section aria-label="analytics pending actions">Pending actions marker</section>,
}));

vi.mock("@/barber/components/analytics/AnalyticsActivityLists", () => ({
  default: () => <section aria-label="analytics activity">Activity marker</section>,
}));

const BARBER_ID = "64b64cfa12ab34cd56ef7890";
const SALON_ID = "64b64cfa12ab34cd56ef7891";

const baseUser = {
  id: BARBER_ID,
  role: "barber",
  name: "Test Barber",
};

const baseBookings = [
  {
    _id: "booking-1",
    status: "accepted",
    bookingDate: "2026-07-21",
    time: "14:00",
    serviceName: "Clipper Cut",
    clientName: "Sam",
    price: 12000,
  },
];

function buildStoreUser(overrides = {}) {
  return {
    ...baseUser,
    ...overrides,
  };
}

function setupApi({
  manageableData = [],
  statusData = {},
  onboardingData = { state: { workplace: null } },
  incomeData = {},
  reviewsData = [],
  manageableRejects = false,
  statusRejects = false,
  incomeRejects = false,
  reviewsRejects = false,
}) {
  api.get.mockImplementation((url) => {
    if (url === "/salons/mine/manageable") {
      return manageableRejects
        ? Promise.reject(new Error("manageable failed"))
        : Promise.resolve({ data: manageableData });
    }

    if (url === "/salons/me/status") {
      return statusRejects
        ? Promise.reject(new Error("status failed"))
        : Promise.resolve({ data: statusData });
    }

    if (url === `/bookings/barber/${BARBER_ID}/income?month=${new Date().toISOString().slice(0, 7)}`) {
      return incomeRejects
        ? Promise.reject(new Error("income failed"))
        : Promise.resolve({
            data: {
              month: new Date().toISOString().slice(0, 7),
              completedIncome: 0,
              completedCount: 0,
              pendingIncome: 0,
              pendingCount: 0,
              totalExpectedIncome: 0,
              ...incomeData,
            },
          });
    }

    if (url === `/reviews/${BARBER_ID}`) {
      return reviewsRejects
        ? Promise.reject(new Error("reviews failed"))
        : Promise.resolve({ data: reviewsData });
    }

    throw new Error(`Unexpected api.get call: ${url}`);
  });

  getMyBarberOnboarding.mockResolvedValue(onboardingData);
}

function renderDashboard({
  currentUser = buildStoreUser(),
  bookings = baseBookings,
} = {}) {
  return renderWithProviders(<DashboardAnalytics bookings={bookings} />, {
    initialEntries: ["/admin"],
    preloadedState: {
      auth: {
        currentUser,
        token: "token",
        isAuthenticated: true,
      },
      notifications: [],
    },
  });
}

async function waitForDashboard() {
  expect(await screen.findByRole("region", { name: "analytics summary" })).toBeVisible();
  await waitFor(() => {
    expect(screen.queryByText("Analytics header marker")).toBeInTheDocument();
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("DashboardAnalytics", () => {
  it("keeps the salon onboarding CTA hidden for independent workplace", async () => {
    setupApi({
      manageableData: [],
      statusData: { salons: [] },
      onboardingData: { state: { workplace: "independent" } },
    });

    renderDashboard();
    await waitForDashboard();

    expect(screen.queryByRole("link", { name: /Create or join a salon/i })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "analytics summary" })).toBeVisible();
  });

  it("shows the salon onboarding CTA for salon workplace without membership", async () => {
    setupApi({
      manageableData: [],
      statusData: { salons: [] },
      onboardingData: { state: { workplace: "salon" } },
    });

    renderDashboard();
    await waitForDashboard();

    const link = screen.getByRole("link", { name: /Create or join a salon/i });
    expect(link).toHaveAttribute("href", "/admin/settings/salon");
  });

  it("shows the same CTA for both workplace without membership", async () => {
    setupApi({
      manageableData: [],
      statusData: { salons: [] },
      onboardingData: { state: { workplace: "both" } },
    });

    renderDashboard();
    await waitForDashboard();

    expect(screen.getByRole("link", { name: /Create or join a salon/i })).toHaveAttribute(
      "href",
      "/admin/settings/salon"
    );
  });

  it("hides the CTA when a manageable salon already exists", async () => {
    setupApi({
      manageableData: [{ _id: SALON_ID, name: "Managed Salon" }],
      statusData: { salons: [] },
      onboardingData: { state: { workplace: "salon" } },
    });

    renderDashboard();
    await waitForDashboard();

    expect(screen.queryByRole("link", { name: /Create or join a salon/i })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "analytics activity" })).toBeVisible();
  });

  it("hides the CTA when approved membership comes from the status endpoint", async () => {
    setupApi({
      manageableData: [],
      statusData: { salons: [{ salonId: SALON_ID, status: "approved" }] },
      onboardingData: { state: { workplace: "both" } },
    });

    renderDashboard();
    await waitForDashboard();

    expect(screen.queryByRole("link", { name: /Create or join a salon/i })).not.toBeInTheDocument();
  });

  it("uses currentUser approved membership fallback when status data is malformed", async () => {
    setupApi({
      manageableData: [],
      statusData: null,
      onboardingData: { state: { workplace: "salon" } },
    });

    renderDashboard({
      currentUser: buildStoreUser({
        salons: [{ salonId: SALON_ID, status: "approved" }],
        salonStatus: "approved",
      }),
    });
    await waitForDashboard();

    expect(screen.queryByRole("link", { name: /Create or join a salon/i })).not.toBeInTheDocument();
  });

  it("keeps the CTA hidden for invalid or missing workplace values", async () => {
    setupApi({
      manageableData: [],
      statusData: { salons: [] },
      onboardingData: { state: { workplace: "franchise" } },
    });

    renderDashboard();
    await waitForDashboard();

    expect(screen.queryByRole("link", { name: /Create or join a salon/i })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "analytics pending actions" })).toBeVisible();
  });

  it("settles safely on partial request failure and still shows CTA from resolved facts", async () => {
    setupApi({
      manageableData: [],
      statusData: {},
      onboardingData: { state: { workplace: "both" } },
      manageableRejects: true,
    });

    renderDashboard();
    await waitForDashboard();

    const link = screen.getByRole("link", { name: /Create or join a salon/i });
    expect(link).toHaveAttribute("href", "/admin/settings/salon");
    expect(screen.getByRole("region", { name: "analytics summary" })).toBeVisible();
    expect(within(screen.getByRole("region", { name: "analytics activity" })).getByText("Activity marker")).toBeVisible();
  });
});
