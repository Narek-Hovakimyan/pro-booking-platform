import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import BookingListItem from "./BookingListItem";

vi.mock("@/shared/components/StatusBadge", () => ({
  default: ({ status }) => <div>Status: {status}</div>,
}));

vi.mock("@/barber/components/bookings/ClientReliabilitySummary", () => ({
  default: ({ clientId }) => <div>Reliability: {clientId}</div>,
}));

vi.mock("@/barber/components/bookings/TreatmentRecordSection", () => ({
  default: () => <div>Treatment record</div>,
}));

function renderBookingListItem(overrideProps = {}) {
  const props = {
    booking: {
      _id: "booking-1",
      clientPhone: "+37499111222",
      bookingDate: "2026-08-02",
      price: 5000,
      note: "Bring reference photo",
      rescheduleRequest: {
        status: "pending",
        requestedBookingDate: "2026-08-03",
        requestedTime: "15:00",
        requestNote: "Need a later slot",
      },
      client: { id: "client-1" },
    },
    bookingId: "booking-1",
    status: "pending",
    isHighlighted: false,
    getClientName: () => "Alice",
    getServiceName: () => "Haircut",
    getBookingTime: () => "10:00",
    isEligibleForNoShowLateCancel: () => false,
    onUpdateBookingStatus: vi.fn(),
    onOpenRejectBookingModal: vi.fn(),
    onMarkNoShowBooking: vi.fn(),
    onMarkLateCancelBooking: vi.fn(),
    onAcceptRescheduleRequest: vi.fn(),
    onRejectRescheduleRequest: vi.fn(),
    rescheduleAction: null,
    ...overrideProps,
  };

  const result = render(<BookingListItem {...props} />);
  return { ...result, props };
}

describe("BookingListItem", () => {
  test("renders AMD price, English note label, and readable booking/reschedule dates", () => {
    renderBookingListItem();

    expect(screen.getByText("5,000 AMD")).toBeInTheDocument();
    expect(screen.queryByText(/դրամ/u)).not.toBeInTheDocument();
    expect(screen.getByText("Note: Bring reference photo")).toBeInTheDocument();
    expect(screen.queryByText(/Նշում/u)).not.toBeInTheDocument();
    expect(screen.getByText("Haircut · Sun, Aug 2 10:00 ·")).toBeInTheDocument();
    expect(screen.getByText("Requested: Mon, Aug 3 15:00")).toBeInTheDocument();
    expect(screen.queryByText("2026-08-02")).not.toBeInTheDocument();
    expect(screen.queryByText("2026-08-03")).not.toBeInTheDocument();
  });

  test("renders safe fallback for invalid or missing dates", () => {
    const { rerender, props } = renderBookingListItem({
      booking: {
        _id: "booking-2",
        bookingDate: "not-a-date",
        price: 5000,
        rescheduleRequest: {
          status: "pending",
          requestedBookingDate: "",
          requestedTime: "",
        },
        client: { id: "client-2" },
      },
      getClientName: () => "Bob",
      getServiceName: () => "Color",
      getBookingTime: () => "11:30",
    });

    expect(screen.getByText("Color · — 11:30 ·")).toBeInTheDocument();
    expect(screen.getByText("Requested: — HH:mm")).toBeInTheDocument();
    expect(screen.queryByText("not-a-date")).not.toBeInTheDocument();

    rerender(
      <BookingListItem
        {...props}
        booking={{
          _id: "booking-3",
          bookingDate: null,
          price: 5000,
          rescheduleRequest: {
            status: "pending",
            requestedBookingDate: null,
            requestedTime: "14:00",
          },
          client: { id: "client-3" },
        }}
      />
    );

    expect(screen.getByText("Color · — 11:30 ·")).toBeInTheDocument();
    expect(screen.getByText("Requested: — 14:00")).toBeInTheDocument();
  });

  test("keeps pending booking actions and reschedule callbacks wired", async () => {
    const user = userEvent.setup();
    const { props } = renderBookingListItem();

    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(props.onUpdateBookingStatus).toHaveBeenCalledWith(props.booking, "accepted");

    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(props.onOpenRejectBookingModal).toHaveBeenCalledWith(props.booking);

    await user.click(screen.getByRole("button", { name: "Accept request" }));
    expect(props.onAcceptRescheduleRequest).toHaveBeenCalledWith(props.booking);

    await user.click(screen.getByRole("button", { name: "Reject request" }));
    expect(props.onRejectRescheduleRequest).toHaveBeenCalledWith(props.booking);
  });

  test("keeps accepted, no-show, and late-cancel actions wired where applicable", async () => {
    const user = userEvent.setup();
    const { props } = renderBookingListItem({
      status: "accepted",
      booking: {
        _id: "booking-4",
        bookingDate: "2026-08-02",
        price: 5000,
        client: { id: "client-4" },
      },
      isEligibleForNoShowLateCancel: () => true,
    });

    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(props.onUpdateBookingStatus).toHaveBeenCalledWith(props.booking, "completed");

    await user.click(screen.getByRole("button", { name: "Mark no-show" }));
    expect(props.onMarkNoShowBooking).toHaveBeenCalledWith(props.booking);

    await user.click(screen.getByRole("button", { name: "Late cancellation" }));
    expect(props.onMarkLateCancelBooking).toHaveBeenCalledWith(props.booking);
  });
});
