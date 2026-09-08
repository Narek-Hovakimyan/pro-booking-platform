import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import JobApplicationsDialog from "./JobApplicationsDialog";
import api from "@/shared/api/axios";

vi.mock("@/shared/api/axios", () => ({
  default: { get: vi.fn(), patch: vi.fn() },
}));

const job = { id: "job-a", title: "Barber" };

const application = (overrides = {}) => ({
  id: "application-a",
  applicant: { name: "Taylor" },
  message: "I would like to apply.",
  status: "accepted",
  ...overrides,
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
};

const renderDialog = (applications) => {
  api.get.mockResolvedValue({ data: applications });
  return render(<JobApplicationsDialog job={job} onClose={vi.fn()} />);
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("JobApplicationsDialog", () => {
  it.each([
    ["pending consent", { onboardingStatus: "pending_consent" }, "Waiting for applicant confirmation."],
    ["confirmed", { onboardingStatus: "confirmed" }, "Salon onboarding confirmed."],
    ["blocked", { onboardingStatus: "blocked" }, "Automatic onboarding unavailable; manual follow-up may be needed."],
    ["null", { onboardingStatus: null }, "Onboarding status unavailable; manual follow-up."],
    ["missing", {}, "Onboarding status unavailable; manual follow-up."],
    ["unknown", { onboardingStatus: "future_state" }, "Onboarding status unavailable; manual follow-up."],
  ])("shows the accepted onboarding state for %s", async (_description, overrides, label) => {
    renderDialog([application(overrides)]);

    expect(await screen.findByText(label)).toBeVisible();
  });

  it("keeps a non-accepted application status primary", async () => {
    renderDialog([application({ status: "pending", onboardingStatus: "confirmed" })]);

    expect(await screen.findByRole("combobox", { name: "Status" })).toHaveValue("pending");
    expect(screen.queryByText("Salon onboarding confirmed.")).not.toBeInTheDocument();
  });

  it("keeps job B authoritative when job A resolves late", async () => {
    const first = deferred();
    const second = deferred();
    const jobB = { id: "job-b", title: "Nail artist" };
    api.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<JobApplicationsDialog job={job} onClose={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    view.rerender(<JobApplicationsDialog job={jobB} onClose={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));

    await act(async () => {
      second.resolve({ data: [application({ id: "application-b", onboardingStatus: "confirmed" })] });
      await second.promise;
    });
    expect(await screen.findByText("Salon onboarding confirmed.")).toBeVisible();

    await act(async () => {
      first.resolve({ data: [application({ onboardingStatus: "blocked" })] });
      await first.promise;
    });
    expect(screen.queryByText("Automatic onboarding unavailable; manual follow-up may be needed.")).not.toBeInTheDocument();
  });

  it("keeps job B loading when job A reaches its stale finally", async () => {
    const first = deferred();
    const second = deferred();
    api.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<JobApplicationsDialog job={job} onClose={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    view.rerender(<JobApplicationsDialog job={{ id: "job-b", title: "Nail artist" }} onClose={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(view.container.querySelectorAll(".animate-pulse")).toHaveLength(3);

    await act(async () => {
      first.resolve({ data: [application({ onboardingStatus: "blocked" })] });
      await first.promise;
    });
    expect(view.container.querySelectorAll(".animate-pulse")).toHaveLength(3);

    await act(async () => {
      second.resolve({ data: [application({ id: "application-b", onboardingStatus: "confirmed" })] });
      await second.promise;
    });
    expect(await screen.findByText("Salon onboarding confirmed.")).toBeVisible();
  });

  it("ignores a late job A error after job B has loaded", async () => {
    const first = deferred();
    const second = deferred();
    api.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<JobApplicationsDialog job={job} onClose={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    view.rerender(<JobApplicationsDialog job={{ id: "job-b", title: "Nail artist" }} onClose={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    await act(async () => {
      second.resolve({ data: [application({ id: "application-b", onboardingStatus: "pending_consent" })] });
      await second.promise;
    });
    expect(await screen.findByText("Waiting for applicant confirmation.")).toBeVisible();

    await act(async () => {
      first.reject({ response: { data: { message: "Job A failed" } } });
      await first.promise.catch(() => {});
    });
    expect(screen.queryByText("Job A failed")).not.toBeInTheDocument();
  });

  it("refetches current authoritative statuses after reopening and ignores late completion after unmount", async () => {
    const first = deferred();
    api.get.mockReturnValueOnce(first.promise);
    const firstView = render(<JobApplicationsDialog job={job} onClose={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    firstView.unmount();
    await act(async () => {
      first.resolve({ data: [application({ onboardingStatus: "blocked" })] });
      await first.promise;
    });
    expect(screen.queryByText("Automatic onboarding unavailable; manual follow-up may be needed.")).not.toBeInTheDocument();

    api.get.mockResolvedValueOnce({ data: [application({ onboardingStatus: "confirmed" })] });
    render(<JobApplicationsDialog job={job} onClose={vi.fn()} />);
    expect(await screen.findByText("Salon onboarding confirmed.")).toBeVisible();
    expect(api.get).toHaveBeenLastCalledWith("/salon-jobs/job-a/applications");
  });

  it("uses the authoritative accept response and preserves status actions", async () => {
    const user = userEvent.setup();
    const pendingApplication = application({ status: "pending" });
    const acceptedApplication = application({ onboardingStatus: "pending_consent" });
    const rejectedApplication = application({ status: "rejected" });
    api.patch
      .mockResolvedValueOnce({ data: acceptedApplication })
      .mockResolvedValueOnce({ data: rejectedApplication });
    renderDialog([pendingApplication]);

    const statusSelect = await screen.findByRole("combobox", { name: "Status" });
    await user.selectOptions(statusSelect, "accepted");

    expect(api.patch).toHaveBeenCalledWith(
      "/salon-jobs/applications/application-a/status",
      { status: "accepted" }
    );
    expect(await screen.findByText("Waiting for applicant confirmation.")).toBeVisible();
    expect(statusSelect).toHaveValue("accepted");
    expect(
      screen.queryByRole("button", { name: "Confirm onboarding" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry onboarding" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Force onboarding" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Override onboarding" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create membership" })
    ).not.toBeInTheDocument();

    await user.selectOptions(statusSelect, "rejected");

    expect(api.patch).toHaveBeenLastCalledWith(
      "/salon-jobs/applications/application-a/status",
      { status: "rejected" }
    );
    await waitFor(() => expect(statusSelect).toHaveValue("rejected"));
    expect(
      screen.queryByText("Waiting for applicant confirmation.")
    ).not.toBeInTheDocument();
  });
});
