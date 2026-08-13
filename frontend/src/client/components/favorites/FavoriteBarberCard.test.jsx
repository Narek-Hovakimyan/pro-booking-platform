import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import FavoriteBarberCard from "./FavoriteBarberCard";

const barber = {
  id: "barber-1",
  name: "Anna",
  approvedSalons: [
    { status: "approved", salon: { id: "salon-1", name: "Salon One" } },
  ],
};

const services = [
  {
    id: "service-1",
    barberId: "barber-1",
    active: true,
    name: "Haircut",
    category: "haircut",
    price: 1000,
  },
  {
    id: "service-2",
    barberId: "barber-1",
    active: true,
    name: "Color",
    category: "hair-color",
    price: 2000,
  },
];

function renderCard(overrides = {}) {
  return render(
    <MemoryRouter>
      <FavoriteBarberCard
        availabilitySlot={null}
        availabilityStatus="unavailable"
        barber={barber}
        eligibleBooking={null}
        hasLoadedCardSummary
        isRemovalPending={false}
        onBookAgain={vi.fn()}
        onRemove={vi.fn()}
        reviews={[]}
        services={services}
        summaryReviewStats={{ average: 4.5, count: 2 }}
        {...overrides}
      />
    </MemoryRouter>
  );
}

describe("FavoriteBarberCard", () => {
  it("preserves single-salon and unscoped booking URLs", () => {
    const { rerender } = renderCard();
    expect(screen.getByRole("link", { name: "Book appointment" })).toHaveAttribute(
      "href",
      "/booking/barber-1?salonId=salon-1"
    );

    rerender(
      <MemoryRouter>
        <FavoriteBarberCard
          availabilitySlot={null}
          availabilityStatus="unavailable"
          barber={{ ...barber, approvedSalons: [] }}
          eligibleBooking={null}
          hasLoadedCardSummary
          isRemovalPending={false}
          onBookAgain={vi.fn()}
          onRemove={vi.fn()}
          reviews={[]}
          services={services}
          summaryReviewStats={{ average: 4.5, count: 2 }}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Book appointment" })).toHaveAttribute(
      "href",
      "/booking/barber-1"
    );
  });

  it("renders services, categories, rating, availability, and optional barber fallbacks", () => {
    renderCard({ barber: { ...barber, city: "Yerevan" } });

    expect(screen.getByLabelText("Services")).toHaveTextContent("HaircutColor");
    expect(screen.getByLabelText("Service categories")).toHaveTextContent(
      "HaircutHair color"
    );
    expect(screen.getByText("4.5")).toBeVisible();
    expect(screen.getByText("4.5").parentElement).toHaveTextContent(
      "4.5· 2 reviews"
    );
    expect(screen.getByText("Schedule unavailable")).toBeVisible();
    expect(screen.getByText("Yerevan")).toBeVisible();
  });

  it("uses the rebook callback and preserves disabled removal semantics", async () => {
    const user = userEvent.setup();
    const onBookAgain = vi.fn();
    const onRemove = vi.fn();
    renderCard({
      eligibleBooking: { id: "booking-1" },
      isRemovalPending: true,
      onBookAgain,
      onRemove,
    });

    await user.click(screen.getByRole("button", { name: "Book again" }));
    expect(onBookAgain).toHaveBeenCalledTimes(1);

    const removeButton = screen.getByRole("button", { name: "Remove favorite" });
    expect(removeButton).toBeDisabled();
    await user.click(removeButton);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("supports empty optional barber presentation data", () => {
    renderCard({
      availabilityStatus: undefined,
      barber: { id: "barber-1", name: "Anna" },
      hasLoadedCardSummary: false,
      services: [],
      summaryReviewStats: undefined,
    });

    expect(screen.getByText("City not set")).toBeVisible();
    expect(screen.getByText("No reviews yet")).toBeVisible();
    expect(screen.getByText("No services yet")).toBeVisible();
    expect(screen.queryByLabelText("Services")).not.toBeInTheDocument();
  });
});
