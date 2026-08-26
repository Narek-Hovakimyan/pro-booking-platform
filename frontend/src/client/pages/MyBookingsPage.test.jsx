import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MyBookingsPage from "./MyBookingsPage";
import api from "@/shared/api/axios";
import { formatCurrency } from "@/platform/utils/billingFormatters";

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

vi.mock("@/client/components/bookings/MyBookingsModals", () => ({
  default: ({ selectedBookingForDetails, showBookingDetailsModal }) =>
    showBookingDetailsModal ? (
      <div data-testid="booking-details">
        {selectedBookingForDetails?.service?.name || "Booking details"}
      </div>
    ) : null,
}));

vi.mock("@/client/components/bookings/NextBookingSection", () => ({
  default: ({ nextBooking, serviceName }) => (
    <section aria-label="Next booking">
      {nextBooking ? <div data-testid="next-booking">{serviceName}</div> : null}
    </section>
  ),
}));

vi.mock("@/client/components/LoyaltyBanner", () => ({
  default: () => <div data-testid="loyalty-banner" />,
}));

vi.mock("@/client/components/BookingCard", () => ({
  default: ({
    booking,
    bookingId,
    barberName,
    isActive,
    isBookAgainEligible,
    isSalonReviewed,
    canReviewSalon,
    onBookAgain,
    onDetails,
    onReviewSalon,
    price,
    serviceName,
  }) => (
    <article data-testid={`booking-card-${isActive ? "active" : "history"}-${bookingId || "missing"}`}>
      <span>{serviceName}</span>
      <span>{barberName}</span>
      {price ? <span>{price}</span> : null}
      <button type="button" onClick={() => onDetails(booking)}>
        View details
      </button>
      {isBookAgainEligible ? (
        <button type="button" onClick={() => onBookAgain(booking)}>
          Book again
        </button>
      ) : null}
      {canReviewSalon ? (
        <button type="button" onClick={() => onReviewSalon?.(booking)}>
          {isSalonReviewed ? "Salon reviewed ✓" : "Review salon"}
        </button>
      ) : null}
    </article>
  ),
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
    vi.useRealTimers();
    routerMocks.navigate.mockClear();
    dispatchMock.mockClear();
    state.auth.currentUser = { id: "client-1" };
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

  const renderPage = (view = "active") =>
    render(
      <MemoryRouter initialEntries={[view === "history" ? "/booking-history" : "/my-bookings"]}>
        <MyBookingsPage view={view} />
      </MemoryRouter>
    );

  it("shows the nearest upcoming booking once and leaves later active bookings visible", async () => {
    state.bookings = [
      {
        _id: "next-booking",
        clientId: "client-1",
        barberId: "barber-1",
        bookingDate: "2099-08-01",
        time: "10:00",
        status: "accepted",
        service: { name: "Nearest cut" },
      },
      {
        id: "later-booking",
        clientId: "client-1",
        barberId: "barber-1",
        bookingDate: "2099-08-01",
        time: "11:00",
        status: "confirmed",
        service: { name: "Later trim" },
      },
      {
        id: "pending-booking",
        clientId: "client-1",
        barberId: "barber-1",
        bookingDate: "2099-08-02",
        time: "09:00",
        status: "pending",
        service: { name: "Pending color" },
      },
    ];

    renderPage();

    expect(await screen.findByTestId("next-booking")).toHaveTextContent("Nearest cut");
    expect(screen.queryByTestId("booking-card-active-next-booking")).not.toBeInTheDocument();
    expect(screen.getByTestId("booking-card-active-later-booking")).toHaveTextContent("Later trim");
    expect(screen.getByTestId("booking-card-active-pending-booking")).toHaveTextContent("Pending color");
    expect(screen.getByText("Confirmed (1)")).toBeInTheDocument();
    expect(screen.getByText("Pending confirmation (1)")).toBeInTheDocument();
  });

  it("does not remove bookings when the highlighted booking has no valid id", async () => {
    state.bookings = [
      {
        clientId: "client-1",
        barberId: "barber-1",
        bookingDate: "2099-08-01",
        time: "10:00",
        status: "accepted",
        service: { name: "Missing id appointment" },
      },
      {
        id: "later-booking",
        clientId: "client-1",
        barberId: "barber-1",
        bookingDate: "2099-08-01",
        time: "11:00",
        status: "accepted",
        service: { name: "Later valid appointment" },
      },
    ];

    renderPage();

    expect(await screen.findByTestId("next-booking")).toHaveTextContent("Missing id appointment");
    expect(screen.getByTestId("booking-card-active-missing")).toHaveTextContent(
      "Missing id appointment"
    );
    expect(screen.getByTestId("booking-card-active-later-booking")).toHaveTextContent(
      "Later valid appointment"
    );
    expect(screen.getByText("Confirmed (2)")).toBeInTheDocument();
  });

  it("keeps Armenia midnight-boundary active grouping from suppressing the wrong booking", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2099-08-01T23:55:00+04:00"));

    state.bookings = [
      {
        id: "boundary-next",
        clientId: "client-1",
        barberId: "barber-1",
        bookingDate: "2099-08-02",
        time: "00:10",
        status: "accepted",
        service: { name: "After midnight" },
      },
      {
        id: "boundary-later",
        clientId: "client-1",
        barberId: "barber-1",
        bookingDate: "2099-08-02",
        time: "00:30",
        status: "accepted",
        service: { name: "Still active" },
      },
    ];

    renderPage();

    expect(await screen.findByTestId("next-booking")).toHaveTextContent("After midnight");
    expect(screen.queryByTestId("booking-card-active-boundary-next")).not.toBeInTheDocument();
    expect(screen.getByTestId("booking-card-active-boundary-later")).toHaveTextContent(
      "Still active"
    );
    expect(screen.getByText("Confirmed (1)")).toBeInTheDocument();
  });

  it("shows active bookings only and keeps History available through the view tab", async () => {
    state.bookings = [
      {
        id: "next-booking",
        clientId: "client-1",
        barberId: "barber-1",
        bookingDate: "2099-08-01",
        time: "10:00",
        status: "accepted",
        service: { name: "Upcoming appointment" },
      },
      {
        id: "completed-booking",
        clientId: "client-1",
        barberId: "barber-1",
        bookingDate: "2099-07-01",
        time: "10:00",
        status: "completed",
        service: { name: "Completed appointment" },
      },
      {
        id: "cancelled-booking",
        clientId: "client-1",
        barberId: "barber-1",
        bookingDate: "2099-07-02",
        time: "10:00",
        status: "cancelled",
        service: { name: "Cancelled appointment" },
      },
      {
        id: "rejected-booking",
        clientId: "client-1",
        barberId: "barber-1",
        bookingDate: "2099-07-03",
        time: "10:00",
        status: "rejected",
        service: { name: "Rejected appointment" },
      },
    ];

    renderPage("active");

    expect(await screen.findByTestId("next-booking")).toHaveTextContent("Upcoming appointment");
    expect(screen.getByTestId("loyalty-banner")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "History" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute(
      "href",
      "/booking-history"
    );
    expect(screen.getByRole("link", { name: "Upcoming" })).toHaveAttribute(
      "href",
      "/my-bookings"
    );
  });

  it("keeps history grouping, details, and specialist navigation in history view", async () => {
    state.bookings = [
      {
        id: "completed-booking",
        clientId: "client-1",
        barberId: "barber-1",
        bookingDate: "2026-07-01",
        time: "10:00",
        status: "completed",
        service: { name: "Completed appointment" },
        barber: { id: "barber-1", name: "Anna" },
      },
      {
        id: "cancelled-booking",
        clientId: "client-1",
        barberId: "barber-1",
        bookingDate: "2026-07-02",
        time: "10:00",
        status: "cancelled",
        service: { name: "Cancelled appointment" },
      },
      {
        id: "rejected-booking",
        clientId: "client-1",
        barberId: "barber-1",
        bookingDate: "2026-07-03",
        time: "10:00",
        status: "rejected",
        service: { name: "Rejected appointment" },
      },
    ];

    renderPage("history");

    expect(await screen.findByText("Completed (1)")).toBeInTheDocument();
    expect(screen.getByText("Cancelled (1)")).toBeInTheDocument();
    expect(screen.getByText("Rejected (1)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.queryByRole("heading", { name: "Active bookings" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next booking")).not.toBeInTheDocument();
    expect(screen.queryByTestId("loyalty-banner")).not.toBeInTheDocument();

    const completedCard = screen.getByTestId("booking-card-history-completed-booking");
    fireEvent.click(within(completedCard).getByRole("button", { name: "View details" }));
    expect(await screen.findByTestId("booking-details")).toHaveTextContent(
      "Completed appointment"
    );

    fireEvent.click(within(completedCard).getByRole("button", { name: "Anna" }));
    expect(routerMocks.navigate).toHaveBeenCalledWith(
      "/specialists/barber-1/profile",
      expect.objectContaining({ state: { barber: expect.objectContaining({ name: "Anna" }) } })
    );
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
        price: 1000,
      },
    ];

    renderPage("history");

    expect(await screen.findByText(formatCurrency(1000))).toBeInTheDocument();
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

  it("loads salon reviews even when the barber directory request fails", async () => {
    state.bookings = [
      {
        id: "reviewed-salon-booking",
        clientId: "client-1",
        barberId: "barber-1",
        salonId: "salon-1",
        bookingDate: "2026-07-01",
        time: "10:00",
        status: "completed",
        service: { name: "Salon haircut" },
      },
    ];
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === "/users/barbers") {
        return Promise.reject(new Error("directory unavailable"));
      }
      if (url === "/salon-reviews/salon/salon-1") {
        return Promise.resolve({
          data: {
            reviews: [
              { bookingId: "reviewed-salon-booking", salonId: "salon-1" },
            ],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderPage("history");

    expect(
      await screen.findByText("Salon reviewed ✓")
    ).toBeInTheDocument();
    expect(screen.queryByText("Review salon")).not.toBeInTheDocument();
  });

  it("clears stale salon review state when a later salon review load fails", async () => {
    const booking = {
      id: "reviewed-salon-booking",
      clientId: "client-1",
      barberId: "barber-1",
      salonId: "salon-1",
      bookingDate: "2026-07-01",
      time: "10:00",
      status: "completed",
      service: { name: "Salon haircut" },
    };
    state.bookings = [booking];
    let salonRequestCount = 0;
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === "/salon-reviews/salon/salon-1") {
        salonRequestCount += 1;
        return salonRequestCount === 1
          ? Promise.resolve({
              data: {
                reviews: [
                  { bookingId: booking.id, salonId: booking.salonId },
                ],
              },
            })
          : Promise.reject(new Error("review service unavailable"));
      }
      return Promise.resolve({ data: [] });
    });

    const { rerender } = renderPage("history");
    expect(await screen.findByText("Salon reviewed ✓")).toBeInTheDocument();

    state.auth.currentUser = { id: "client-2" };
    state.bookings = [{ ...booking, clientId: "client-2" }];
    rerender(
      <MemoryRouter initialEntries={["/booking-history"]}>
        <MyBookingsPage view="history" />
      </MemoryRouter>
    );

    expect(await screen.findByText("Review salon")).toBeInTheDocument();
    expect(screen.queryByText("Salon reviewed ✓")).not.toBeInTheDocument();
  });
});
