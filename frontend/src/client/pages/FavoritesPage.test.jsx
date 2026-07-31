import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FavoritesPage from "./FavoritesPage";
import api from "@/shared/api/axios";

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

const state = vi.hoisted(() => ({
  currentUser: { id: "client-1" },
  users: [],
  services: [],
  reviews: [],
  favorites: [],
  bookings: [],
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => routerMocks.navigate,
  };
});

vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
  useSelector: (selector) =>
    selector({
      auth: { currentUser: state.currentUser },
      users: state.users,
      services: state.services,
      reviews: state.reviews,
      favorites: state.favorites,
      bookings: state.bookings,
    }),
}));

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/store/slices/bookingsSlice", () => ({
  fetchClientBookings: vi.fn(() => ({ type: "fetchClientBookings" })),
}));

const activeService = {
  barberId: "barber-1",
  active: true,
  id: "service-1",
  name: "Haircut",
  duration: 30,
  price: 1000,
};

function mockApi({ favorites = [] } = {}) {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url === "/favorites") {
      return Promise.resolve({ data: favorites });
    }
    if (url === "/favorites/salons") {
      return Promise.resolve({ data: [] });
    }
    if (url === "/barbers/card-summary") {
      return Promise.resolve({
        data: {
          barbers: [],
          services: [activeService],
          reviewStats: [],
          availability: [],
        },
      });
    }
    return Promise.resolve({ data: [] });
  });
}

function renderFavorites() {
  return render(
    <MemoryRouter initialEntries={["/favorites"]}>
      <FavoritesPage />
    </MemoryRouter>
  );
}

function favoriteWithSalons(salons) {
  return {
    clientId: "client-1",
    barberId: "barber-1",
    barber: { id: "barber-1", name: "Anna", salons },
  };
}

describe("FavoritesPage salon-context navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.favorites = [];
    state.bookings = [];
  });

  it("scopes a single-salon favorite booking to that salon", async () => {
    const favorite = favoriteWithSalons([
      { status: "approved", salon: { id: "salon-1", name: "Salon One" } },
    ]);
    state.favorites = [favorite];
    mockApi({ favorites: [favorite] });

    renderFavorites();

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Book appointment" })
      ).toHaveAttribute("href", "/booking/barber-1?salonId=salon-1")
    );
  });

  it("does not auto-scope favorites with multiple salons", async () => {
    const favorite = favoriteWithSalons([
      { status: "approved", salon: { id: "salon-1", name: "Salon One" } },
      { status: "approved", salon: { id: "salon-2", name: "Salon Two" } },
    ]);
    state.favorites = [favorite];
    mockApi({ favorites: [favorite] });

    renderFavorites();

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Book appointment" })
      ).toHaveAttribute("href", "/booking/barber-1")
    );
  });

  it("keeps independent favorites on unscoped booking", async () => {
    const favorite = favoriteWithSalons([]);
    state.favorites = [favorite];
    mockApi({ favorites: [favorite] });

    renderFavorites();

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Book appointment" })
      ).toHaveAttribute("href", "/booking/barber-1")
    );
  });

  it("rebook preserves the booking salonId in the query", async () => {
    const favorite = favoriteWithSalons([]);
    const completedBooking = {
      clientId: "client-1",
      barberId: "barber-1",
      status: "completed",
      bookingDate: "2020-01-01",
      time: "10:00",
      salonId: "salon-9",
      service: { id: "service-9" },
      serviceId: "service-9",
    };
    state.favorites = [favorite];
    state.bookings = [completedBooking];
    mockApi({ favorites: [favorite] });

    renderFavorites();

    const bookAgain = await screen.findByRole("button", { name: "Book again" });
    fireEvent.click(bookAgain);

    expect(routerMocks.navigate).toHaveBeenCalledWith(
      "/booking/barber-1?salonId=salon-9",
      expect.objectContaining({
        state: expect.objectContaining({
          rebook: true,
          selectedSalonId: "salon-9",
        }),
      })
    );
  });
});