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
  default: ({ onAddBooking, view, historyFilters }) => (
    <div>
      <span data-testid="bookings-view">{view}</span>
      {view !== "history" && (
        <button type="button" onClick={onAddBooking}>
          Open add booking
        </button>
      )}
      {view === "history" && historyFilters}
    </div>
  ),
}));

vi.mock("@/barber/components/bookings/BookingSections", () => ({
  default: ({ filteredBookings, groupedBookings, historyPagination, showActions }) => (
    <div data-testid="booking-sections">
      <span data-testid="history-actions">{String(showActions)}</span>
      {filteredBookings.length === 0 && <span>No bookings yet</span>}
      {filteredBookings.map((booking) => <span data-testid={`visible-booking-${booking.id}`} key={booking.id} />)}
      {groupedBookings.map((group) => (
        <span data-testid={`booking-group-${group.key}`} key={group.key}>
          {group.bookings.length}
        </span>
      ))}
      {historyPagination}
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

const historyBookings = (count) => Array.from({ length: count }, (_, index) => ({
  id: `history-${index}`,
  bookingDate: index < 31 ? `2020-01-${String(index + 1).padStart(2, "0")}` : `2020-02-${String(index - 30).padStart(2, "0")}`,
  status: "completed",
}));

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

  it("filters history by inclusive dates, terminal status, and client name or phone", () => {
    const bookings = [
      { id: "completed", bookingDate: "2026-08-10", status: "completed", clientName: "Ava", clientPhone: "555-100" },
      { id: "cancelled", bookingDate: "2026-08-11", status: "cancelled", clientName: "Ben", phone: "555-200" },
    ];
    renderBookingsList([], { bookings, view: "history" });
    fireEvent.change(screen.getByLabelText("Client search"), { target: { value: "aVa" } });
    expect(screen.getByTestId("booking-group-completed")).toHaveTextContent("1");
    expect(screen.getByTestId("booking-group-closed")).toHaveTextContent("0");
    fireEvent.change(screen.getByLabelText("Client search"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-08-10" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-08-10" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "completed" } });
    fireEvent.change(screen.getByLabelText("Client search"), { target: { value: "555-100" } });
    expect(screen.getByTestId("booking-group-completed")).toHaveTextContent("1");
    expect(screen.getByTestId("booking-group-closed")).toHaveTextContent("0");
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-08-12" } });
    expect(screen.getByTestId("booking-group-completed")).toHaveTextContent("0");
    expect(screen.getByTestId("booking-group-closed")).toHaveTextContent("0");
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByTestId("booking-group-completed")).toHaveTextContent("1");
    expect(screen.getByTestId("booking-group-closed")).toHaveTextContent("1");
  });

  it("filters each terminal history status exactly", () => {
    const terminalStatuses = ["completed", "rejected", "cancelled", "expired", "no_show", "late_cancelled"];
    const bookings = terminalStatuses.map((status, index) => ({
      id: status,
      bookingDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
      status,
    }));
    renderBookingsList([], { bookings, view: "history" });

    terminalStatuses.forEach((status) => {
      fireEvent.change(screen.getByLabelText("Status"), { target: { value: status } });
      expect(screen.getByTestId("booking-group-completed")).toHaveTextContent(status === "completed" ? "1" : "0");
      expect(screen.getByTestId("booking-group-closed")).toHaveTextContent(status === "completed" ? "0" : "1");
    });
  });

  it("keeps history filters out of the active view when switching views", () => {
    const bookingDate = getNext7Days()[0].value;
    const bookings = [
      { id: "pending", bookingDate, status: "pending" },
      { id: "completed", bookingDate: "2026-08-10", status: "completed" },
      { id: "cancelled", bookingDate: "2026-08-11", status: "cancelled" },
    ];
    const result = renderBookingsList([], { bookings, view: "history" });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "completed" } });
    expect(screen.getByTestId("booking-group-completed")).toHaveTextContent("1");
    expect(screen.getByTestId("booking-group-closed")).toHaveTextContent("0");

    result.rerender(
      <BookingsList bookings={bookings} services={[{ id: SERVICE_ID, barberId: BARBER_ID, active: true, duration: 30, name: "Haircut" }]} view="active" />
    );
    expect(screen.getByTestId("booking-group-pending")).toHaveTextContent("1");
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.queryByTestId("booking-group-completed")).not.toBeInTheDocument();

    result.rerender(
      <BookingsList bookings={bookings} services={[{ id: SERVICE_ID, barberId: BARBER_ID, active: true, duration: 30, name: "Haircut" }]} view="history" />
    );
    expect(screen.getByTestId("booking-group-completed")).toHaveTextContent("1");
    expect(screen.getByTestId("booking-group-closed")).toHaveTextContent("0");
  });

  it("progressively renders globally newest-first history without duplicates at page boundaries", () => {
    const result = renderBookingsList([], { bookings: historyBookings(41), view: "history" });
    expect(screen.getByText("20 / 41")).toBeInTheDocument();
    expect(screen.getAllByTestId(/visible-booking-/)).toHaveLength(20);
    expect(screen.getByTestId("visible-booking-history-40")).toBeInTheDocument();
    expect(screen.queryByTestId("visible-booking-history-0")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(screen.getByText("40 / 41")).toBeInTheDocument();
    expect(screen.getAllByTestId(/visible-booking-/)).toHaveLength(40);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(screen.getByText("41 / 41")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    const visibleIds = screen.getAllByTestId(/visible-booking-/).map((item) => item.dataset.testid);
    expect(new Set(visibleIds).size).toBe(41);

    [[0, "No bookings yet"], [1, "1 / 1"], [20, "20 / 20"], [21, "20 / 21"], [40, "20 / 40"]].forEach(([count, label]) => {
      result.rerender(<BookingsList bookings={historyBookings(count)} services={[]} view="history" />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it("filters before pagination and resets the visible count for filter, reset, and refresh", () => {
    const bookings = historyBookings(41).map((booking, index) => ({ ...booking, status: index < 30 ? "completed" : "cancelled" }));
    const result = renderBookingsList([], { bookings, view: "history" });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(screen.getByText("40 / 41")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "completed" } });
    expect(screen.getByText("20 / 30")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByText("20 / 41")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(screen.getByText("40 / 41")).toBeInTheDocument();
    result.rerender(<BookingsList bookings={[...bookings]} services={[]} view="history" />);
    expect(screen.getByText("20 / 41")).toBeInTheDocument();
  });

  it("keeps the dashboard analytics input intact while its booking pane is active-only", async () => {
    const bookingDate = getNext7Days()[0].value;
    await import("./BookingsList");
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
