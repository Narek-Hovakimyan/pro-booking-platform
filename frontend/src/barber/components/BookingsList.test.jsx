import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import BookingsList from "./BookingsList";
import BookingListItem from "./bookings/BookingListItem";
import AdminPanel from "./AdminPanel";
import { renderWithProviders } from "@/test/renderWithProviders";
import { getNext7Days } from "@/shared/utils/dates";

const apiGet = vi.fn();
const apiPatch = vi.fn();
const apiPost = vi.fn();
const apiPut = vi.fn();
const socketMocks = vi.hoisted(() => ({ socket: null }));

vi.mock("@/shared/api/axios", () => ({
  default: {
    get: (...args) => apiGet(...args),
    patch: (...args) => apiPatch(...args),
    post: (...args) => apiPost(...args),
    put: (...args) => apiPut(...args),
  },
}));

vi.mock("@/shared/lib/socket", () => ({
  getSocket: () => socketMocks.socket,
}));

vi.mock("@/barber/components/bookings/BookingsHeaderFilters", () => ({
  default: ({ onAddBooking, view }) => (
    <div>
      <span data-testid="bookings-view">{view}</span>
      {view !== "history" && (
        <button type="button" onClick={onAddBooking}>
          Open add booking
        </button>
      )}
    </div>
  ),
}));

vi.mock("@/barber/components/bookings/BookingSections", () => ({
  default: ({ groupedBookings, showActions }) => (
    <div data-testid="booking-sections">
      <span data-testid="history-actions">{String(showActions)}</span>
      {groupedBookings.map((group) => (
        <span data-testid={`booking-group-${group.key}`} key={group.key}>
          {group.bookings.length}
        </span>
      ))}
    </div>
  ),
}));

vi.mock("@/barber/components/RejectBookingModal", () => ({
  default: () => null,
}));

vi.mock("@/barber/components/bookings/ClientReliabilitySummary", () => ({
  default: () => null,
}));

vi.mock("@/barber/components/bookings/TreatmentRecordSection", () => ({
  default: () => null,
}));

vi.mock("./DashboardAnalytics", () => ({
  default: () => <div>Dashboard analytics</div>,
}));

const BARBER_ID = "barber-1";
const SERVICE_ID = "service-1";

apiGet.mockResolvedValue({ data: [] });
apiPost.mockResolvedValue({
  data: {
    _id: "booking-1",
    barberId: BARBER_ID,
    bookingDate: "2026-07-31",
    time: "10:00",
  },
});

function renderBookingsList(salons, { bookings = [], view = "active" } = {}) {
  return renderWithProviders(
    <BookingsList
      bookings={bookings}
      services={[
        {
          id: SERVICE_ID,
          barberId: BARBER_ID,
          active: true,
          duration: 30,
          name: "Haircut",
        },
      ]}
      view={view}
    />,
    {
      preloadedState: {
        auth: {
          currentUser: {
            id: BARBER_ID,
            role: "barber",
            salons,
          },
          token: "token",
          isAuthenticated: true,
        },
        notifications: [],
      },
    }
  );
}

async function submitManualBooking() {
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Open add booking" }));

  const dialog = await screen.findByRole("dialog", { name: "Add Booking" });
  await user.type(within(dialog).getByLabelText("Client name"), "Taylor");
  await user.selectOptions(within(dialog).getByLabelText("Service"), SERVICE_ID);
  fireEvent.change(within(dialog).getByLabelText("Time"), {
    target: { value: "10:00" },
  });

  await user.click(within(dialog).getByRole("button", { name: "Add Booking" }));

  await waitFor(() => {
    expect(apiPost).toHaveBeenCalledTimes(1);
  });
}

afterEach(() => {
  vi.clearAllMocks();
  socketMocks.socket = null;
  apiGet.mockResolvedValue({ data: [] });
  apiPost.mockResolvedValue({
    data: {
      _id: "booking-1",
      barberId: BARBER_ID,
      bookingDate: "2026-07-31",
      time: "10:00",
    },
  });
});

