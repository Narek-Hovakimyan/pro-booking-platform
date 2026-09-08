import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes, useNavigate } from "react-router-dom";

import { renderWithProviders } from "@/test/renderWithProviders";
import PlatformSalonBillingDetailPage from "./PlatformSalonBillingDetailPage";

const mocks = vi.hoisted(() => ({
  getDetail: vi.fn(),
  getPayments: vi.fn(),
  getAttempts: vi.fn(),
  getSeatManagement: vi.fn(),
  activate: vi.fn(),
  updateSeatCount: vi.fn(),
  assignSeat: vi.fn(),
  revokeSeat: vi.fn(),
  cancel: vi.fn(),
  confirmPayment: vi.fn(),
  canReadBilling: vi.fn(),
  canManageBilling: vi.fn(),
  recentAuth: vi.fn(),
}));

vi.mock("@/shared/api/platformBilling", () => ({
  getPlatformBillingSalonDetail: mocks.getDetail,
  getPlatformBillingSalonTransactions: mocks.getPayments,
  getPlatformBillingSalonPaymentAttempts: mocks.getAttempts,
  getPlatformBillingSalonSeatManagement: mocks.getSeatManagement,
  activatePlatformSalonSubscription: mocks.activate,
  updatePlatformSalonSeatCount: mocks.updateSeatCount,
  assignPlatformSalonSeat: mocks.assignSeat,
  revokePlatformSalonSeat: mocks.revokeSeat,
  cancelPlatformSalonSubscription: mocks.cancel,
  confirmPlatformSalonPayment: mocks.confirmPayment,
}));

vi.mock("@/shared/utils/platformAccess", () => ({
  canReadPlatformBilling: mocks.canReadBilling,
  canManagePlatformBilling: mocks.canManageBilling,
}));

vi.mock("@/shared/api/recentAuthentication", () => ({
  confirmRecentAuthentication: mocks.recentAuth,
}));

vi.mock("@react-oauth/google", () => ({
  GoogleLogin: ({ onError, onSuccess }) => (
    <>
      <button type="button" onClick={() => onSuccess({ credential: "fresh-google-credential" })}>Continue with Google</button>
      <button type="button" onClick={onError}>Google credential error</button>
    </>
  ),
}));

