import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePlatformSalonBillingDetail } from "./usePlatformSalonBillingDetail";

const mocks = vi.hoisted(() => ({
  getDetail: vi.fn(),
  getPayments: vi.fn(),
  getAttempts: vi.fn(),
  getSeatManagement: vi.fn(),
}));

vi.mock("@/shared/api/platformBilling", () => ({
  getPlatformBillingSalonDetail: mocks.getDetail,
  getPlatformBillingSalonTransactions: mocks.getPayments,
  getPlatformBillingSalonPaymentAttempts: mocks.getAttempts,
  getPlatformBillingSalonSeatManagement: mocks.getSeatManagement,
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function detailFor(id, name = id) {
  return { salon: { id, name } };
}

function HookHarness({ salonId, mutation = vi.fn(), loadSeatManagement = false }) {
  const {
    detail,
    error,
    refreshWarning,
    isSubmitting,
    mutationError,
    seatManagement,
    seatManagementError,
    executeMutation,
  } = usePlatformSalonBillingDetail(salonId, { loadSeatManagement });

  return (
    <div>
      <p data-testid="detail">{detail?.salon?.name || "none"}</p>
      <p data-testid="error">{error}</p>
      <p data-testid="warning">{refreshWarning}</p>
      <p data-testid="mutation-error">{mutationError}</p>
      <p data-testid="submitting">{String(isSubmitting)}</p>
      <p data-testid="seat-management">{seatManagement?.salonId || "none"}</p>
      <p data-testid="seat-management-error">{seatManagementError}</p>
      <button
        type="button"
        onClick={() =>
          executeMutation({ apiCall: mutation, note: "audit", targetSalonId: salonId })
        }
      >
        Mutate
      </button>
    </div>
  );
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.getPayments.mockResolvedValue({ transactions: [], total: 0 });
  mocks.getAttempts.mockResolvedValue({ paymentAttempts: [], total: 0 });
  mocks.getSeatManagement.mockResolvedValue({ salonId: "default" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usePlatformSalonBillingDetail", () => {
  it("ignores a stale initial detail after the route changes", async () => {
    const requestA = deferred();
    const requestB = deferred();
    mocks.getDetail.mockImplementation((id) =>
      id === "salon-a" ? requestA.promise : requestB.promise
    );
    const { rerender } = render(<HookHarness salonId="salon-a" />);

    rerender(<HookHarness salonId="salon-b" />);
    requestB.resolve(detailFor("salon-b", "Salon B"));
    expect(await screen.findByTestId("detail")).toHaveTextContent("Salon B");

    await act(async () => {
      requestA.resolve(detailFor("salon-a", "Salon A"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("detail")).toHaveTextContent("Salon B");
  });

  it("ignores a stale initial error after the route changes", async () => {
    const requestA = deferred();
    const requestB = deferred();
    mocks.getDetail.mockImplementation((id) =>
      id === "salon-a" ? requestA.promise : requestB.promise
    );
    const { rerender } = render(<HookHarness salonId="salon-a" />);

    rerender(<HookHarness salonId="salon-b" />);
    requestB.resolve(detailFor("salon-b", "Salon B"));
    await screen.findByText("Salon B");

    await act(async () => {
      requestA.reject({ response: { data: { message: "Old request failed" } } });
      await Promise.resolve();
    });
    expect(screen.getByTestId("error")).toHaveTextContent("");
    expect(screen.getByTestId("detail")).toHaveTextContent("Salon B");
  });

  it("does not update state after unmount", async () => {
    const request = deferred();
    mocks.getDetail.mockReturnValue(request.promise);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<HookHarness salonId="salon-a" />);

    unmount();
    await act(async () => {
      request.resolve(detailFor("salon-a", "Salon A"));
      await Promise.resolve();
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("does not apply stale seat management data after route navigation", async () => {
    const managementA = deferred();
    const managementB = deferred();
    mocks.getDetail.mockImplementation((id) => Promise.resolve(detailFor(id, id)));
    mocks.getSeatManagement.mockImplementation((id) =>
      id === "salon-a" ? managementA.promise : managementB.promise
    );
    const { rerender } = render(<HookHarness salonId="salon-a" loadSeatManagement />);
    await screen.findByText("salon-a");

    rerender(<HookHarness salonId="salon-b" loadSeatManagement />);
    await screen.findByText("salon-b");
    managementB.resolve({ salonId: "salon-b" });
    expect(await screen.findByTestId("seat-management")).toHaveTextContent("salon-b");

    await act(async () => {
      managementA.resolve({ salonId: "salon-a" });
      await Promise.resolve();
    });
    expect(screen.getByTestId("seat-management")).toHaveTextContent("salon-b");
  });

  it("submits only one duplicate mutation while it is pending", async () => {
    const mutation = deferred();
    const mutationCall = vi.fn(() => mutation.promise);
    mocks.getDetail.mockResolvedValue(detailFor("salon-a", "Salon A"));
    render(<HookHarness salonId="salon-a" mutation={mutationCall} />);
    await screen.findByText("Salon A");

    const button = screen.getByRole("button", { name: "Mutate" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mutationCall).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("submitting")).toHaveTextContent("true");
  });

  it("applies a confirmed mutation and then authoritative reconciliation", async () => {
    const reconciliation = deferred();
    const initial = detailFor("salon-a", "Initial");
    const mutationResult = detailFor("salon-a", "Mutation result");
    const reconciled = detailFor("salon-a", "Reconciled");
    mocks.getDetail
      .mockResolvedValueOnce(initial)
      .mockReturnValueOnce(reconciliation.promise);
    const mutation = vi.fn().mockResolvedValue(mutationResult);
    render(<HookHarness salonId="salon-a" mutation={mutation} />);
    await screen.findByText("Initial");

    fireEvent.click(screen.getByRole("button", { name: "Mutate" }));
    expect(await screen.findByText("Mutation result")).toBeInTheDocument();
    reconciliation.resolve(reconciled);
    expect(await screen.findByText("Reconciled")).toBeInTheDocument();
    expect(screen.getByTestId("warning")).toHaveTextContent("");
  });

  it("keeps confirmed mutation detail when reconciliation fails", async () => {
    const reconciliation = deferred();
    const mutationResult = detailFor("salon-a", "Mutation result");
    mocks.getDetail
      .mockResolvedValueOnce(detailFor("salon-a", "Initial"))
      .mockReturnValueOnce(reconciliation.promise);
    render(
      <HookHarness
        salonId="salon-a"
        mutation={vi.fn().mockResolvedValue(mutationResult)}
      />
    );
    await screen.findByText("Initial");

    fireEvent.click(screen.getByRole("button", { name: "Mutate" }));
    expect(await screen.findByText("Mutation result")).toBeInTheDocument();
    reconciliation.reject({ response: { status: 500 } });
    expect(await screen.findByTestId("warning")).toHaveTextContent(
      "Action succeeded, but the latest billing data could not be refreshed."
    );
    expect(screen.getByTestId("mutation-error")).toHaveTextContent("");
  });

  it("does not let a late mutation update a new route", async () => {
    const mutation = deferred();
    const detailB = deferred();
    mocks.getDetail.mockImplementation((id) =>
      id === "salon-a" ? Promise.resolve(detailFor("salon-a", "Salon A")) : detailB.promise
    );
    const { rerender } = render(
      <HookHarness salonId="salon-a" mutation={() => mutation.promise} />
    );
    await screen.findByText("Salon A");
    fireEvent.click(screen.getByRole("button", { name: "Mutate" }));

    rerender(<HookHarness salonId="salon-b" mutation={() => mutation.promise} />);
    detailB.resolve(detailFor("salon-b", "Salon B"));
    expect(await screen.findByText("Salon B")).toBeInTheDocument();

    await act(async () => {
      mutation.resolve(detailFor("salon-a", "Late mutation"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("detail")).toHaveTextContent("Salon B");
    expect(screen.queryByText("Late mutation")).not.toBeInTheDocument();
  });

  it("does not let an old reconciliation overwrite a newer route", async () => {
    const reconciliation = deferred();
    const detailB = deferred();
    mocks.getDetail
      .mockResolvedValueOnce(detailFor("salon-a", "Initial"))
      .mockReturnValueOnce(reconciliation.promise)
      .mockImplementation((id) => (id === "salon-b" ? detailB.promise : Promise.resolve()));
    const { rerender } = render(
      <HookHarness
        salonId="salon-a"
        mutation={vi.fn().mockResolvedValue(detailFor("salon-a", "Mutation result"))}
      />
    );
    await screen.findByText("Initial");
    fireEvent.click(screen.getByRole("button", { name: "Mutate" }));
    await screen.findByText("Mutation result");

    rerender(<HookHarness salonId="salon-b" />);
    detailB.resolve(detailFor("salon-b", "Salon B"));
    expect(await screen.findByText("Salon B")).toBeInTheDocument();

    await act(async () => {
      reconciliation.resolve(detailFor("salon-a", "Old reconciliation"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("detail")).toHaveTextContent("Salon B");
  });
});
