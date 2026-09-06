import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes, useNavigate } from "react-router-dom";

import { renderWithProviders } from "@/test/renderWithProviders";
import PlatformSalonBillingDetailPage from "./PlatformSalonBillingDetailPage";

const mocks = vi.hoisted(() => ({
  getDetail: vi.fn(),
  getPayments: vi.fn(),
  activate: vi.fn(),
  updateSeatCount: vi.fn(),
  assignSeat: vi.fn(),
  revokeSeat: vi.fn(),
  cancel: vi.fn(),
  confirmPayment: vi.fn(),
}));

vi.mock("@/shared/api/platformBilling", () => ({
  getPlatformBillingSalonDetail: mocks.getDetail,
  getPlatformBillingSalonPayments: mocks.getPayments,
  activatePlatformSalonSubscription: mocks.activate,
  updatePlatformSalonSeatCount: mocks.updateSeatCount,
  assignPlatformSalonSeat: mocks.assignSeat,
  revokePlatformSalonSeat: mocks.revokeSeat,
  cancelPlatformSalonSubscription: mocks.cancel,
  confirmPlatformSalonPayment: mocks.confirmPayment,
}));

vi.mock("@/shared/utils/platformAccess", () => ({
  canAccessPlatform: () => true,
}));

vi.mock("../components/billing/SalonBillingHeader", () => ({
  SalonBillingHeader: ({ salon, subscription, onActivate, onCancel, successMessage }) => (
    <header>
      <h1>{salon?.name}</h1>
      <button type="button" onClick={onActivate}>
        {subscription ? "Renew subscription" : "Activate subscription"}
      </button>
      {subscription?.status === "active" && (
        <button type="button" onClick={onCancel}>
          Cancel subscription
        </button>
      )}
      {successMessage && <p>{successMessage}</p>}
    </header>
  ),
}));

