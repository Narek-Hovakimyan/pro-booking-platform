import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { renderWithProviders } from "@/test/renderWithProviders";
import BarberOnboardingPage from "./BarberOnboardingPage";
import {
  finalizeMyBarberOnboarding,
  getMyBarberOnboarding,
  updateMyBarberOnboardingWorkplace,
} from "@/shared/api/barberOnboarding";

vi.mock("@/shared/api/barberOnboarding", () => ({
  finalizeMyBarberOnboarding: vi.fn(),
  getMyBarberOnboarding: vi.fn(),
  updateMyBarberOnboardingWorkplace: vi.fn(),
}));

vi.mock("@/barber/components/onboarding/ProfessionalBasicsStep", () => ({
  default: ({ mode }) => (
    <section aria-label="professional basics step">
      Professional basics marker
      {mode ? <span>mode: {mode}</span> : null}
    </section>
  ),
}));

vi.mock("@/barber/components/schedule/PersonalScheduleView", () => ({
  default: ({ currentUserId, embedded }) => (
    <section aria-label="personal schedule step">
      Personal schedule marker
      <span>barber id: {currentUserId}</span>
      <span>embedded: {embedded ? "yes" : "no"}</span>
    </section>
  ),
}));

const barberUser = { id: "barber-1", role: "barber", name: "Test Barber" };

const authState = (currentUser = barberUser) => ({
  auth: {
    currentUser,
    token: "token",
    isAuthenticated: true,
  },
});

const statusForStep = (currentStep, overrides = {}) => ({
  applicable: true,
  needsOnboarding: true,
  state: { currentStep },
  progress: { readyForFinalization: false, missing: [] },
  allowedActions: [],
  ...overrides,
});

function renderOnboardingPage({ status, preloadedState = authState() }) {
  getMyBarberOnboarding.mockResolvedValue(status);

  return renderWithProviders(
    <Routes>
      <Route path="/onboarding" element={<BarberOnboardingPage />} />
      <Route path="/admin" element={<main>Admin route rendered</main>} />
    </Routes>,
    {
      initialEntries: ["/onboarding"],
      preloadedState,
    }
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("BarberOnboardingPage", () => {
  it("renders the authoritative professional basics step from API status", async () => {
    renderOnboardingPage({ status: statusForStep("professional_basics") });

    expect(
      await screen.findByRole("region", { name: "professional basics step" })
    ).toBeVisible();
    expect(screen.getByText("Tell clients who you are")).toBeVisible();
  });

  it("renders the authoritative workplace step without unrelated step content", async () => {
    renderOnboardingPage({
      status: statusForStep("workplace", { state: { currentStep: "workplace" } }),
    });

    expect(await screen.findByDisplayValue("independent")).toBeInTheDocument();
    expect(screen.getByText("Choose how you work")).toBeVisible();
    expect(screen.queryByText("Professional basics marker")).not.toBeInTheDocument();
    expect(screen.queryByText("Personal schedule marker")).not.toBeInTheDocument();
  });

  it("renders personal schedule with current barber ID and embedded mode", async () => {
    renderOnboardingPage({ status: statusForStep("personal_schedule") });

    expect(
      await screen.findByRole("region", { name: "personal schedule step" })
    ).toBeVisible();
    expect(screen.getByText("barber id: barber-1")).toBeVisible();
    expect(screen.getByText("embedded: yes")).toBeVisible();
  });

  it("renders review and enables finalization when API status allows it", async () => {
    renderOnboardingPage({
      status: statusForStep("review", {
        progress: { readyForFinalization: true, missing: [] },
      }),
    });

    expect(await screen.findByText("Review and finish")).toBeVisible();
    expect(screen.getByRole("button", { name: "Finish onboarding" })).toBeEnabled();
    expect(finalizeMyBarberOnboarding).not.toHaveBeenCalled();
  });

  it("falls back safely for an unknown current step", async () => {
    renderOnboardingPage({ status: statusForStep("unexpected_step") });

    expect(await screen.findByText("Review and finish")).toBeVisible();
    expect(screen.getByText("Review your setup")).toBeVisible();
  });

  it("redirects completed onboarding status to admin", async () => {
    renderOnboardingPage({
      status: {
        applicable: true,
        needsOnboarding: false,
        state: { currentStep: "completed" },
      },
    });

    expect(await screen.findByText("Admin route rendered")).toBeVisible();
    expect(screen.queryByText("Professional basics marker")).not.toBeInTheDocument();
  });

  it("uses API state instead of stale onboarding-like Redux fields", async () => {
    renderOnboardingPage({
      status: statusForStep("professional_basics"),
      preloadedState: authState({
        ...barberUser,
        onboarding: { currentStep: "workplace" },
        state: { currentStep: "review" },
      }),
    });

    expect(
      await screen.findByRole("region", { name: "professional basics step" })
    ).toBeVisible();
    expect(screen.queryByText("Choose how you work")).not.toBeInTheDocument();
  });

  it("does not call workplace or finalize mutations while rendering", async () => {
    renderOnboardingPage({ status: statusForStep("workplace") });

    expect(await screen.findByText("Choose how you work")).toBeVisible();
    expect(updateMyBarberOnboardingWorkplace).not.toHaveBeenCalled();
    expect(finalizeMyBarberOnboarding).not.toHaveBeenCalled();
  });
});