describe("BookingsList manual booking salon context", () => {
  it("sends salonId when the approved membership stores a raw salon id", async () => {
    renderBookingsList([{ salon: "salon-id", status: "approved" }]);

    await submitManualBooking();

    expect(apiPost.mock.calls[0][1].salonId).toBe("salon-id");
  });

  it("sends salonId when the approved membership stores a populated salon object", async () => {
    renderBookingsList([
      { salon: { _id: "salon-id", name: "North Studio" }, status: "approved" },
    ]);

    await submitManualBooking();

    expect(apiPost.mock.calls[0][1].salonId).toBe("salon-id");
  });

  it("prefers the primary approved salon when multiple approved memberships exist", async () => {
    renderBookingsList([
      { salon: "fallback-salon", status: "approved" },
      { salon: "primary-salon", status: "approved", isPrimary: true },
      { salon: "ignored-salon", status: "pending", isPrimary: true },
    ]);

    await submitManualBooking();

    expect(apiPost.mock.calls[0][1].salonId).toBe("primary-salon");
  });

  it("does not fall back to an unrelated membership id when no salon id is present", async () => {
    renderBookingsList([
      { _id: "membership-id", id: "membership-id", status: "approved", isPrimary: true },
    ]);

    await submitManualBooking();

    expect(apiPost.mock.calls[0][1].salonId).toBeUndefined();
  });

  it("splits active and history status groups without exposing history actions", async () => {
    const bookingDate = getNext7Days()[0].value;
    const bookings = [
      { id: "pending", bookingDate, status: "pending" },
      { id: "accepted", bookingDate, status: "accepted" },
      { id: "completed", bookingDate, status: "completed" },
      { id: "rejected", bookingDate, status: "rejected" },
      { id: "cancelled", bookingDate, status: "cancelled" },
      { id: "expired", bookingDate, status: "expired" },
      { id: "no-show", bookingDate, status: "no_show" },
      { id: "late-cancelled", bookingDate, status: "late_cancelled" },
    ];

    const active = renderBookingsList([], { bookings });
    expect(screen.getByTestId("bookings-view")).toHaveTextContent("active");
    expect(screen.getByTestId("booking-group-pending")).toHaveTextContent("1");
    expect(screen.getByTestId("booking-group-accepted")).toHaveTextContent("1");
    expect(screen.queryByTestId("booking-group-completed")).not.toBeInTheDocument();
    active.unmount();

    renderBookingsList([], { bookings, view: "history" });
    expect(screen.getByTestId("bookings-view")).toHaveTextContent("history");
    expect(screen.getByTestId("booking-group-completed")).toHaveTextContent("1");
    expect(screen.getByTestId("booking-group-closed")).toHaveTextContent("5");
    expect(screen.queryByTestId("booking-group-pending")).not.toBeInTheDocument();
    expect(screen.getByTestId("history-actions")).toHaveTextContent("false");
    expect(screen.queryByRole("button", { name: "Open add booking" })).not.toBeInTheDocument();
  });

  it("keeps the dashboard analytics input intact while its booking pane is active-only", async () => {
    const bookingDate = getNext7Days()[0].value;
    renderWithProviders(
      <AdminPanel
        bookings={[
          { id: "pending", bookingDate, status: "pending" },
          { id: "completed", bookingDate, status: "completed" },
        ]}
        schedule={{}}
        section="dashboard"
        services={[]}
      />,
      {
        preloadedState: {
          auth: { currentUser: { id: BARBER_ID, role: "barber" }, isAuthenticated: true },
          notifications: [],
        },
      }
    );

    await waitFor(() => expect(screen.getByText("Dashboard analytics")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("bookings-view")).toHaveTextContent("active"));
    expect(screen.getByTestId("booking-group-pending")).toHaveTextContent("1");
    expect(screen.queryByTestId("booking-group-completed")).not.toBeInTheDocument();
  });

  it("keeps matching-barber socket refreshes active", async () => {
    let bookingUpdatedHandler;
    socketMocks.socket = {
      on(event, handler) {
        if (event === "bookingUpdated") bookingUpdatedHandler = handler;
      },
      off: vi.fn(),
    };

    renderBookingsList([]);
    await waitFor(() => expect(bookingUpdatedHandler).toBeTypeOf("function"));
    const requestsBeforeUpdate = apiGet.mock.calls.length;
    bookingUpdatedHandler({ booking: { barberId: BARBER_ID } });

    await waitFor(() => expect(apiGet.mock.calls.length).toBeGreaterThan(requestsBeforeUpdate));
  });
});

describe("BookingListItem view actions", () => {
  const booking = {
    id: "booking-1",
    bookingDate: "2026-08-02",
    time: "10:00",
    status: "accepted",
    rescheduleRequest: { status: "pending", requestedBookingDate: "2026-08-03" },
  };
  const props = {
    booking,
    bookingId: booking.id,
    status: "accepted",
    getClientName: () => "Taylor",
    getServiceName: () => "Haircut",
    getBookingTime: (item) => item.time,
    isEligibleForNoShowLateCancel: () => true,
    onUpdateBookingStatus: vi.fn(),
    onOpenRejectBookingModal: vi.fn(),
    onMarkNoShowBooking: vi.fn(),
    onMarkLateCancelBooking: vi.fn(),
    onAcceptRescheduleRequest: vi.fn(),
    onRejectRescheduleRequest: vi.fn(),
  };

  it("hides all mutation and reschedule controls for history records", () => {
    render(<BookingListItem {...props} showActions={false} />);

    for (const name of ["Accept request", "Reject request", "Reject", "Complete", "Mark no-show", "Late cancellation"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.getByText("Reschedule request")).toBeInTheDocument();
  });

  it("keeps active accepted-booking actions available", () => {
    render(<BookingListItem {...props} showActions />);

    expect(screen.getByRole("button", { name: "Accept request" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark no-show" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    expect(props.onUpdateBookingStatus).toHaveBeenCalledWith(booking, "completed");
  });
});