vi.mock("../components/billing/SalonBillingSummaryCards", () => ({
  SalonBillingSummaryCards: ({ subscription }) =>
    subscription ? <p>Period end: {subscription.currentPeriodEnd}</p> : null,
}));
vi.mock("../components/billing/SalonBillingStaffTable", () => ({
  SalonBillingStaffTable: () => null,
}));
vi.mock("../components/billing/SalonBillingPendingPaymentCard", () => ({
  SalonBillingPendingPaymentCard: () => null,
}));
vi.mock("../components/billing/SalonBillingPaymentHistory", () => ({
  SalonBillingPaymentHistory: ({ payments }) => (
    <div aria-label="payment history">
      {(payments || []).map((payment) => (
        <span key={payment.id}>{payment.id}</span>
      ))}
    </div>
  ),
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

function detailFor(id, name = id === "salon-a" ? "Salon A" : "Salon B", subscription = null) {
  return {
    salon: { id, name },
    owner: null,
    subscription,
    seats: { assignments: [], total: 0, used: 0, available: 0 },
    acceptedStaff: [],
    latestPendingAttempt: null,
  };
}

function RouteHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/admin/platform/billing/salons/salon-b")}>
        Go to B
      </button>
      <Routes>
        <Route
          path="/admin/platform/billing/salons/:salonId"
          element={<PlatformSalonBillingDetailPage />}
        />
      </Routes>
    </>
  );
}

function renderPage() {
  return renderWithProviders(<RouteHarness />, {
    initialEntries: ["/admin/platform/billing/salons/salon-a"],
    preloadedState: {
      auth: {
        currentUser: { _id: "platform-1", canAccessPlatform: true },
        token: "token",
        isAuthenticated: true,
      },
    },
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.getPayments.mockResolvedValue({ payments: [], total: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlatformSalonBillingDetailPage request isolation", () => {
  it("does not render a stale A detail after B resolves first", async () => {
    const detailA = deferred();
    const detailB = deferred();
    mocks.getDetail.mockImplementation((id) =>
      id === "salon-a" ? detailA.promise : detailB.promise
    );

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Go to B" }));
    detailB.resolve(detailFor("salon-b"));

    expect(await screen.findByRole("heading", { name: "Salon B" })).toBeInTheDocument();
    detailA.resolve(detailFor("salon-a"));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Salon A" })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Salon B" })).toBeInTheDocument();
    });
  });

  it("does not let stale A payments overwrite B payments", async () => {
    const paymentsA = deferred();
    const paymentsB = deferred();
    const detailB = deferred();
    mocks.getDetail.mockImplementation((id) =>
      id === "salon-a" ? Promise.resolve(detailFor("salon-a")) : detailB.promise
    );
    mocks.getPayments.mockImplementation((id) =>
      id === "salon-a" ? paymentsA.promise : paymentsB.promise
    );

    renderPage();
    expect(await screen.findByRole("heading", { name: "Salon A" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to B" }));
    detailB.resolve(detailFor("salon-b"));
    expect(await screen.findByRole("heading", { name: "Salon B" })).toBeInTheDocument();

    paymentsB.resolve({ payments: [{ id: "payment-b" }], total: 1 });
    expect(await screen.findByText("payment-b")).toBeInTheDocument();
    paymentsA.resolve({ payments: [{ id: "payment-a" }], total: 1 });

    await waitFor(() => {
      expect(screen.queryByText("payment-a")).not.toBeInTheDocument();
      expect(screen.getByText("payment-b")).toBeInTheDocument();
    });
  });

  it("ignores A payment results from a mutation that finishes after switching to B", async () => {
    const detailB = deferred();
    const stalePaymentsA = deferred();
    const detailA = detailFor("salon-a");
    let salonAPaymentCalls = 0;
    mocks.getDetail.mockImplementation((id) =>
      id === "salon-a" ? Promise.resolve(detailA) : detailB.promise
    );
    mocks.getPayments.mockImplementation((id) => {
      if (id === "salon-a") {
        salonAPaymentCalls += 1;
        return salonAPaymentCalls === 1
          ? Promise.resolve({ payments: [], total: 0 })
          : stalePaymentsA.promise;
      }
      return Promise.resolve({ payments: [{ id: "payment-b" }], total: 1 });
    });
    mocks.activate.mockResolvedValue({});

    renderPage();
    await screen.findByRole("heading", { name: "Salon A" });
    fireEvent.click(screen.getByRole("button", { name: "Activate subscription" }));
    fireEvent.change(screen.getByLabelText(/Audit note/), {
      target: { value: "A action" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await waitFor(() => expect(salonAPaymentCalls).toBeGreaterThan(1));

    fireEvent.click(screen.getByRole("button", { name: "Go to B" }));
    detailB.resolve(detailFor("salon-b"));
    expect(await screen.findByRole("heading", { name: "Salon B" })).toBeInTheDocument();
    expect(await screen.findByText("payment-b")).toBeInTheDocument();

    stalePaymentsA.resolve({ payments: [{ id: "payment-a" }], total: 1 });
    await waitFor(() => {
      expect(screen.queryByText("payment-a")).not.toBeInTheDocument();
      expect(screen.getByText("payment-b")).toBeInTheDocument();
    });
  });

  it("closes A confirmation state and binds the next action to B", async () => {
    const detailB = deferred();
    mocks.getDetail.mockImplementation((id) =>
      id === "salon-a" ? Promise.resolve(detailFor("salon-a")) : detailB.promise
    );
    mocks.activate.mockResolvedValue({});

    renderPage();
    await screen.findByRole("heading", { name: "Salon A" });
    fireEvent.click(screen.getByRole("button", { name: "Activate subscription" }));
    expect(screen.getByLabelText(/Audit note/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Go to B" }));
    expect(screen.queryByLabelText(/Audit note/)).not.toBeInTheDocument();
    detailB.resolve(detailFor("salon-b"));
    await screen.findByRole("heading", { name: "Salon B" });

    fireEvent.click(screen.getByRole("button", { name: "Activate subscription" }));
    fireEvent.change(screen.getByLabelText(/Audit note/), {
      target: { value: "B action" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() => {
      expect(mocks.activate).toHaveBeenCalledWith("salon-b", expect.any(Object));
    });
    expect(mocks.activate).not.toHaveBeenCalledWith("salon-a", expect.anything());
  });

  it("ignores a stale rejected request after B has loaded", async () => {
    const detailA = deferred();
    const detailB = deferred();
    mocks.getDetail.mockImplementation((id) =>
      id === "salon-a" ? detailA.promise : detailB.promise
    );

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Go to B" }));
    detailB.resolve(detailFor("salon-b"));
    expect(await screen.findByRole("heading", { name: "Salon B" })).toBeInTheDocument();
    detailA.reject({ response: { status: 500, data: { message: "stale A failure" } } });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Salon B" })).toBeInTheDocument();
      expect(screen.queryByText("stale A failure")).not.toBeInTheDocument();
      expect(screen.queryByText("Failed to load salon billing detail.")).not.toBeInTheDocument();
    });
  });

  it("keeps a confirmed renewal successful when reconciliation fails", async () => {
    const initialSubscription = {
      id: "subscription-a",
      status: "active",
      provider: "manual",
      seatCount: 2,
      pricePerSeat: 5000,
      totalPrice: 10000,
      currentPeriodStart: "2026-01-01T00:00:00.000Z",
      currentPeriodEnd: "2026-02-01T00:00:00.000Z",
    };
    const renewedSubscription = {
      ...initialSubscription,
      currentPeriodStart: "2026-02-01T00:00:00.000Z",
      currentPeriodEnd: "2026-03-01T00:00:00.000Z",
    };
    const updatedDetail = detailFor("salon-a", "Salon A", renewedSubscription);
    mocks.getDetail
      .mockResolvedValueOnce(detailFor("salon-a", "Salon A", initialSubscription))
      .mockRejectedValueOnce({
        response: { status: 500, data: { message: "detail refresh unavailable" } },
      });
    mocks.activate.mockResolvedValue(updatedDetail);

    renderPage();
    await screen.findByRole("heading", { name: "Salon A" });
    expect(screen.getByText("Period end: 2026-02-01T00:00:00.000Z")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Renew subscription" }));
    fireEvent.change(screen.getByLabelText(/Audit note/), {
      target: { value: "renew A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Renew" }));

    expect(await screen.findByText("Period end: 2026-03-01T00:00:00.000Z")).toBeInTheDocument();
    expect(screen.queryByText("Period end: 2026-02-01T00:00:00.000Z")).not.toBeInTheDocument();
    expect(screen.getByText("Action completed successfully.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Action succeeded, but the latest billing data could not be refreshed."
    );
    expect(screen.queryByLabelText(/Audit note/)).not.toBeInTheDocument();
    expect(screen.queryByText("detail refresh unavailable")).not.toBeInTheDocument();
    expect(mocks.activate).toHaveBeenCalledTimes(1);
  });

  it("keeps mutation failure separate from a confirmed refresh warning", async () => {
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));
    mocks.activate.mockRejectedValue({
      response: { status: 400, data: { message: "Renewal was rejected" } },
    });

    renderPage();
    await screen.findByRole("heading", { name: "Salon A" });
    fireEvent.click(screen.getByRole("button", { name: "Activate subscription" }));
    fireEvent.change(screen.getByLabelText(/Audit note/), {
      target: { value: "renew A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    expect(await screen.findByText("Renewal was rejected")).toBeInTheDocument();
    expect(screen.queryByText("Action completed successfully.")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Audit note/)).toBeInTheDocument();
  });

  it("does not submit the same action twice while the mutation is pending", async () => {
    const activation = deferred();
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));
    mocks.activate.mockReturnValue(activation.promise);

    renderPage();
    await screen.findByRole("heading", { name: "Salon A" });
    fireEvent.click(screen.getByRole("button", { name: "Activate subscription" }));
    fireEvent.change(screen.getByLabelText(/Audit note/), {
      target: { value: "renew A" },
    });
    const confirmButton = screen.getByRole("button", { name: "Activate" });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(mocks.activate).toHaveBeenCalledTimes(1);
    activation.resolve(detailFor("salon-a", "Salon A renewed"));
    expect(await screen.findByText("Action completed successfully.")).toBeInTheDocument();
  });

  it("moves focus to the page fallback when cancellation removes its trigger", async () => {
    const user = userEvent.setup();
    const activeSubscription = {
      id: "subscription-a",
      status: "active",
      provider: "manual",
      seatCount: 1,
    };
    const cancelledDetail = detailFor("salon-a", "Salon A", {
      ...activeSubscription,
      status: "cancelled",
    });
    mocks.getDetail
      .mockResolvedValueOnce(detailFor("salon-a", "Salon A", activeSubscription))
      .mockRejectedValueOnce({ response: { status: 500 } });
    mocks.cancel.mockResolvedValue(cancelledDetail);

    renderPage();
    await screen.findByRole("heading", { name: "Salon A" });
    await user.click(screen.getByRole("button", { name: "Cancel subscription" }));
    await user.type(screen.getByLabelText(/Audit note/), "cancelled by platform");
    await user.click(
      within(screen.getByRole("dialog", { name: "Cancel subscription" })).getByRole(
        "button",
        { name: "Cancel subscription" }
      )
    );

    await screen.findByText("Action completed successfully.");
    expect(screen.queryByRole("button", { name: "Cancel subscription" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Salon billing detail" })).toHaveFocus();
  });

  it("keeps same-salon mutation refresh behavior intact", async () => {
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));
    mocks.activate.mockResolvedValue({});

    renderPage();
    await screen.findByRole("heading", { name: "Salon A" });
    fireEvent.click(screen.getByRole("button", { name: "Activate subscription" }));
    fireEvent.change(screen.getByLabelText(/Audit note/), {
      target: { value: "renew A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() => {
      expect(mocks.activate).toHaveBeenCalledWith("salon-a", expect.any(Object));
      expect(screen.getByText("Action completed successfully.")).toBeInTheDocument();
    });
  });
});
