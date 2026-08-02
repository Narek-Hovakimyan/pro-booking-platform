import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import CalendarBookingCard from "./CalendarBookingCard";

vi.mock("@/shared/components/StatusBadge", () => ({
  default: ({ status }) => <div>Status: {status}</div>,
}));

vi.mock("@/barber/components/bookings/ClientReliabilitySummary", () => ({
  default: ({ clientId }) => <div>Reliability: {clientId}</div>,
}));

function renderCard(overrides = {}) {
  const props = {
    booking: {
      _id: "booking-1",
      client: { id: "client-1" },
      rescheduleRequest: {
        status: "pending",
        requestedBookingDate: "2026-08-03",
        requestedTime: "15:00",
      },
    },
    status: "pending",
    clientName: "Alice",
    timeRange: "10:00–11:00",
    serviceName: "Haircut",
    phone: "+37499111222",
    duration: 60,
    price: 5000,
    notes: "Bring reference photo",
    onAccept: vi.fn(),
    onReject: vi.fn(),
    onComplete: vi.fn(),
    onNoShow: vi.fn(),
    onLateCancel: vi.fn(),
    ...overrides,
  };

  render(<CalendarBookingCard {...props} />);
  return props;
}

describe("CalendarBookingCard", () => {
  it("uses AMD formatting and preserves the requested date and time", () => {
    renderCard();

    expect(screen.getByText("Price: 5,000 AMD")).toBeInTheDocument();
    expect(screen.queryByText(/դրամ/u)).not.toBeInTheDocument();
    expect(screen.getByText("To: Mon, Aug 3 15:00")).toBeInTheDocument();
    expect(screen.queryByText("2026-08-03")).not.toBeInTheDocument();
  });

  it("formats string, zero, and missing prices without throwing", () => {
    const props = getProps({ price: "5000" });
    const { rerender } = render(<CalendarBookingCard {...props} />);
    expect(screen.getByText("Price: 5,000 AMD")).toBeInTheDocument();

    rerender(<CalendarBookingCard {...props} price={0} />);
    expect(screen.getByText("Price: 0 AMD")).toBeInTheDocument();

    rerender(<CalendarBookingCard {...props} price={undefined} />);
    expect(screen.getByText("Price: 0 AMD")).toBeInTheDocument();
  });

  it("renders a safe fallback for an invalid requested date", () => {
    renderCard({
      booking: {
        _id: "booking-2",
        client: { id: "client-2" },
        rescheduleRequest: {
          status: "pending",
          requestedBookingDate: "not-a-date",
          requestedTime: "16:00",
        },
      },
    });

    expect(screen.getByText("To: — 16:00")).toBeInTheDocument();
    expect(screen.queryByText("not-a-date")).not.toBeInTheDocument();
  });

  it("keeps pending and message actions wired", async () => {
    const user = userEvent.setup();
    const props = renderCard();

    await user.click(screen.getByRole("button", { name: "Accept" }));
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(props.onAccept).toHaveBeenCalledTimes(1);
    expect(props.onReject).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Message client" })).toHaveAttribute(
      "href",
      "sms:+37499111222"
    );
  });

  it("keeps complete, no-show, and late-cancel actions wired", async () => {
    const user = userEvent.setup();
    const props = renderCard({
      status: "accepted",
      booking: {
        _id: "booking-3",
        status: "accepted",
        client: { id: "client-3" },
        bookingDate: "2020-01-01",
      },
    });

    await user.click(screen.getByRole("button", { name: "Mark completed" }));
    await user.click(screen.getByRole("button", { name: "Mark no-show" }));
    await user.click(screen.getByRole("button", { name: "Late cancellation" }));
    expect(props.onComplete).toHaveBeenCalledTimes(1);
    expect(props.onNoShow).toHaveBeenCalledTimes(1);
    expect(props.onLateCancel).toHaveBeenCalledTimes(1);
  });
});

function getProps(overrides = {}) {
  return {
    booking: {
      _id: "booking-price",
      client: { id: "client-price" },
      rescheduleRequest: { status: "pending" },
    },
    status: "pending",
    clientName: "Price client",
    timeRange: "10:00–11:00",
    serviceName: "Haircut",
    duration: 60,
    onAccept: vi.fn(),
    onReject: vi.fn(),
    onComplete: vi.fn(),
    onNoShow: vi.fn(),
    onLateCancel: vi.fn(),
    ...overrides,
  };
}
