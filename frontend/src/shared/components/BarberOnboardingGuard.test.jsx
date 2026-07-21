import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { renderWithProviders } from "@/test/renderWithProviders";
import BarberOnboardingGuard from "./BarberOnboardingGuard";
import { getMyBarberOnboardingDeduped } from "@/shared/api/barberOnboarding";

vi.mock("@/shared/api/barberOnboarding", () => ({
  getMyBarberOnboardingDeduped: vi.fn(),
}));

const barberUser = { id: "barber-1", role: "barber", name: "Test Barber" };
const clientUser = { id: "client-1", role: "client", name: "Test Client" };

const authState = (currentUser) => ({
  auth: {
    currentUser,
    token: currentUser ? "token" : null,
    isAuthenticated: Boolean(currentUser),
  },
});

const incompleteStatus = {
  applicable: true,
  needsOnboarding: true,
  state: { currentStep: "professional_basics" },
};

const completedStatus = {
  applicable: true,
  needsOnboarding: false,
  state: { currentStep: "completed" },
};

function GuardedRoutes({ currentUser = barberUser, initialEntries = ["/admin"] }) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/admin"
        element={
          <BarberOnboardingGuard>
            <main>Admin route rendered</main>
          </BarberOnboardingGuard>
        }
      />
      <Route
        path="/onboarding"
        element={
          <BarberOnboardingGuard>
            <main>Onboarding route rendered</main>
          </BarberOnboardingGuard>
        }
      />
    </Routes>,
    {
      initialEntries,
      preloadedState: authState(currentUser),
    }
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("BarberOnboardingGuard", () => {
  it("renders non-barber children without requesting onboarding status", () => {
    GuardedRoutes({ currentUser: clientUser });

    expect(screen.getByText("Admin route rendered")).toBeVisible();
    expect(getMyBarberOnboardingDeduped).not.toHaveBeenCalled();
  });

  it("redirects incomplete barbers from admin to onboarding", async () => {
    getMyBarberOnboardingDeduped.mockResolvedValue(incompleteStatus);

    GuardedRoutes({ initialEntries: ["/admin"] });

    expect(screen.getByText("Checking onboarding status...")).toBeVisible();
    expect(await screen.findByText("Onboarding route rendered")).toBeVisible();
    expect(screen.queryByText("Admin route rendered")).not.toBeInTheDocument();
  });

  it("keeps incomplete barbers on onboarding", async () => {
    getMyBarberOnboardingDeduped.mockResolvedValue(incompleteStatus);

    GuardedRoutes({ initialEntries: ["/onboarding"] });

    expect(await screen.findByText("Onboarding route rendered")).toBeVisible();
    expect(screen.queryByText("Admin route rendered")).not.toBeInTheDocument();
  });

  it("redirects completed barbers from onboarding to admin", async () => {
    getMyBarberOnboardingDeduped.mockResolvedValue(completedStatus);

    GuardedRoutes({ initialEntries: ["/onboarding"] });

    expect(await screen.findByText("Admin route rendered")).toBeVisible();
    expect(screen.queryByText("Onboarding route rendered")).not.toBeInTheDocument();
  });

  it("renders admin for completed barbers already on admin", async () => {
    getMyBarberOnboardingDeduped.mockResolvedValue(completedStatus);

    GuardedRoutes({ initialEntries: ["/admin"] });

    expect(await screen.findByText("Admin route rendered")).toBeVisible();
    expect(screen.queryByText("Onboarding route rendered")).not.toBeInTheDocument();
  });

  it("treats legacy-compatible barbers as completed", async () => {
    getMyBarberOnboardingDeduped.mockResolvedValue({
      applicable: true,
      needsOnboarding: true,
      legacyCompatible: true,
    });

    GuardedRoutes({ initialEntries: ["/onboarding"] });

    expect(await screen.findByText("Admin route rendered")).toBeVisible();
    expect(screen.queryByText("Onboarding route rendered")).not.toBeInTheDocument();
  });

  it("fails open when the onboarding status request rejects", async () => {
    getMyBarberOnboardingDeduped.mockRejectedValue(new Error("status failed"));

    GuardedRoutes({ initialEntries: ["/admin"] });

    expect(await screen.findByText("Admin route rendered")).toBeVisible();
  });

  it("does not loop after redirecting incomplete barbers to onboarding", async () => {
    getMyBarberOnboardingDeduped.mockResolvedValue(incompleteStatus);

    GuardedRoutes({ initialEntries: ["/admin"] });

    expect(await screen.findByText("Onboarding route rendered")).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByText("Checking onboarding status...")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Admin route rendered")).not.toBeInTheDocument();
    expect(getMyBarberOnboardingDeduped.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
