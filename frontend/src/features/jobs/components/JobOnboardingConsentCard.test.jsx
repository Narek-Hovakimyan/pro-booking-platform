import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import JobOnboardingConsentCard from "./JobOnboardingConsentCard";
import { confirmJobOnboarding } from "@/shared/api/salonJobs";

vi.mock("@/shared/api/salonJobs", () => ({ confirmJobOnboarding: vi.fn() }));

const app = (overrides = {}) => ({
  id: "application-a",
  status: "accepted",
  onboardingStatus: "pending_consent",
  onboardingOffer: {
    salonId: "salon-a",
    jobPostId: "job-a",
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

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });

  return { promise, reject, resolve };
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("JobOnboardingConsentCard", () => {
  it.each([
    [app(), "Salon staff — specialist"],
    [
      app({
        onboardingOffer: {
          ...app().onboardingOffer,
          role: "receptionist",
          worksAsSpecialist: false,
        },
      }),
      "Salon staff — non-specialist",
    ],
    [
      app({
        onboardingOffer: {
          ...app().onboardingOffer,
          employmentType: "rent-chair",
          relationshipType: "chair_renter",
        },
      }),
      "Chair renter — specialist",
    ],
  ])("shows immutable relationship terms", (application, relationship) => {
    render(<JobOnboardingConsentCard application={application} />);

    expect(
      screen.getByText(
        "Salon membership has not been created yet. Confirm to activate your salon relationship."
      )
    ).toBeVisible();
    expect(screen.getByText(relationship)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirm salon onboarding" })
    ).toBeVisible();
  });

  it.each([
    ["a wrong relationship status", { relationshipStatus: "pending" }],
    ["an unsupported role", { role: "other" }],
    ["a non-specialist chair rental", { role: "receptionist", employmentType: "rent-chair" }],
    ["a role and relationship mismatch", { relationshipType: "chair_renter" }],
    ["a missing mapping version", { mappingVersion: undefined }],
    ["a missing offer timestamp", { offeredAt: undefined }],
    ["an invalid offer timestamp", { offeredAt: "not-a-date" }],
    ["a truthy non-boolean specialist value", { worksAsSpecialist: "true" }],
    ["a malformed salon identifier", { salonId: "" }],
  ])("fails closed for %s", (_description, offerOverrides) => {
    render(
      <JobOnboardingConsentCard
        application={app({
          onboardingOffer: { ...app().onboardingOffer, ...offerOverrides },
        })}
      />
    );

    expect(
      screen.getByText(
        "Automatic salon onboarding is unavailable for this older application",
        { exact: false }
      )
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Confirm salon onboarding" })
    ).not.toBeInTheDocument();
  });

  it("submits once and replaces only with the authoritative response", async () => {
    const user = userEvent.setup();
    const onApplicationConfirmed = vi.fn();
    const pending = deferred();
    confirmJobOnboarding.mockReturnValue(pending.promise);
    render(
      <JobOnboardingConsentCard
        application={app()}
        onApplicationConfirmed={onApplicationConfirmed}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Confirm salon onboarding" })
    );
    await user.click(
      screen.getByRole("button", { name: /Confirming salon onboarding/ })
    );
    expect(confirmJobOnboarding).toHaveBeenCalledTimes(1);
    expect(confirmJobOnboarding).toHaveBeenCalledWith("application-a");

    await act(async () => {
      pending.resolve({
        data: {
          application: app({ onboardingStatus: "confirmed" }),
          idempotent: false,
        },
      });
      await pending.promise;
    });

    expect(onApplicationConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "application-a",
        onboardingStatus: "confirmed",
      })
    );
  });

  it("shows safe and fallback errors without false success", async () => {
    const user = userEvent.setup();
    confirmJobOnboarding.mockRejectedValueOnce({
      response: { data: { message: "Membership already exists" } },
    });
    const { rerender } = render(<JobOnboardingConsentCard application={app()} />);

    await user.click(
      screen.getByRole("button", { name: "Confirm salon onboarding" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Membership already exists"
    );

    confirmJobOnboarding.mockRejectedValueOnce(new Error("network"));
    rerender(<JobOnboardingConsentCard application={app({ id: "application-b" })} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Confirm salon onboarding" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not confirm salon onboarding."
    );
    expect(screen.queryByText("Salon onboarding confirmed.")).not.toBeInTheDocument();
  });

  it.each([
    [app({ onboardingStatus: "confirmed" }), "Salon onboarding confirmed."],
    [
      app({ onboardingStatus: "blocked", onboardingOffer: undefined }),
      "Automatic salon onboarding is unavailable",
    ],
    [
      app({ onboardingStatus: null, onboardingOffer: undefined }),
      "Automatic salon onboarding is unavailable for this older application",
    ],
  ])("does not offer confirmation for non-actionable states", (application, message) => {
    render(<JobOnboardingConsentCard application={application} />);

    expect(screen.getByText(message, { exact: false })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Confirm salon onboarding" })
    ).not.toBeInTheDocument();
  });

  it("does not display application A's late error after switching to B", async () => {
    const user = userEvent.setup();
    const pending = deferred();
    confirmJobOnboarding.mockReturnValue(pending.promise);
    const { rerender } = render(<JobOnboardingConsentCard application={app()} />);

    await user.click(
      screen.getByRole("button", { name: "Confirm salon onboarding" })
    );
    rerender(<JobOnboardingConsentCard application={app({ id: "application-b" })} />);

    await act(async () => {
      pending.reject({ response: { data: { message: "A failed" } } });
      await pending.promise.catch(() => {});
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm salon onboarding" })
    ).toBeEnabled();
  });

  it("keeps B usable while application A's late result resolves", async () => {
    const user = userEvent.setup();
    const onApplicationConfirmed = vi.fn();
    const pendingA = deferred();
    const pendingB = deferred();
    confirmJobOnboarding
      .mockReturnValueOnce(pendingA.promise)
      .mockReturnValueOnce(pendingB.promise);
    const { rerender } = render(
      <JobOnboardingConsentCard
        application={app()}
        onApplicationConfirmed={onApplicationConfirmed}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Confirm salon onboarding" })
    );
    rerender(
      <JobOnboardingConsentCard
        application={app({ id: "application-b" })}
        onApplicationConfirmed={onApplicationConfirmed}
      />
    );

    const bButton = screen.getByRole("button", {
      name: "Confirm salon onboarding",
    });
    expect(bButton).toBeEnabled();
    await user.click(bButton);
    expect(confirmJobOnboarding).toHaveBeenNthCalledWith(2, "application-b");

    await act(async () => {
      pendingA.resolve({
        data: { application: app({ onboardingStatus: "confirmed" }) },
      });
      await pendingA.promise;
    });

    expect(onApplicationConfirmed).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Confirming salon onboarding/ })
    ).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await act(async () => {
      pendingB.resolve({
        data: {
          application: app({ id: "application-b", onboardingStatus: "confirmed" }),
        },
      });
      await pendingB.promise;
    });

    expect(onApplicationConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ id: "application-b" })
    );
  });

  it("ignores a late result after unmount", async () => {
    const onApplicationConfirmed = vi.fn();
    const pending = deferred();
    confirmJobOnboarding.mockReturnValue(pending.promise);
    const view = render(
      <JobOnboardingConsentCard
        application={app()}
        onApplicationConfirmed={onApplicationConfirmed}
      />
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Confirm salon onboarding" }));
    view.unmount();

    await act(async () => {
      pending.resolve({ data: { application: app({ onboardingStatus: "confirmed" }) } });
      await pending.promise;
    });

    expect(onApplicationConfirmed).not.toHaveBeenCalled();
  });
});
