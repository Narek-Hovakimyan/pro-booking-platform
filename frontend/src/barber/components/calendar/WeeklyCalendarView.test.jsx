import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import WeeklyCalendarView from "./WeeklyCalendarView";

const booking = {
  _id: "booking-1",
  bookingDate: "2026-08-02",
  clientName: "Existing client",
  serviceName: "Cut",
  status: "accepted",
  time: "10:00",
  duration: 30,
};

describe("WeeklyCalendarView", () => {
  it("renders existing booking blocks on a closed day", () => {
    const onBookingClick = vi.fn();

    render(
      <MemoryRouter>
        <WeeklyCalendarView
          barberDefaultSchedule={{ startTime: "09:00", endTime: "18:00" }}
          bookings={[booking]}
          onBookingClick={onBookingClick}
          onWeekChange={vi.fn()}
          scheduleEntry={{ nonWorkingDays: ["2026-08-02"] }}
          weekStart="2026-07-27"
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Closed — existing bookings remain")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Existing client/ }));
    expect(onBookingClick).toHaveBeenCalledWith(booking);
  });
});
