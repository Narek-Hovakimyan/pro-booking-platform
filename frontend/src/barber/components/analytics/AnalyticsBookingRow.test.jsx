import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import AnalyticsBookingRow from "./AnalyticsBookingRow";

const navigateMock = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/shared/components/StatusBadge", () => ({
  default: ({ status }) => <div>Status: {status}</div>,
}));

const booking = {
  _id: "booking-1",
  status: "pending",
  note: "Needs a quiet chair",
};

function renderBookingRow(overrides = {}) {
  const props = {
    booking,
    linkTo: "/admin/bookings",
    getClientName: () => "Alice",
    getServiceName: () => "Haircut",
    getBookingTime: () => "10:00",
    getBookingPrice: () => "5,000 AMD",
    ...overrides,
  };

  render(<AnalyticsBookingRow {...props} />);
  return props;
}

describe("AnalyticsBookingRow", () => {
  it("renders complete AMD prices without duplicating the currency label", () => {
    renderBookingRow();

    expect(screen.getByText("Haircut · 10:00 · 5,000 AMD")).toBeInTheDocument();
    expect(screen.queryByText("Haircut · 10:00 · 5,000 AMD AMD")).not.toBeInTheDocument();
    expect(screen.getByText("Note: Needs a quiet chair")).toBeInTheDocument();
  });

  it("shows zero prices safely and omits invalid or missing prices", () => {
    const { rerender } = render(
      <AnalyticsBookingRow
        booking={booking}
        getBookingPrice={() => "0 AMD"}
        getBookingTime={() => "10:00"}
        getClientName={() => "Alice"}
        getServiceName={() => "Haircut"}
        linkTo="/admin/bookings"
      />
    );

    expect(screen.getByText("Haircut · 10:00 · 0 AMD")).toBeInTheDocument();

    rerender(
      <AnalyticsBookingRow
        booking={booking}
        getBookingPrice={() => ""}
        getBookingTime={() => "10:00"}
        getClientName={() => "Alice"}
        getServiceName={() => "Haircut"}
        linkTo="/admin/bookings"
      />
    );

    expect(screen.getByText("Haircut · 10:00")).toBeInTheDocument();
    expect(screen.queryByText(/NaN AMD/u)).not.toBeInTheDocument();
  });

  it("keeps view navigation wired", async () => {
    const user = userEvent.setup();
    renderBookingRow();

    await user.click(screen.getByRole("button", { name: /View/i }));
    expect(navigateMock).toHaveBeenCalledWith("/admin/bookings");
  });
});
