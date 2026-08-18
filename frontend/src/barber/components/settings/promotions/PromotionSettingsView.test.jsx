import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PromotionSettingsView from "./PromotionSettingsView";

const mocks = vi.hoisted(() => ({
  getSalonSubscription: vi.fn(),
}));

vi.mock("@/shared/api/subscriptions", () => ({
  getSalonSubscription: mocks.getSalonSubscription,
}));

vi.mock("@/barber/components/SalonPromotionsManager", () => ({
  default: ({ salonId }) => <div data-testid="promotion-manager">{salonId}</div>,
}));

const salonA = { _id: "salon-a", name: "Salon A" };
const salonB = { _id: "salon-b", name: "Salon B" };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, reject, resolve };
}

function renderView({ selectedPromotionSalon = salonA, managedSalons = [salonA] } = {}) {
  return render(
    <PromotionSettingsView
      effectivePromotionSalonId={selectedPromotionSalon._id}
      error=""
      isLoading={false}
      managedSalons={managedSalons}
      onSelectedPromotionSalonChange={vi.fn()}
      selectedPromotionSalon={selectedPromotionSalon}
    />
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PromotionSettingsView", () => {
  it("renders the manager only after the exact salon subscription is active", async () => {
    mocks.getSalonSubscription.mockResolvedValue({ subscription: { isActive: true } });

    renderView();

    expect(screen.getByText("Checking salon subscription...")).toBeInTheDocument();
    expect(screen.queryByTestId("promotion-manager")).not.toBeInTheDocument();
    expect(await screen.findByTestId("promotion-manager")).toHaveTextContent("salon-a");
    expect(mocks.getSalonSubscription).toHaveBeenCalledWith("salon-a");
  });

  it("fails closed for inactive or missing subscriptions", async () => {
    mocks.getSalonSubscription.mockResolvedValue({ subscription: null });

    renderView();

    expect(
      await screen.findByText("An active salon subscription is required to manage promotions for this salon.")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("promotion-manager")).not.toBeInTheDocument();
  });

  it("denies an inactive exact-salon subscription", async () => {
    mocks.getSalonSubscription.mockResolvedValue({ subscription: { isActive: false } });

    renderView();

    expect(
      await screen.findByText("An active salon subscription is required to manage promotions for this salon.")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("promotion-manager")).not.toBeInTheDocument();
  });

  it("fails closed when the entitlement request fails", async () => {
    mocks.getSalonSubscription.mockRejectedValue(new Error("unavailable"));

    renderView();

    expect(
      await screen.findByText("An active salon subscription is required to manage promotions for this salon.")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("promotion-manager")).not.toBeInTheDocument();
  });

  it("does not let a late paid Salon A response unlock unpaid Salon B", async () => {
    const salonARequest = deferred();
    mocks.getSalonSubscription.mockImplementation((salonId) => {
      if (salonId === "salon-a") return salonARequest.promise;
      return Promise.resolve({ subscription: { isActive: false } });
    });

    const { rerender } = renderView({
      managedSalons: [salonA, salonB],
      selectedPromotionSalon: salonA,
    });

    rerender(
      <PromotionSettingsView
        effectivePromotionSalonId="salon-b"
        error=""
        isLoading={false}
        managedSalons={[salonA, salonB]}
        onSelectedPromotionSalonChange={vi.fn()}
        selectedPromotionSalon={salonB}
      />
    );

    expect(await screen.findByText("An active salon subscription is required to manage promotions for this salon.")).toBeInTheDocument();
    expect(mocks.getSalonSubscription).toHaveBeenCalledWith("salon-b");
    expect(screen.queryByTestId("promotion-manager")).not.toBeInTheDocument();

    await act(async () => {
      salonARequest.resolve({ subscription: { isActive: true } });
      await salonARequest.promise;
    });

    await waitFor(() => {
      expect(screen.queryByTestId("promotion-manager")).not.toBeInTheDocument();
    });
  });
});
