import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import AnalyticsNextBooking from "./AnalyticsNextBooking";

vi.mock("@/shared/components/StatusBadge", () => ({
  default: ({ status }) => <div>Status: {status}</div>,
}));

const baseBooking = {
  _id: "booking-1",
  status: "accepted",
};

function renderNextBooking(overrides = {}) {
  const props = {
    nextBooking: baseBooking,
    getClientName: () => "Alice",
    getServiceName: () => "Haircut",
    getBookingTime: () => "10:00",
    getBookingPrice: () => "5,000 AMD",
    onViewBookings: vi.fn(),
    ...overrides,
  };

  render(<AnalyticsNextBooking {...props} />);
  return props;
}

describe("AnalyticsNextBooking", () => {
  it("renders a complete AMD price without duplicating the currency label", () => {
    renderNextBooking();

    expect(screen.getByText("Haircut at 10:00 · 5,000 AMD")).toBeInTheDocument();
    expect(screen.queryByText("Haircut at 10:00 · 5,000 AMD AMD")).not.toBeInTheDocument();
  });

  it("shows zero prices safely and omits invalid or missing prices", () => {
    const { rerender } = render(
      <AnalyticsNextBooking
        getBookingPrice={() => "0 AMD"}
        getBookingTime={() => "10:00"}
        getClientName={() => "Alice"}
        getServiceName={() => "Haircut"}
        nextBooking={baseBooking}
        onViewBookings={vi.fn()}
      />
    );

    expect(screen.getByText("Haircut at 10:00 · 0 AMD")).toBeInTheDocument();

    rerender(
      <AnalyticsNextBooking
        getBookingPrice={() => ""}
        getBookingTime={() => "10:00"}
        getClientName={() => "Alice"}
        getServiceName={() => "Haircut"}
        nextBooking={baseBooking}
        onViewBookings={vi.fn()}
      />
    );

    expect(screen.getByText("Haircut at 10:00")).toBeInTheDocument();
    expect(screen.queryByText(/NaN AMD/u)).not.toBeInTheDocument();
  });

  it("keeps the view action wired", async () => {
    const user = userEvent.setup();
    const props = renderNextBooking();

    await user.click(screen.getByRole("button", { name: /View Details/i }));
    expect(props.onViewBookings).toHaveBeenCalledTimes(1);
  });
});
