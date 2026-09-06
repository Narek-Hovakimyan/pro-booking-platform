import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import PlatformIndividualBillingPage from "./PlatformIndividualBillingPage";

const mocks = vi.hoisted(() => ({
  getIndividuals: vi.fn(),
  getPayments: vi.fn(),
}));

vi.mock("@/shared/api/platformBilling", () => ({
  getPlatformBillingIndividuals: mocks.getIndividuals,
  getPlatformBillingIndividualPayments: mocks.getPayments,
}));

vi.mock("@/shared/utils/platformAccess", () => ({
  canAccessPlatform: () => true,
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

const barber = {
  barberId: "barber-a",
  barber: {
    id: "barber-a",
    name: "Barber A",
    email: "barber@example.com",
  },
  subscription: null,
  latestPayment: null,
};

const secondBarber = {
  ...barber,
  barberId: "barber-b",
  barber: {
    id: "barber-b",
    name: "Barber B",
    email: "barber-b@example.com",
  },
};

const paymentFor = (amount) => ({
  id: `payment-${amount}`,
  amount,
  currency: "USD",
  status: "paid",
  provider: "manual",
  paidAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
});

function renderPage() {
  return renderWithProviders(<PlatformIndividualBillingPage />, {
    initialEntries: ["/admin/platform/billing/individuals"],
    preloadedState: {
      auth: {
        currentUser: { _id: "platform-1", canAccessPlatform: true },
        token: "token",
        isAuthenticated: true,
      },
    },
  });
}

async function renderLoadedPage(individuals = [barber]) {
  mocks.getIndividuals.mockResolvedValue({ individuals, total: individuals.length });
  const result = renderPage();
  await screen.findByRole("heading", { name: "Barber A" });
  return result;
}

async function togglePayments(user) {
  await user.click(screen.getByRole("button", { name: "View payments" }));
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlatformIndividualBillingPage payment request lifecycle", () => {
  it("keeps the newer request loading when an older request settles first", async () => {
    const user = userEvent.setup();
    const requestA = deferred();
    const requestB = deferred();
    mocks.getPayments
      .mockImplementationOnce(() => requestA.promise)
      .mockImplementationOnce(() => requestB.promise);
    const { container } = await renderLoadedPage();

    await togglePayments(user);
    await togglePayments(user);
    await togglePayments(user);

    requestA.resolve({ payments: [paymentFor(100)], total: 1 });
    await waitFor(() => {
      expect(container.querySelector("svg.animate-spin")).toBeInTheDocument();
    });

    requestB.resolve({ payments: [paymentFor(200)], total: 1 });
    expect(await screen.findByText("200 USD")).toBeInTheDocument();
    expect(screen.queryByText("100 USD")).not.toBeInTheDocument();
  });

  it("keeps B rendered when A succeeds after B has become authoritative", async () => {
    const user = userEvent.setup();
    const requestA = deferred();
    const requestB = deferred();
    mocks.getPayments
      .mockImplementationOnce(() => requestA.promise)
      .mockImplementationOnce(() => requestB.promise);
    await renderLoadedPage();

    await togglePayments(user);
    await togglePayments(user);
    await togglePayments(user);

    requestB.resolve({ payments: [paymentFor(200)], total: 1 });
    expect(await screen.findByText("200 USD")).toBeInTheDocument();
    expect(screen.queryByText("100 USD")).not.toBeInTheDocument();

    await act(async () => {
      requestA.resolve({ payments: [paymentFor(100)], total: 1 });
      await Promise.resolve();
    });

    expect(screen.getByText("200 USD")).toBeInTheDocument();
    expect(screen.queryByText("100 USD")).not.toBeInTheDocument();
  });

  it("ignores a late failure from a request invalidated by close and reopen", async () => {
    const user = userEvent.setup();
    const requestA = deferred();
    const requestB = deferred();
    mocks.getPayments
      .mockImplementationOnce(() => requestA.promise)
      .mockImplementationOnce(() => requestB.promise);
    await renderLoadedPage();

    await togglePayments(user);
    await togglePayments(user);
    await togglePayments(user);
    requestB.resolve({ payments: [paymentFor(200)], total: 1 });
    expect(await screen.findByText("200 USD")).toBeInTheDocument();

    requestA.reject({ response: { data: { message: "Old request failed" } } });
    await waitFor(() => {
      expect(screen.queryByText("Old request failed")).not.toBeInTheDocument();
      expect(screen.getByText("200 USD")).toBeInTheDocument();
    });
  });

  it("does not let a stale barber request update the currently expanded barber", async () => {
    const user = userEvent.setup();
    const requestA = deferred();
    const requestB = deferred();
    mocks.getPayments
      .mockImplementationOnce(() => requestA.promise)
      .mockImplementationOnce(() => requestB.promise);
    await renderLoadedPage([barber, secondBarber]);

    const paymentButtons = screen.getAllByRole("button", { name: "View payments" });
    await user.click(paymentButtons[0]);
    await user.click(paymentButtons[1]);
    requestB.resolve({ payments: [paymentFor(200)], total: 1 });
    expect(await screen.findByText("200 USD")).toBeInTheDocument();

    requestA.reject({ response: { data: { message: "Barber A failed" } } });
    await waitFor(() => {
      expect(screen.queryByText("Barber A failed")).not.toBeInTheDocument();
      expect(screen.getByText("200 USD")).toBeInTheDocument();
    });
  });

  it("invalidates an in-flight request when the history is closed", async () => {
    const user = userEvent.setup();
    const request = deferred();
    mocks.getPayments.mockImplementationOnce(() => request.promise);
    await renderLoadedPage();

    await togglePayments(user);
    await togglePayments(user);
    request.resolve({ payments: [paymentFor(100)], total: 1 });

    await waitFor(() => {
      expect(screen.queryByText("100 USD")).not.toBeInTheDocument();
    });
  });

  it("does not update payment state after unmount", async () => {
    const user = userEvent.setup();
    const request = deferred();
    mocks.getPayments.mockImplementationOnce(() => request.promise);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = await renderLoadedPage();

    await togglePayments(user);
    unmount();
    request.resolve({ payments: [paymentFor(100)], total: 1 });

    await Promise.resolve();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("renders the current request's error and clears it after a successful retry", async () => {
    const user = userEvent.setup();
    mocks.getPayments
      .mockRejectedValueOnce({
        response: { data: { message: "Payment history unavailable" } },
      })
      .mockResolvedValueOnce({ payments: [paymentFor(200)], total: 1 });
    await renderLoadedPage();

    await togglePayments(user);
    expect(await screen.findByText("Payment history unavailable")).toBeInTheDocument();

    await togglePayments(user);
    await togglePayments(user);
    expect(await screen.findByText("200 USD")).toBeInTheDocument();
    expect(screen.queryByText("Payment history unavailable")).not.toBeInTheDocument();
  });
});
