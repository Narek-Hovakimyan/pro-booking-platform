import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MyBookingsPage from "./MyBookingsPage";
import api from "@/shared/api/axios";

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

const state = vi.hoisted(() => ({
  auth: { currentUser: { id: "client-1" } },
  bookings: [],
  reviews: [],
  users: [],
}));

const dispatchMock = vi.hoisted(() => vi.fn(async () => state.bookings));

vi.mock("react-redux", () => ({
  useDispatch: () => dispatchMock,
  useSelector: (selector) => selector(state),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => routerMocks.navigate,
  };
});

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock("@/shared/lib/socket", () => ({
  getSocket: () => ({
    on: vi.fn(),
    off: vi.fn(),
  }),
}));

vi.mock("@/client/components/bookings/MyBookingsHeader", () => ({
  default: () => null,
}));

vi.mock("@/client/components/bookings/MyBookingsModals", () => ({
  default: () => null,
}));

vi.mock("@/client/components/bookings/MyBookingsSections", () => ({
  default: ({ historyBookings, renderBookingCard }) => (
    <div>{historyBookings.map((booking) => renderBookingCard(booking, "history"))}</div>
  ),
}));

vi.mock("@/client/components/bookings/NextBookingSection", () => ({
  default: () => null,
}));

vi.mock("@/client/components/LoyaltyBanner", () => ({
  default: () => null,
}));

vi.mock("@/client/components/BookingCard", () => ({
  default: ({ booking, isBookAgainEligible, onBookAgain }) =>
    isBookAgainEligible ? (
      <button type="button" onClick={() => onBookAgain(booking)}>
        Book again
      </button>
    ) : null,
}));

vi.mock("@/store/slices/bookingsSlice", () => ({
  fetchBarberBookings: vi.fn(() => ({ type: "fetchBarberBookings" })),
  fetchClientBookings: vi.fn(() => ({ type: "fetchClientBookings" })),
  cancelBooking: vi.fn((payload) => ({ type: "cancelBooking", payload })),
  updateBooking: vi.fn((payload) => ({ type: "updateBooking", payload })),
}));

vi.mock("@/store/slices/notificationsSlice", () => ({
  addNotification: vi.fn((payload) => ({ type: "addNotification", payload })),
}));

vi.mock("@/store/slices/reviewsSlice", () => ({
  addReview: vi.fn((payload) => ({ type: "addReview", payload })),
  setReviews: vi.fn((payload) => ({ type: "setReviews", payload })),
}));

vi.mock("@/store/slices/usersSlice", () => ({
  setBarbers: vi.fn((payload) => ({ type: "setBarbers", payload })),
}));

describe("MyBookingsPage salon-context rebook navigation", () => {
  beforeEach(() => {
    routerMocks.navigate.mockClear();
    dispatchMock.mockClear();
    state.bookings = [];
    state.reviews = [];
    state.users = [];
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === "/users/barbers") {
        return Promise.resolve({ data: [] });
      }

      return Promise.resolve({ data: [] });
    });
  });

  it("preserves the booking salonId in the rebook query", async () => {
    state.bookings = [
      {
        id: "booking-1",
        clientId: "client-1",
        barberId: "barber-1",
        bookingDate: "2026-07-01",
        time: "10:00",
        status: "completed",
        salonId: "salon-9",
        serviceId: "service-1",
        service: { id: "service-1", name: "Haircut" },
        barber: { id: "barber-1", name: "Anna" },
      },
    ];

    render(
      <MemoryRouter initialEntries={["/my-bookings"]}>
        <MyBookingsPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Book again" }));

    await waitFor(() => {
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
});
