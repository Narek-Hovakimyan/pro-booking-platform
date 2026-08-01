import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SalonsPage from "./SalonsPage";
import api from "@/shared/api/axios";

const state = vi.hoisted(() => ({
  auth: {
    currentUser: {
      id: "client-1",
      role: "client",
      favoriteBarbers: [],
      favoriteSalons: [],
    },
  },
  services: [],
  reviews: [],
  favorites: [],
  users: [],
}));

vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
  useSelector: (selector) => selector(state),
}));

vi.mock("@/client/components/BarberCard", () => ({
  default: ({ barber, bookingSalon }) => (
    <article
      data-booking-salon-id={bookingSalon?.id || bookingSalon?._id || ""}
      data-testid="barber-card"
    >
      {barber?.name}
    </article>
  ),
}));

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

const salon = {
  id: "salon-1",
  _id: "salon-1",
  name: "Salon One",
  city: "Yerevan",
  address: "Main Street 1",
  averageRating: 4.8,
  totalReviews: 1,
  reviewsCount: 1,
  latestReviews: [],
  barbers: [
    {
      id: "barber-1",
      _id: "barber-1",
      name: "Anna",
      role: "barber",
      city: "Yerevan",
      profession: "barber",
      barberType: "unisex",
      specialty: "unisex",
      bio: "",
      avatarUrl: "",
      imageUrl: "",
      galleryImages: [],
    },
  ],
};

const activeService = {
  id: "service-1",
  barberId: "barber-1",
  active: true,
  category: "haircut",
  name: "Haircut",
  duration: 30,
  price: 12000,
};

function mockApi() {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url === "/salons") {
      return Promise.resolve({ data: [salon] });
    }

    if (url === "/favorites") {
      return Promise.resolve({ data: [] });
    }

    if (url === "/favorites/salons") {
      return Promise.resolve({ data: [] });
    }

    if (url === "/salon-reviews/salon/salon-1") {
      return Promise.resolve({
        data: {
          reviews: [],
          averageRating: salon.averageRating,
          totalReviews: salon.totalReviews,
        },
      });
    }

    if (url === "/services/barber-1") {
      return Promise.resolve({ data: [activeService] });
    }

    if (url === "/reviews/barber-1") {
      return Promise.resolve({ data: [] });
    }

    return Promise.resolve({ data: [] });
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/salons"]}>
      <SalonsPage />
    </MemoryRouter>
  );
}

describe("SalonsPage selected salon specialists", () => {
  beforeEach(() => {
    state.auth.currentUser.favoriteBarbers = [];
    state.auth.currentUser.favoriteSalons = [];
    state.services = [activeService];
    state.reviews = [];
    state.favorites = [];
    state.users = [];
    vi.clearAllMocks();
    mockApi();
  });

  it("keeps the public salon count and selected view on the same specialist payload", async () => {
    const user = userEvent.setup();

    renderPage();

    expect(await screen.findByText("1 specialist")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View specialists at Salon One" })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "View specialists at Salon One" })
    );

    expect(await screen.findByText("Specialists at Salon One")).toBeInTheDocument();
    expect(screen.getAllByText("1 specialist")).toHaveLength(1);
    const barberCard = await screen.findByTestId("barber-card");
    expect(barberCard).toHaveTextContent("Anna");
    expect(barberCard).toHaveAttribute("data-booking-salon-id", "salon-1");

    await user.selectOptions(screen.getByLabelText("Service category"), "hair-color");

    await waitFor(() => {
      expect(screen.queryByTestId("barber-card")).not.toBeInTheDocument();
    });
    expect(screen.getByText("No matching specialists")).toBeInTheDocument();
  });
});
