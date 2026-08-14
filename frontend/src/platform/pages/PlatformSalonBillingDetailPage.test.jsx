import { fireEvent, screen, waitFor } from "@testing-library/react";
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
  SalonBillingHeader: ({ salon, onActivate, successMessage }) => (
    <header>
      <h1>{salon?.name}</h1>
      <button type="button" onClick={onActivate}>
        Open activation
      </button>
      {successMessage && <p>{successMessage}</p>}
    </header>
  ),
}));

vi.mock("../components/billing/SalonBillingSummaryCards", () => ({
  SalonBillingSummaryCards: () => null,
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

function detailFor(id) {
  return {
    salon: { id, name: id === "salon-a" ? "Salon A" : "Salon B" },
    owner: null,
    subscription: null,
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
    fireEvent.click(screen.getByRole("button", { name: "Open activation" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Open activation" }));
    expect(screen.getByLabelText(/Audit note/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Go to B" }));
    expect(screen.queryByLabelText(/Audit note/)).not.toBeInTheDocument();
    detailB.resolve(detailFor("salon-b"));
    await screen.findByRole("heading", { name: "Salon B" });

    fireEvent.click(screen.getByRole("button", { name: "Open activation" }));
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

  it("keeps same-salon mutation refresh behavior intact", async () => {
    mocks.getDetail.mockResolvedValue(detailFor("salon-a"));
    mocks.activate.mockResolvedValue({});

    renderPage();
    await screen.findByRole("heading", { name: "Salon A" });
    fireEvent.click(screen.getByRole("button", { name: "Open activation" }));
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
