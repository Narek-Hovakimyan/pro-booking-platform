import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useBookingPageAvailability from "./useBookingPageAvailability";

const defaultSchedule = { startTime: "09:00", endTime: "10:00", hasBreak: false };
const selectedDate = "2099-01-05";

const defaultProps = {
  activeBarberId: "barber-1",
  barber: { id: "barber-1" },
  barberBookings: [],
  barberDefaultSchedule: defaultSchedule,
  barberId: "barber-1",
  barberScheduleEntry: { explicitWeeklyDays: ["mon"] },
  barberScheduleOverrides: {},
  barberWeeklySchedule: { mon: { working: true, from: "09:00", to: "10:00" } },
  isLoading: false,
  isScheduleBlocked: false,
  isServicesLoading: false,
  nonWorkingDays: [],
  selectedDate,
  selectedDateDayKey: "mon",
  selectedService: { id: "service-1", duration: 30 },
  selectedTime: "",
  setSelectedTime: vi.fn(),
  step: 3,
};

function AvailabilityHarness({ overrides = {} }) {
  const availability = useBookingPageAvailability({ ...defaultProps, ...overrides });

  return <>
    <span data-testid="schedule">{JSON.stringify(availability.selectedDaySchedule)}</span>
    <span data-testid="slots">{availability.availableSlots.join(",")}</span>
    <span data-testid="working">{String(availability.isBarberNotWorking)}</span>
    <span data-testid="valid">{String(availability.isSelectedTimeValid)}</span>
    <span data-testid="message">{availability.slotMessage}</span>
  </>;
}

describe("useBookingPageAvailability", () => {
  it("uses date overrides, explicit weekdays, then the inherited default schedule", () => {
    const view = render(<AvailabilityHarness overrides={{
      barberScheduleOverrides: {
        [selectedDate]: { isWorking: true, startTime: "11:00", endTime: "12:00" },
      },
    }} />);
    expect(screen.getByTestId("schedule")).toHaveTextContent('"from":"11:00"');

    view.rerender(<AvailabilityHarness overrides={{
      barberScheduleOverrides: {},
      barberWeeklySchedule: { mon: { working: true, from: "10:00", to: "11:00" } },
    }} />);
    expect(screen.getByTestId("schedule")).toHaveTextContent('"from":"10:00"');

    view.rerender(<AvailabilityHarness overrides={{
      barberScheduleEntry: { explicitWeeklyDays: ["mon"] },
      selectedDateDayKey: "tue",
    }} />);
    expect(screen.getByTestId("schedule")).toHaveTextContent('"from":"09:00"');
  });

  it("gates non-working dates, closed weekdays, and an active barber switch before generating slots", () => {
    const view = render(<AvailabilityHarness overrides={{ nonWorkingDays: [selectedDate] }} />);
    expect(screen.getByTestId("working")).toHaveTextContent("true");
    expect(screen.getByTestId("slots")).toBeEmptyDOMElement();
    expect(screen.getByTestId("message")).toHaveTextContent("Specialist is not working this day");

    view.rerender(<AvailabilityHarness overrides={{
      barberScheduleEntry: { explicitWeeklyDays: ["mon"] },
      barberWeeklySchedule: { mon: { working: false } },
    }} />);
    expect(screen.getByTestId("working")).toHaveTextContent("true");
    expect(screen.getByTestId("slots")).toBeEmptyDOMElement();

    view.rerender(<AvailabilityHarness overrides={{ activeBarberId: "barber-2" }} />);
    expect(screen.getByTestId("slots")).toBeEmptyDOMElement();
    expect(screen.getByTestId("message")).toHaveTextContent("No available slots");
  });

  it("recalculates slots for booking conflicts and service-duration changes", () => {
    const view = render(<AvailabilityHarness overrides={{
      barberBookings: [{ id: "booking-1", bookingDate: selectedDate, status: "accepted", time: "09:00", duration: 30 }],
    }} />);
    expect(screen.getByTestId("slots")).toHaveTextContent(/^09:30$/);

    view.rerender(<AvailabilityHarness overrides={{
      selectedService: { id: "service-1", duration: 60 },
    }} />);
    expect(screen.getByTestId("slots")).toHaveTextContent(/^09:00$/);
  });

  it("does not clear an invalid time while loading, then clears it once loading completes", async () => {
    const setSelectedTime = vi.fn();
    const view = render(<AvailabilityHarness overrides={{
      activeBarberId: "barber-2",
      isLoading: true,
      selectedTime: "09:00",
      setSelectedTime,
    }} />);
    expect(setSelectedTime).not.toHaveBeenCalled();

    view.rerender(<AvailabilityHarness overrides={{
      activeBarberId: "barber-2",
      selectedTime: "09:00",
      setSelectedTime,
    }} />);
    await waitFor(() => expect(setSelectedTime).toHaveBeenCalledWith(""));
  });

  it("reports the existing availability status messages and selected-time validity", () => {
    const view = render(<AvailabilityHarness overrides={{ isScheduleBlocked: true }} />);
    expect(screen.getByTestId("message")).toHaveTextContent("not currently accepting bookings");

    view.rerender(<AvailabilityHarness overrides={{ selectedService: null }} />);
    expect(screen.getByTestId("message")).toHaveTextContent("Select service first");

    view.rerender(<AvailabilityHarness overrides={{ selectedDate: "" }} />);
    expect(screen.getByTestId("message")).toHaveTextContent("Choose a date first");

    view.rerender(<AvailabilityHarness overrides={{
      selectedTime: "09:00",
      barberBookings: [],
    }} />);
    expect(screen.getByTestId("valid")).toHaveTextContent("true");

    view.rerender(<AvailabilityHarness overrides={{
      selectedService: { id: "service-1", duration: 90 },
    }} />);
    expect(screen.getByTestId("message")).toHaveTextContent("Not enough time for selected service");

    view.rerender(<AvailabilityHarness overrides={{
      selectedService: { id: "service-1", duration: 10 },
      barberBookings: [
        { id: "booking-1", bookingDate: selectedDate, status: "accepted", time: "09:00", duration: 10 },
        { id: "booking-2", bookingDate: selectedDate, status: "accepted", time: "09:10", duration: 10 },
        { id: "booking-3", bookingDate: selectedDate, status: "accepted", time: "09:20", duration: 10 },
        { id: "booking-4", bookingDate: selectedDate, status: "accepted", time: "09:30", duration: 10 },
        { id: "booking-5", bookingDate: selectedDate, status: "accepted", time: "09:40", duration: 10 },
        { id: "booking-6", bookingDate: selectedDate, status: "accepted", time: "09:50", duration: 10 },
      ],
    }} />);
    expect(screen.getByTestId("message")).toHaveTextContent("This time is already booked");
  });
});
