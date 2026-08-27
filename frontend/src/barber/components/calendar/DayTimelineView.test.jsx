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

  it("creates only available snapped slots and keeps booking clicks isolated", () => {
    const onCreateSlot = vi.fn();
    const onAccept = vi.fn();
    render(
      <DayTimelineView
        bookings={[booking]}
        dateKey="2099-08-03"
        isNonWorkingDay={false}
        onAccept={onAccept}
        onCreateSlot={onCreateSlot}
        selectedDaySchedule={{ working: true, from: "09:00", to: "18:00", breakFrom: "12:00", breakTo: "13:00" }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Existing client/ }));
    expect(onCreateSlot).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /Existing client/ })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: /Add booking at the first available time/ }), { key: "Enter" });
    expect(onCreateSlot).toHaveBeenCalledWith("09:00");
  });

  it("rejects closed-day slot creation and closes the details dialog with Escape", () => {
    const onCreateSlot = vi.fn();
    render(<DayTimelineView bookings={[booking]} dateKey="2099-08-03" isNonWorkingDay onCreateSlot={onCreateSlot} selectedDaySchedule={{ working: false, from: "", to: "" }} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Add booking at the first available time/ }), { key: "Enter" });
    expect(onCreateSlot).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("no available time slot");
    fireEvent.click(screen.getByRole("button", { name: /Existing client/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps short overlapping services time-proportional", () => {
    render(<DayTimelineView bookings={[
      { ...booking, _id: "short", clientName: "Short", time: "10:00", duration: 10 },
      { ...booking, _id: "overlap", clientName: "Overlap", time: "10:05", duration: 15 },
    ]} dateKey="2099-08-03" isNonWorkingDay={false} selectedDaySchedule={{ working: true, from: "09:00", to: "18:00" }} />);
    expect(screen.getByRole("button", { name: /Short/ })).toHaveStyle({ height: "20px" });
    expect(screen.getByRole("button", { name: /Overlap/ })).toHaveStyle({ height: "20px" });
  });

  it("uses the first later valid slot for keyboard creation today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T05:55:00.000Z"));
    const onCreateSlot = vi.fn();
    render(<DayTimelineView bookings={[{ ...booking, time: "10:30", duration: 30 }]} dateKey="2026-08-26" isNonWorkingDay={false} onCreateSlot={onCreateSlot} selectedDaySchedule={{ working: true, from: "09:00", to: "12:00", breakFrom: "10:00", breakTo: "10:30" }} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Add booking at the first available time/ }), { key: "Enter" });
    expect(onCreateSlot).toHaveBeenCalledWith("11:00");
    vi.useRealTimers();
  });

  it("keeps booking controls outside the slot control and never creates from booking activation", () => {
    const onCreateSlot = vi.fn();
    render(<DayTimelineView bookings={[booking]} dateKey="2099-08-03" isNonWorkingDay={false} onCreateSlot={onCreateSlot} selectedDaySchedule={{ working: true, from: "09:00", to: "18:00" }} />);
    const bookingControl = screen.getByRole("button", { name: /Existing client/ });
    expect(bookingControl.parentElement?.closest("button, [role='button']")).toBeNull();
    expect(screen.getByRole("button", { name: /Add booking at the first available time/ })).toBeInTheDocument();
    fireEvent.keyDown(bookingControl, { key: "Enter" });
    fireEvent.click(bookingControl);
    expect(onCreateSlot).not.toHaveBeenCalled();
  });

  it("uses exact schedule boundaries and keeps edge time labels inside the gutter", () => {
    render(<DayTimelineView bookings={[]} dateKey="2099-08-03" isNonWorkingDay={false} selectedDaySchedule={{ working: true, from: "13:30", to: "20:00" }} />);
    const first = screen.getByTestId("time-label-13:30");
    const last = screen.getByTestId("time-label-20:00");
    expect(first).toHaveStyle({ top: "0px", transform: "none" });
    expect(last).toHaveStyle({ transform: "translateY(-100%)" });
    expect(screen.queryByTestId("time-label-13:00")).not.toBeInTheDocument();
  });
});