vi.mock("../components/billing/SalonBillingHeader", () => ({
  SalonBillingHeader: ({ salon, subscription, isPlatformAdmin, onActivate, onCancel, successMessage }) => (
    <header>
      <h1>{salon?.name}</h1>
      {isPlatformAdmin && (
        <button type="button" onClick={onActivate}>
          {subscription ? "Renew subscription" : "Activate subscription"}
        </button>
      )}
      {isPlatformAdmin && subscription?.status === "active" && (
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
  SalonBillingPaymentHistory: ({ title, payments }) => (
    <div aria-label={title || "payment history"}>
      <h2>{title}</h2>
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

function renderPage(recentAuthenticationMethods) {
  return renderWithProviders(<RouteHarness />, {
    initialEntries: ["/admin/platform/billing/salons/salon-a"],
    preloadedState: {
      auth: {
        currentUser: { _id: "platform-1", canAccessPlatform: true, recentAuthenticationMethods },
        token: "token",
        isAuthenticated: true,
      },
    },
  });
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.getPayments.mockResolvedValue({ transactions: [], total: 0 });
  mocks.getAttempts.mockResolvedValue({ paymentAttempts: [], total: 0 });
  mocks.getSeatManagement.mockResolvedValue({ seats: { assignments: [], total: 0, used: 0, available: 0 }, acceptedStaff: [], latestPendingAttempt: null });
  mocks.canReadBilling.mockReturnValue(true);
  mocks.canManageBilling.mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlatformSalonBillingDetailPage request isolation", () => {
  it("does not request seat management for a read-only billing user", async () => {
    mocks.canManageBilling.mockReturnValue(false);
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));

    renderPage();

    await screen.findByRole("heading", { name: "Salon A" });
    expect(mocks.getSeatManagement).not.toHaveBeenCalled();
  });

  it("keeps the billing overview usable when seat management loading fails", async () => {
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));
    mocks.getSeatManagement.mockRejectedValue({ response: { data: { message: "Seat data unavailable" } } });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Salon A" })).toBeInTheDocument();
    expect(await screen.findByText("Seat data unavailable")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Transactions" })).toBeInTheDocument();
  });

  it("renders transactions and payment attempts as separate read models", async () => {
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));
    mocks.getPayments.mockResolvedValue({ transactions: [{ id: "record-1", status: "paid" }], total: 1 });
    mocks.getAttempts.mockResolvedValue({ paymentAttempts: [{ id: "attempt-1", status: "failed" }], total: 1 });

    renderPage();

    expect(await screen.findByText("record-1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Transactions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payment Attempts" })).toBeInTheDocument();
    expect(screen.getByLabelText("Transactions")).toHaveTextContent("record-1");
    expect(screen.getByLabelText("Payment Attempts")).toHaveTextContent("attempt-1");
  });

  it("uses a fresh Google credential for Google-only recent authentication and retries once", async () => {
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));
    mocks.activate
      .mockRejectedValueOnce({ response: { status: 403, data: { code: "RECENT_AUTH_REQUIRED" } } })
      .mockResolvedValueOnce(detailFor("salon-a"));
    mocks.recentAuth.mockResolvedValue(undefined);

    renderPage(["google"]);
    await screen.findByRole("heading", { name: "Salon A" });
    fireEvent.click(screen.getByRole("button", { name: "Activate subscription" }));
    fireEvent.change(screen.getByLabelText(/Audit note/), { target: { value: "renew A" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await screen.findByRole("dialog", { name: "Confirm your identity" });
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(mocks.recentAuth).toHaveBeenCalledWith({ googleCredential: "fresh-google-credential" });
      expect(mocks.activate).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Action completed successfully.")).toBeInTheDocument();
    });
  });

  it("does not retry Google re-auth errors or a second recent-auth challenge", async () => {
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));
    mocks.activate.mockRejectedValue({ response: { status: 403, data: { code: "RECENT_AUTH_REQUIRED" } } });
    mocks.recentAuth.mockResolvedValue(undefined);

    renderPage(["google"]);
    await screen.findByRole("heading", { name: "Salon A" });
    fireEvent.click(screen.getByRole("button", { name: "Activate subscription" }));
    fireEvent.change(screen.getByLabelText(/Audit note/), { target: { value: "renew A" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await screen.findByRole("dialog", { name: "Confirm your identity" });
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByText("Recent authentication is still required. Please try again.")).toBeInTheDocument();
    expect(mocks.activate).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog", { name: "Confirm your identity" })).not.toBeInTheDocument();
  });

  it("keeps the challenged billing action idle when Google credential acquisition fails", async () => {
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));
    mocks.activate.mockRejectedValue({ response: { status: 403, data: { code: "RECENT_AUTH_REQUIRED" } } });

    renderPage(["google"]);
    await screen.findByRole("heading", { name: "Salon A" });
    fireEvent.click(screen.getByRole("button", { name: "Activate subscription" }));
    fireEvent.change(screen.getByLabelText(/Audit note/), { target: { value: "renew A" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await screen.findByRole("dialog", { name: "Confirm your identity" });
    fireEvent.click(screen.getByRole("button", { name: "Google credential error" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Google recent authentication failed.");
    expect(mocks.recentAuth).not.toHaveBeenCalled();
    expect(mocks.activate).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole("dialog", { name: "Confirm your identity" })).getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("cancels Google re-authentication without retrying the billing action", async () => {
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));
    mocks.activate.mockRejectedValue({ response: { status: 403, data: { code: "RECENT_AUTH_REQUIRED" } } });

    renderPage(["google"]);
    await screen.findByRole("heading", { name: "Salon A" });
    fireEvent.click(screen.getByRole("button", { name: "Activate subscription" }));
    fireEvent.change(screen.getByLabelText(/Audit note/), { target: { value: "renew A" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await screen.findByRole("dialog", { name: "Confirm your identity" });
    fireEvent.click(within(screen.getByRole("dialog", { name: "Confirm your identity" })).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Confirm your identity" })).not.toBeInTheDocument());
    expect(mocks.recentAuth).not.toHaveBeenCalled();
    expect(mocks.activate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Salon A" })).toBeInTheDocument();
  });

  it("offers both methods for mixed accounts and retries once through the selected Google path", async () => {
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));
    mocks.activate
      .mockRejectedValueOnce({ response: { status: 403, data: { code: "RECENT_AUTH_REQUIRED" } } })
      .mockResolvedValueOnce(detailFor("salon-a"));
    mocks.recentAuth.mockResolvedValue(undefined);

    renderPage(["password", "google"]);
    await screen.findByRole("heading", { name: "Salon A" });
    fireEvent.click(screen.getByRole("button", { name: "Activate subscription" }));
    fireEvent.change(screen.getByLabelText(/Audit note/), { target: { value: "renew A" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await screen.findByRole("dialog", { name: "Confirm your identity" });
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(mocks.recentAuth).toHaveBeenCalledWith({ googleCredential: "fresh-google-credential" });
      expect(mocks.activate).toHaveBeenCalledTimes(2);
    });
  });
  it("re-authenticates once and retries the same billing mutation", async () => {
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));
    mocks.activate
      .mockRejectedValueOnce({ response: { status: 403, data: { code: "RECENT_AUTH_REQUIRED" } } })
      .mockResolvedValueOnce(detailFor("salon-a"));
    mocks.recentAuth.mockResolvedValue(undefined);

    renderPage();
    await screen.findByRole("heading", { name: "Salon A" });
    fireEvent.click(screen.getByRole("button", { name: "Activate subscription" }));
    fireEvent.change(screen.getByLabelText(/Audit note/), { target: { value: "renew A" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await screen.findByRole("dialog", { name: "Confirm your identity" });
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "correct" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(mocks.recentAuth).toHaveBeenCalledWith({ currentPassword: "correct" });
      expect(mocks.activate).toHaveBeenCalledTimes(2);
    });
  });

  it("does not retry when recent authentication fails", async () => {
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));
    mocks.activate.mockRejectedValue({ response: { status: 403, data: { code: "RECENT_AUTH_REQUIRED" } } });
    mocks.recentAuth.mockRejectedValue({ response: { data: { message: "Recent authentication failed" } } });

    renderPage();
    await screen.findByRole("heading", { name: "Salon A" });
    fireEvent.click(screen.getByRole("button", { name: "Activate subscription" }));
    fireEvent.change(screen.getByLabelText(/Audit note/), { target: { value: "renew A" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await screen.findByRole("dialog", { name: "Confirm your identity" });
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Recent authentication failed");
    expect(mocks.activate).toHaveBeenCalledTimes(1);
  });

  it("keeps billing readers on the detail page without management controls", async () => {
    mocks.getDetail.mockResolvedValue(detailFor("salon-a", "Salon A", {
      id: "subscription-a",
      status: "active",
      provider: "manual",
      seatCount: 1,
    }));
    mocks.canManageBilling.mockReturnValue(false);

    renderPage();

    expect(await screen.findByRole("heading", { name: "Salon A" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Renew subscription|Activate subscription/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel subscription" })).not.toBeInTheDocument();
  });

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

    paymentsB.resolve({ transactions: [{ id: "payment-b" }], total: 1 });
    expect(await screen.findByText("payment-b")).toBeInTheDocument();
    paymentsA.resolve({ transactions: [{ id: "payment-a" }], total: 1 });

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
          ? Promise.resolve({ transactions: [], total: 0 })
          : stalePaymentsA.promise;
      }
      return Promise.resolve({ transactions: [{ id: "payment-b" }], total: 1 });
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

    stalePaymentsA.resolve({ transactions: [{ id: "payment-a" }], total: 1 });
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
      expect(mocks.activate).toHaveBeenCalledWith("salon-b", expect.any(Object), expect.any(String));
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

  it("reuses an activation key after a rejected request", async () => {
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));
    mocks.activate
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValueOnce(detailFor("salon-a", "Salon A renewed"));

    renderPage();
    await screen.findByRole("heading", { name: "Salon A" });
    fireEvent.click(screen.getByRole("button", { name: "Activate subscription" }));
    fireEvent.change(screen.getByLabelText(/Audit note/), { target: { value: "renew A" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await screen.findByText("An unexpected error occurred.");
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    await screen.findByText("Action completed successfully.");

    expect(mocks.activate.mock.calls[0][2]).toBe(mocks.activate.mock.calls[1][2]);
  });

  it("uses a new activation key after confirmed success", async () => {
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));
    mocks.activate.mockResolvedValue(detailFor("salon-a", "Salon A renewed"));

    renderPage();
    await screen.findByRole("heading", { name: "Salon A" });
    for (const note of ["first renewal", "second renewal"]) {
      fireEvent.click(screen.getByRole("button", { name: "Activate subscription" }));
      fireEvent.change(screen.getByLabelText(/Audit note/), { target: { value: note } });
      fireEvent.click(screen.getByRole("button", { name: "Activate" }));
      await screen.findByText("Action completed successfully.");
    }

    expect(mocks.activate.mock.calls[0][2]).not.toBe(mocks.activate.mock.calls[1][2]);
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
      expect(mocks.activate).toHaveBeenCalledWith("salon-a", expect.any(Object), expect.any(String));
      expect(screen.getByText("Action completed successfully.")).toBeInTheDocument();
    });
  });
});
