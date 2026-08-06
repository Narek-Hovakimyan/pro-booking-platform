import { StrictMode } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import SalonBillingPage from "./SalonBillingPage";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  assignSalonSeat: vi.fn(),
  cancelSubscriptionPaymentAttempt: vi.fn(),
  createSubscriptionPaymentIntent: vi.fn(),
  devConfirmSubscriptionPaymentAttempt: vi.fn(),
  devConfirmSubscriptionSeatUpdate: vi.fn(),
  extendManualSubscription: vi.fn(),
  getSalonSubscription: vi.fn(),
  getSalonSubscriptionPayments: vi.fn(),
  revokeSalonSeat: vi.fn(),
}));

vi.mock("@/shared/api/axios", () => ({
  default: { get: mocks.apiGet },
}));

vi.mock("@/shared/api/subscriptions", () => ({
  assignSalonSeat: mocks.assignSalonSeat,
  cancelSubscriptionPaymentAttempt: mocks.cancelSubscriptionPaymentAttempt,
  createSubscriptionPaymentIntent: mocks.createSubscriptionPaymentIntent,
  devConfirmSubscriptionPaymentAttempt: mocks.devConfirmSubscriptionPaymentAttempt,
  devConfirmSubscriptionSeatUpdate: mocks.devConfirmSubscriptionSeatUpdate,
  extendManualSubscription: mocks.extendManualSubscription,
  getSalonSubscription: mocks.getSalonSubscription,
  getSalonSubscriptionPayments: mocks.getSalonSubscriptionPayments,
  revokeSalonSeat: mocks.revokeSalonSeat,
}));

const currentUser = {
  _id: "barber-1",
  name: "Morgan",
  role: "barber",
};

const salonA = { _id: "salon-a", name: "Aurora Salon" };
const salonB = { _id: "salon-b", name: "Blush Studio" };

