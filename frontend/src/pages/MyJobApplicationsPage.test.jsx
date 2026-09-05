import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import MyJobApplicationsPage from "./MyJobApplicationsPage";
import { fetchMyJobApplications } from "@/shared/api/salonJobs";
import { confirmJobOnboarding } from "@/shared/api/salonJobs";

vi.mock("@/shared/api/salonJobs", () => ({
  fetchMyJobApplications: vi.fn(),
  confirmJobOnboarding: vi.fn(),
}));

const application = (id, overrides = {}) => ({
  id, status: "accepted", createdAt: "2026-01-01", job: { title: `Job ${id}`, role: "barber" }, salon: { name: `Salon ${id}` },
  onboardingStatus: "pending_consent",
  onboardingOffer: {
    salonId: `salon-${id}`,
    jobPostId: `job-${id}`,
    role: "barber",
    employmentType: "full-time",
    relationshipType: "staff",
    relationshipStatus: "accepted",
    worksAsSpecialist: true,
    mappingVersion: 1,
    offeredAt: "2026-01-01T00:00:00.000Z",
  },
  ...overrides,
});

const renderPage = () => render(<MemoryRouter><MyJobApplicationsPage /></MemoryRouter>);

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("MyJobApplicationsPage", () => {
  it("loads submissions through the job API helper and renders consent", async () => {
    fetchMyJobApplications.mockResolvedValue({ data: [application("a")] });
    renderPage();
    expect(await screen.findByRole("button", { name: "Confirm salon onboarding" })).toBeVisible();
    expect(fetchMyJobApplications).toHaveBeenCalledTimes(1);
  });

  it("replaces only the matching authoritative application", async () => {
    fetchMyJobApplications.mockResolvedValue({ data: [application("a"), application("b")] });
    confirmJobOnboarding.mockResolvedValue({ data: { application: application("a", { onboardingStatus: "confirmed" }) } });
    renderPage();
    const buttons = await screen.findAllByRole("button", { name: "Confirm salon onboarding" });
    await buttons[0].click();
    expect(await screen.findByText("Salon onboarding confirmed.")).toBeVisible();
    expect(screen.getByText("Job b")).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm salon onboarding" })).toBeVisible();
  });

  it("preserves ordinary application states and actionable load errors", async () => {
    fetchMyJobApplications.mockResolvedValueOnce({ data: [application("pending", { status: "pending", onboardingStatus: null, onboardingOffer: undefined }), application("rejected", { status: "rejected" })] });
    renderPage();
    expect(await screen.findByText("Pending")).toBeVisible();
    expect(screen.getByText("Rejected")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirm salon onboarding" })).not.toBeInTheDocument();
    cleanup();
    fetchMyJobApplications.mockRejectedValueOnce({ response: { data: { message: "Could not load now" } } });
    renderPage();
    expect(await screen.findByText("Could not load now")).toBeVisible();
  });

  it("does not update after an initial fetch resolves late", async () => {
    let resolve;
    fetchMyJobApplications.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = renderPage();
    view.unmount();
    await act(async () => { resolve({ data: [application("late")] }); });
    expect(screen.queryByText("Job late")).not.toBeInTheDocument();
  });
});
