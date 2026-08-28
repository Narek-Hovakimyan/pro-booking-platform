import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import BookingPageContent from "./BookingPageContent";

vi.mock("@/client/components/ClientBooking", () => ({
  default: (props) => (
    <div data-testid="client-booking">
      {props.selectedDate}|{props.selectedTime}|{props.availableSlots.join(",")}|{props.onRefreshServices ? "refresh" : "no-refresh"}
    </div>
  ),
}));

vi.mock("@/client/components/BookingSummary", () => ({
  default: (props) => (
    <div data-testid="booking-summary">
      {props.selectedService?.name}|{props.selectedDateLabel}|{props.selectedTime}
    </div>
  ),
}));

const clientBookingProps = {
  selectedDate: "2099-01-05",
  selectedTime: "10:00",
  availableSlots: ["10:00"],
  onRefreshServices: () => {},
};
const summaryProps = {
  selectedService: { name: "Precision Cut" },
  selectedDateLabel: "Mon, Jan 5",
  selectedTime: "10:00",
};

describe("BookingPageContent", () => {
  it("renders the booking header and forwards grouped child props", () => {
    render(
      <BookingPageContent
        barber={{ name: "Alex Barber", phone: "+37477123456" }}
        display={{ error: "", isLoading: false, step: 3 }}
        clientBookingProps={clientBookingProps}
        summaryProps={summaryProps}
      />
    );

    expect(screen.getByRole("heading", { name: "Alex Barber" })).toBeInTheDocument();
    expect(screen.getByText("Time")).toBeInTheDocument();
    expect(screen.getByTestId("client-booking")).toHaveTextContent(
      "2099-01-05|10:00|10:00|refresh"
    );
    expect(screen.getByTestId("booking-summary")).toHaveTextContent(
      "Precision Cut|Mon, Jan 5|10:00"
    );
  });

  it("preserves loading and error presentation", () => {
    const view = render(
      <BookingPageContent
        barber={{ name: "Alex Barber" }}
        display={{ error: "Unable to load booking data", isLoading: true, step: 2 }}
        clientBookingProps={clientBookingProps}
        summaryProps={summaryProps}
      />
    );

    expect(screen.getByText("Unable to load booking data")).toBeInTheDocument();
    expect(view.container.querySelector(".animate-pulse")).toBeInTheDocument();

    view.rerender(
      <BookingPageContent
        barber={{ name: "Alex Barber" }}
        display={{ error: "", isLoading: false, step: 4 }}
        clientBookingProps={clientBookingProps}
        summaryProps={summaryProps}
      />
    );
    expect(screen.queryByText("Unable to load booking data")).not.toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();
  });
});