function deferred() {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function renderPage() {
  return renderWithProviders(<SalonBillingPage />, {
    preloadedState: {
      auth: {
        currentUser,
        token: "token",
        isAuthenticated: true,
      },
    },
  });
}

function baseDetails(overrides = {}) {
  return {
    subscription: {
      isActive: true,
      status: "active",
      seatCount: 2,
      daysRemaining: 12,
      pricePerSeat: 5000,
      currency: "AMD",
      currentPeriodEnd: "2026-09-01",
      monthlyTotal: 10000,
      totalPrice: 10000,
      isExpiringSoon: false,
    },
    defaultPlan: {
      pricePerSeat: 5000,
      currency: "AMD",
    },
    activeSeats: [
      { _id: "seat-1", barberId: { _id: "barber-2", name: "Mia" } },
    ],
    revokedSeats: [
      { _id: "rev-1", barberId: { _id: "barber-3", name: "Liam" } },
    ],
    approvedMembers: [
      { _id: "barber-2", name: "Mia" },
      { _id: "barber-4", name: "Noah" },
    ],
    availableSeatCount: 1,
    pendingPaymentAttempt: null,
    manualActivationAvailable: true,
    ...overrides,
  };
}

function mockSuccessfulSalonLoad(details = baseDetails(), payments = []) {
  mocks.apiGet.mockResolvedValueOnce({ data: { salons: [salonA] } });
  mocks.getSalonSubscription.mockResolvedValue(details);
  mocks.getSalonSubscriptionPayments.mockResolvedValue(payments);
}

function mockSuccessfulSalonLoadWithSalons(
  salons,
  details = baseDetails(),
  payments = []
) {
  mocks.apiGet.mockResolvedValueOnce({ data: { salons } });
  mocks.getSalonSubscription.mockResolvedValue(details);
  mocks.getSalonSubscriptionPayments.mockResolvedValue(payments);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SalonBillingPage", () => {
  it("loads the first salon and keeps payment history failures isolated", async () => {
    mockSuccessfulSalonLoad(baseDetails(), []);
    mocks.getSalonSubscriptionPayments.mockRejectedValueOnce(new Error("history"));

    renderPage();

    expect(await screen.findByRole("heading", { name: "Aurora Salon" })).toBeInTheDocument();
    expect(screen.getByText("Could not load salon payment history.")).toBeInTheDocument();
    expect(screen.getByText("Renew subscription")).toBeInTheDocument();
  });

  it("drops stale salon responses when the selection changes", async () => {
    const detailsB = deferred();
    const paymentsB = deferred();

    mocks.apiGet.mockResolvedValueOnce({ data: { salons: [salonA, salonB] } });
    mocks.getSalonSubscription.mockImplementation((salonId) => {
      if (salonId === salonB._id) return detailsB.promise;
      return Promise.resolve(baseDetails());
    });
    mocks.getSalonSubscriptionPayments.mockImplementation((salonId) => {
      if (salonId === salonB._id) return paymentsB.promise;
      return Promise.resolve([]);
    });

    renderPage();

    await screen.findByRole("heading", { name: "Aurora Salon" });

    const selector = screen.getByDisplayValue("Aurora Salon");
    fireEvent.change(selector, { target: { value: salonB._id } });
    fireEvent.change(selector, { target: { value: salonA._id } });

    detailsB.resolve(baseDetails({ subscription: { ...baseDetails().subscription, seatCount: 3 }, approvedMembers: [{ _id: "barber-4", name: "Noah" }], activeSeats: [] }));
    paymentsB.resolve([]);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Aurora Salon" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Blush Studio" })).not.toBeInTheDocument();
    });
  });

  it("prepares, confirms, and cancels renewal payments", async () => {
    mockSuccessfulSalonLoad(baseDetails(), []);
    mocks.createSubscriptionPaymentIntent.mockResolvedValue({
      paymentAttempt: {
        id: "attempt-1",
        status: "pending",
        amount: 10000,
        currency: "AMD",
        seatCount: 2,
        months: 1,
        action: "renew",
      },
    });
    mocks.devConfirmSubscriptionPaymentAttempt.mockResolvedValue({
      paymentAttempt: {
        id: "attempt-1",
        status: "confirmed",
      },
    });
    mocks.cancelSubscriptionPaymentAttempt.mockResolvedValue({
      paymentAttempt: null,
    });

    renderPage();
    await screen.findByRole("heading", { name: "Aurora Salon" });

    fireEvent.click(screen.getByRole("button", { name: "Prepare renewal payment" }));
    expect(await screen.findByText("Payment pending")).toBeInTheDocument();
    expect(mocks.createSubscriptionPaymentIntent).toHaveBeenCalledWith({
      ownerType: "salon",
      ownerId: "salon-a",
      seatCount: 2,
      months: 1,
      action: "renew",
    });

    fireEvent.click(screen.getByRole("button", { name: "Confirm manually" }));

    await waitFor(() => {
      expect(mocks.devConfirmSubscriptionPaymentAttempt).toHaveBeenCalledWith("attempt-1");
    });

    await waitFor(() => {
      expect(screen.queryByText("Payment pending")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Prepare renewal payment" }));
    expect(await screen.findByText("Payment pending")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel prepared payment" }));

    await waitFor(() => {
      expect(mocks.cancelSubscriptionPaymentAttempt).toHaveBeenCalledWith("attempt-1");
    });
  });

  it("keeps StrictMode actions functional after the dev effect cycle", async () => {
    mockSuccessfulSalonLoad(baseDetails(), []);
    mocks.createSubscriptionPaymentIntent.mockResolvedValue({
      paymentAttempt: {
        id: "attempt-strict",
        status: "pending",
        amount: 10000,
        currency: "AMD",
        seatCount: 2,
        months: 1,
        action: "renew",
      },
    });

    renderWithProviders(
      <StrictMode>
        <SalonBillingPage />
      </StrictMode>,
      {
        preloadedState: {
          auth: {
            currentUser,
            token: "token",
            isAuthenticated: true,
          },
        },
      }
    );

    await screen.findByRole("heading", { name: "Aurora Salon" });
    fireEvent.click(screen.getByRole("button", { name: "Prepare renewal payment" }));

    await waitFor(() => {
      expect(mocks.createSubscriptionPaymentIntent).toHaveBeenCalledWith({
        ownerType: "salon",
        ownerId: "salon-a",
        seatCount: 2,
        months: 1,
        action: "renew",
      });
    });
    expect(await screen.findByText("Payment pending")).toBeInTheDocument();
  });

  it("keeps wrapped salon names and normalized renewal totals intact", async () => {
    mockSuccessfulSalonLoadWithSalons(
      [{ salon: { ...salonA, name: "Wrapped Aurora Salon" } }],
      baseDetails(),
      []
    );

    renderPage();

    await screen.findByRole("heading", { name: "Wrapped Aurora Salon" });
    expect(
      screen.getByRole("heading", { name: "Wrapped Aurora Salon" })
    ).toBeInTheDocument();

    const monthsInput = screen.getAllByLabelText("Months")[0];
    fireEvent.change(monthsInput, { target: { value: "03" } });

    expect(
      screen.getByText("Total: 30,000 AMD for 3 month(s)")
    ).toBeInTheDocument();
  });

  it("uses the API price per seat everywhere instead of falling back to zero", async () => {
    const pricedDetails = baseDetails({
      subscription: {
        ...baseDetails().subscription,
        pricePerSeat: 7000,
        monthlyTotal: 14000,
        totalPrice: 14000,
      },
      defaultPlan: {
        pricePerSeat: 7000,
        currency: "AMD",
      },
    });
    mockSuccessfulSalonLoad(pricedDetails, []);

    renderPage();

    await screen.findByRole("heading", { name: "Aurora Salon" });

    expect(screen.getByText("Price per seat: 7,000 AMD")).toBeInTheDocument();

    fireEvent.change(screen.getAllByLabelText("Seats")[0], {
      target: { value: "3" },
    });
    fireEvent.change(screen.getAllByLabelText("Months")[0], {
      target: { value: "3" },
    });
    fireEvent.change(screen.getAllByLabelText("Seats")[1], {
      target: { value: "2" },
    });
    fireEvent.change(screen.getAllByLabelText("Months")[1], {
      target: { value: "3" },
    });

    expect(
      screen.getByText("3 x 7,000 AMD = 21,000 AMD/month")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Total: 63,000 AMD for 3 month(s)")
    ).toBeInTheDocument();
    expect(screen.getByText("Extra cost: 7,000 AMD")).toBeInTheDocument();
    expect(
      screen.getByText("2 x 7,000 AMD x 3 month(s)")
    ).toBeInTheDocument();
  });

  it("preserves the revoke affordance classes and icon", async () => {
    mockSuccessfulSalonLoad(baseDetails(), []);

    renderPage();
    await screen.findByRole("heading", { name: "Aurora Salon" });

    const revokeButton = screen.getByRole("button", { name: "Revoke" });
    expect(revokeButton).toHaveClass("w-full", "gap-2", "rounded-2xl", "sm:w-auto");
    expect(revokeButton.querySelector("svg")).not.toBeNull();

    const revokedContainer = screen.getByText("Liam").parentElement?.parentElement;
    expect(revokedContainer).toHaveClass(
      "divide-y",
      "divide-neutral-100",
      "overflow-hidden",
      "rounded-2xl",
      "border",
      "border-neutral-200",
      "bg-white"
    );
  });

  it("uses the seat-update dev confirmation control when preparing a seat change", async () => {
    mockSuccessfulSalonLoad(baseDetails(), []);
    mocks.createSubscriptionPaymentIntent.mockResolvedValue({
      paymentAttempt: {
        id: "attempt-seat",
        status: "pending",
        amount: 5000,
        currency: "AMD",
        seatCount: 3,
        months: 1,
        action: "update_seats",
      },
    });
    mocks.devConfirmSubscriptionSeatUpdate.mockResolvedValue({
      paymentAttempt: {
        id: "attempt-seat",
        status: "confirmed",
      },
    });

    renderPage();
    await screen.findByRole("heading", { name: "Aurora Salon" });

    fireEvent.click(screen.getByRole("button", { name: "Prepare seat update" }));
    expect(await screen.findByText("Payment pending")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm seat update" }));

    await waitFor(() => {
      expect(mocks.devConfirmSubscriptionSeatUpdate).toHaveBeenCalledWith("attempt-seat");
    });
  });

  it("assigns and revokes seats through the salon-scoped endpoints", async () => {
    mockSuccessfulSalonLoad(baseDetails(), []);
    mocks.assignSalonSeat.mockResolvedValue({});
    mocks.revokeSalonSeat.mockResolvedValue({});

    renderPage();
    await screen.findByRole("heading", { name: "Aurora Salon" });

    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "barber-4" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign seat" }));

    await waitFor(() => {
      expect(mocks.assignSalonSeat).toHaveBeenCalledWith("salon-a", "barber-4");
    });

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => {
      expect(mocks.revokeSalonSeat).toHaveBeenCalledWith("seat-1");
    });
  });

  it("keeps the dev-only manual activation path wired to the current user", async () => {
    mockSuccessfulSalonLoad(
      baseDetails({
        subscription: null,
        activeSeats: [],
        revokedSeats: [],
        approvedMembers: [],
        availableSeatCount: 0,
      }),
      []
    );
    mocks.extendManualSubscription.mockResolvedValue({});

    renderPage();
    await screen.findByRole("heading", { name: "Aurora Salon" });

    fireEvent.change(screen.getAllByLabelText("Seats")[1], { target: { value: "2" } });
    fireEvent.change(screen.getAllByLabelText("Months")[1], { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Activate salon manually" }));

    await waitFor(() => {
      expect(mocks.extendManualSubscription).toHaveBeenCalledWith({
        ownerType: "salon",
        ownerId: "salon-a",
        payerId: "barber-1",
        seatCount: 2,
        months: 3,
      });
    });
  });

  it("stays quiet after unmount under StrictMode", async () => {
    const load = deferred();
    mocks.apiGet.mockResolvedValueOnce({ data: { salons: [salonA] } });
    mocks.getSalonSubscription.mockReturnValue(load.promise);
    mocks.getSalonSubscriptionPayments.mockResolvedValue([]);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { unmount } = renderWithProviders(
      <StrictMode>
        <SalonBillingPage />
      </StrictMode>,
      {
        preloadedState: {
          auth: {
            currentUser,
            token: "token",
            isAuthenticated: true,
          },
        },
      }
    );

    unmount();
    load.resolve(baseDetails());

    await waitFor(() => {
      expect(consoleError).not.toHaveBeenCalled();
    });
  });
});
