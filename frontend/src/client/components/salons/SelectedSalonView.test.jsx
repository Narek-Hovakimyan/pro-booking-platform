import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import SelectedSalonView from "./SelectedSalonView";

vi.mock("@/client/components/BarberCard", () => ({
  default: ({ barber, bookingSalon, onToggleFavorite }) => (
    <article
      data-booking-salon-id={bookingSalon?.id || bookingSalon?._id || ""}
      data-testid="barber-card"
    >
      <span>{barber?.name}</span>
      <button
        type="button"
        onClick={() => onToggleFavorite?.(barber)}
      >
        Toggle favorite
      </button>
    </article>
  ),
}));

vi.mock("@/client/components/salons/SalonReviewsList", () => ({
  default: ({ reviews }) => <div data-testid="reviews-list" data-review-count={reviews.length} />,
}));

const salon = {
  id: "salon-1",
  _id: "salon-1",
  name: "Studio One",
  imageUrl: "/images/studio-one.jpg",
  city: "Yerevan",
  address: "Main Street 1",
  phone: "+374 10 000000",
};

const barberAnna = {
  id: "barber-1",
  _id: "barber-1",
  name: "Anna",
};

const barberBella = {
  id: "barber-2",
  _id: "barber-2",
  name: "Bella",
};

const haircutService = {
  id: "service-1",
  barberId: "barber-1",
  active: true,
  category: "haircut",
};

const colorService = {
  id: "service-2",
  barberId: "barber-2",
  active: true,
  category: "hair-color",
};

function renderView(overrides = {}) {
  const onToggleSalonFavorite = vi.fn();
  const onToggleBarberFavorite = vi.fn();
  const onBack = vi.fn();
  const isSalonFavorite = vi.fn(() => false);

  render(
    <SelectedSalonView
      currentUser={{ role: "client" }}
      favorites={[]}
      formatReviewDate={vi.fn()}
      getId={(item) => item?.id || item?._id}
      getInitial={vi.fn()}
      getReviewClientAvatar={vi.fn()}
      getReviewClientName={vi.fn()}
      isSalonFavorite={isSalonFavorite}
      onBack={onBack}
      onToggleBarberFavorite={onToggleBarberFavorite}
      onToggleSalonFavorite={onToggleSalonFavorite}
      reviews={[]}
      selectedBarbers={[barberAnna, barberBella]}
      selectedSalon={salon}
      selectedSalonRating={4.5}
      selectedSalonReviews={[]}
      selectedSalonReviewsCount={2}
      services={[haircutService, colorService]}
      {...overrides}
    />
  );

  return {
    isSalonFavorite,
    onBack,
    onToggleBarberFavorite,
    onToggleSalonFavorite,
  };
}

describe("SelectedSalonView", () => {
  it("uses sentence-case heading, singular review grammar, and preserves the favorite action", async () => {
    const user = userEvent.setup();
    const { onToggleSalonFavorite } = renderView({
      selectedSalonRating: 4.5,
      selectedSalonReviewsCount: 1,
      selectedSalonReviews: [{ id: "review-1" }],
    });

    expect(screen.getByRole("heading", { name: "Salon reviews" })).toBeInTheDocument();
    expect(screen.getByText("4.5 (1 review)")).toBeInTheDocument();
    expect(
      screen.getByText("4.5 average rating · 1 review")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add salon to favorites" }));

    expect(onToggleSalonFavorite).toHaveBeenCalledWith(salon);
  });

  it("keeps zero-review fallback text and the primary image accessible", () => {
    renderView({
      selectedSalonRating: null,
      selectedSalonReviewsCount: 0,
    });

    expect(screen.getAllByText("No reviews yet")).toHaveLength(2);

    const image = screen.getByRole("img", { name: "Photos of Studio One" });
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).not.toHaveAttribute("loading", "lazy");
  });

  it("renders plural review grammar in both rating summaries", () => {
    renderView({
      selectedSalonRating: 4.5,
      selectedSalonReviewsCount: 2,
      selectedSalonReviews: [{ id: "review-1" }, { id: "review-2" }],
    });

    expect(screen.getByText("4.5 (2 reviews)")).toBeInTheDocument();
    expect(screen.getByText("4.5 average rating · 2 reviews")).toBeInTheDocument();
  });

  it("filters specialists by service category without changing booking salon context", async () => {
    const user = userEvent.setup();
    renderView();

    const cards = screen.getAllByTestId("barber-card");
    expect(cards).toHaveLength(2);
    cards.forEach((card) => {
      expect(card).toHaveAttribute("data-booking-salon-id", "salon-1");
    });

    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("Bella")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Service category"), "hair-color");

    expect(screen.queryByText("Anna")).not.toBeInTheDocument();
    expect(screen.getByText("Bella")).toBeInTheDocument();
    expect(screen.getAllByTestId("barber-card")).toHaveLength(1);
  });
});
