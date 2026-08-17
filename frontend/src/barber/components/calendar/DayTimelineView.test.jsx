import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import DayTimelineView from "./DayTimelineView";

vi.mock("./CalendarBookingCard", () => ({
  default: ({ booking, onAccept }) => (
    <button onClick={onAccept} type="button">
      Accept {booking.clientName}
    </button>
  ),
}));

const booking = {
  _id: "booking-1",
  clientName: "Existing client",
  serviceName: "Cut",
  status: "accepted",
  time: "10:00",
  duration: 30,
};

describe("DayTimelineView", () => {
  it("keeps existing bookings actionable on a closed day", () => {
    const onAccept = vi.fn();

    render(
      <DayTimelineView
        bookings={[booking]}
        dateKey="2026-08-03"
        isNonWorkingDay
        onAccept={onAccept}
        selectedDaySchedule={{ working: false, from: "", to: "" }}
      />
    );

    expect(
      screen.getByText("This day is closed for new availability. Existing bookings remain actionable.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Existing client/ }));
    fireEvent.click(screen.getByRole("button", { name: "Accept Existing client" }));
    expect(onAccept).toHaveBeenCalledWith(booking);
  });

  it("keeps the open-day timeline unchanged", () => {
    render(
      <DayTimelineView
        bookings={[booking]}
        dateKey="2026-08-03"
        isNonWorkingDay={false}
        selectedDaySchedule={{ working: true, from: "09:00", to: "18:00" }}
      />
    );

    expect(screen.queryByText(/This day is closed/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Existing client/ })).toBeInTheDocument();
  });
});
