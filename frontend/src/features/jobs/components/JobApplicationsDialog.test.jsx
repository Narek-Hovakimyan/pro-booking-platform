import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mutationCompletionState = vi.hoisted(() => ({
  calls: [],
  capture: false,
  hookIndex: 0,
  setters: {},
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    useState(initialValue) {
      const state = actual.useState(initialValue);
      const stack = new Error().stack || "";

      if (
        !mutationCompletionState.capture ||
        !stack.includes("JobApplicationsDialog.jsx")
      ) {
        return state;
      }

      if (Array.isArray(initialValue)) {
        mutationCompletionState.hookIndex = 0;
      }

      const hookIndex = mutationCompletionState.hookIndex;
      mutationCompletionState.hookIndex += 1;

      if (![0, 1, 3].includes(hookIndex)) return state;

      const [, setState] = state;
      const observedSetter = (value) => {
        mutationCompletionState.calls.push({ hookIndex, value });
        return setState(value);
      };
      mutationCompletionState.setters[hookIndex] = observedSetter;
      return [state[0], observedSetter];
    },
  };
});

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
  mutationCompletionState.calls = [];
  mutationCompletionState.capture = false;
  mutationCompletionState.hookIndex = 0;
  mutationCompletionState.setters = {};
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

  it("keeps confirmed onboarding visible and prevents its terminal status from changing", async () => {
    renderDialog([application({ onboardingStatus: "confirmed" })]);

    expect(await screen.findByText("Salon onboarding confirmed.")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Status" })).toBeDisabled();
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

  it("ignores a stale job A status success after switching to job B", async () => {
    const user = userEvent.setup();
    const pendingMutation = deferred();
    const jobB = { id: "job-b", title: "Nail artist" };
    const jobBApplication = application({
      id: "application-b",
      applicant: { name: "Jordan" },
      status: "reviewed",
    });
    api.get
      .mockResolvedValueOnce({ data: [application({ status: "pending" })] })
      .mockResolvedValueOnce({ data: [jobBApplication] });
    api.patch.mockReturnValueOnce(pendingMutation.promise);
    const view = render(<JobApplicationsDialog job={job} onClose={vi.fn()} />);

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Status" }),
      "accepted"
    );
    expect(api.patch).toHaveBeenCalledTimes(1);

    view.rerender(<JobApplicationsDialog job={jobB} onClose={vi.fn()} />);
    const jobBSelect = await screen.findByRole("combobox", { name: "Status" });
    expect(jobBSelect).toHaveValue("reviewed");

    await act(async () => {
      pendingMutation.resolve({
        data: application({ status: "accepted", onboardingStatus: "pending_consent" }),
      });
      await pendingMutation.promise;
    });

    expect(jobBSelect).toHaveValue("reviewed");
    expect(screen.queryByText("Waiting for applicant confirmation.")).not.toBeInTheDocument();
  });

  it("ignores a stale job A status error after switching to job B", async () => {
    const user = userEvent.setup();
    const pendingMutation = deferred();
    const jobB = { id: "job-b", title: "Nail artist" };
    api.get
      .mockResolvedValueOnce({ data: [application({ status: "pending" })] })
      .mockResolvedValueOnce({ data: [application({ id: "application-b", status: "reviewed" })] });
    api.patch.mockReturnValueOnce(pendingMutation.promise);
    const view = render(<JobApplicationsDialog job={job} onClose={vi.fn()} />);

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Status" }),
      "accepted"
    );
    view.rerender(<JobApplicationsDialog job={jobB} onClose={vi.fn()} />);
    expect(await screen.findByRole("combobox", { name: "Status" })).toHaveValue("reviewed");

    await act(async () => {
      pendingMutation.reject({ response: { data: { message: "Job A update failed" } } });
      await pendingMutation.promise.catch(() => {});
    });

    expect(screen.queryByText("Job A update failed")).not.toBeInTheDocument();
  });

  it("keeps job B updating when job A reaches its stale mutation finally", async () => {
    const user = userEvent.setup();
    const jobAMutation = deferred();
    const jobBMutation = deferred();
    const jobB = { id: "job-b", title: "Nail artist" };
    api.get
      .mockResolvedValueOnce({ data: [application({ status: "pending" })] })
      .mockResolvedValueOnce({ data: [application({ id: "application-b", status: "pending" })] });
    api.patch
      .mockReturnValueOnce(jobAMutation.promise)
      .mockReturnValueOnce(jobBMutation.promise);
    const view = render(<JobApplicationsDialog job={job} onClose={vi.fn()} />);

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Status" }),
      "accepted"
    );
    view.rerender(<JobApplicationsDialog job={jobB} onClose={vi.fn()} />);
    const jobBSelect = await screen.findByRole("combobox", { name: "Status" });
    await user.selectOptions(jobBSelect, "accepted");
    await waitFor(() => expect(jobBSelect).toBeDisabled());

    await act(async () => {
      jobAMutation.resolve({ data: application({ status: "accepted" }) });
      await jobAMutation.promise;
    });
    expect(jobBSelect).toBeDisabled();

    await act(async () => {
      jobBMutation.resolve({
        data: application({ id: "application-b", status: "accepted", onboardingStatus: "pending_consent" }),
      });
      await jobBMutation.promise;
    });
    await waitFor(() => expect(jobBSelect).not.toBeDisabled());
    expect(jobBSelect).toHaveValue("accepted");
  });

  it("ignores an old mutation after closing and reopening the same job", async () => {
    const user = userEvent.setup();
    const pendingMutation = deferred();
    const reopenedApplication = application({ id: "application-reopened", status: "reviewed" });
    api.get
      .mockResolvedValueOnce({ data: [application({ status: "pending" })] })
      .mockResolvedValueOnce({ data: [reopenedApplication] });
    api.patch.mockReturnValueOnce(pendingMutation.promise);
    const view = render(<JobApplicationsDialog job={job} onClose={vi.fn()} />);

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Status" }),
      "accepted"
    );
    view.rerender(<JobApplicationsDialog job={null} onClose={vi.fn()} />);
    view.rerender(<JobApplicationsDialog job={job} onClose={vi.fn()} />);
    const reopenedSelect = await screen.findByRole("combobox", { name: "Status" });
    expect(reopenedSelect).toHaveValue("reviewed");

    await act(async () => {
      pendingMutation.resolve({ data: application({ status: "accepted" }) });
      await pendingMutation.promise;
    });
    expect(reopenedSelect).toHaveValue("reviewed");
  });

  it("does not attempt success or cleanup state after an unmounted mutation settles", async () => {
    const user = userEvent.setup();
    const pendingMutation = deferred();
    mutationCompletionState.capture = true;
    api.get.mockResolvedValueOnce({ data: [application({ status: "pending" })] });
    api.patch.mockReturnValueOnce(pendingMutation.promise);
    const view = render(<JobApplicationsDialog job={job} onClose={vi.fn()} />);
    expect(mutationCompletionState.setters[0]).toEqual(expect.any(Function));
    expect(mutationCompletionState.setters[3]).toEqual(expect.any(Function));

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Status" }),
      "accepted"
    );
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    mutationCompletionState.calls = [];
    view.unmount();

    await act(async () => {
      pendingMutation.resolve({ data: application({ status: "accepted" }) });
      await pendingMutation.promise;
    });

    expect(mutationCompletionState.calls).toEqual([]);
  });

  it("does not attempt error or cleanup state after an unmounted mutation rejects", async () => {
    const user = userEvent.setup();
    const pendingMutation = deferred();
    mutationCompletionState.capture = true;
    api.get.mockResolvedValueOnce({ data: [application({ status: "pending" })] });
    api.patch.mockReturnValueOnce(pendingMutation.promise);
    const view = render(<JobApplicationsDialog job={job} onClose={vi.fn()} />);
    expect(mutationCompletionState.setters[1]).toEqual(expect.any(Function));
    expect(mutationCompletionState.setters[3]).toEqual(expect.any(Function));

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Status" }),
      "accepted"
    );
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    mutationCompletionState.calls = [];
    view.unmount();

    await act(async () => {
      pendingMutation.reject({ response: { data: { message: "Late failure" } } });
      await pendingMutation.promise.catch(() => {});
    });

    expect(mutationCompletionState.calls).toEqual([]);
  });

  it("shows a current mutation error and clears its loading state", async () => {
    const user = userEvent.setup();
    const pendingMutation = deferred();
    api.get.mockResolvedValueOnce({ data: [application({ status: "pending" })] });
    api.patch.mockReturnValueOnce(pendingMutation.promise);
    render(<JobApplicationsDialog job={job} onClose={vi.fn()} />);

    const statusSelect = await screen.findByRole("combobox", { name: "Status" });
    await user.selectOptions(statusSelect, "accepted");
    await waitFor(() => expect(statusSelect).toBeDisabled());

    await act(async () => {
      pendingMutation.reject({ response: { data: { message: "Could not accept application" } } });
      await pendingMutation.promise.catch(() => {});
    });

    expect(await screen.findByText("Could not accept application")).toBeVisible();
    expect(statusSelect).not.toBeDisabled();
    expect(statusSelect).toHaveValue("pending");
  });
});
