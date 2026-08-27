import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { renderWithProviders } from "@/test/renderWithProviders";
import BarberCalendarDayPage from "./BarberCalendarDayPage";

const mocks = vi.hoisted(() => ({ useBarberBookings: vi.fn() }));

vi.mock("@/barber/hooks/useBarberBookings", () => ({
  default: mocks.useBarberBookings,
}));

beforeEach(() => {
  mocks.useBarberBookings.mockReturnValue({
    activeServices: [],
    isAddModalOpen: false,
    isAddingBooking: false,
    actionError: "",
    manualBooking: {},
    createManualBooking: vi.fn(),
    openAddBookingModal: vi.fn(),
    setIsAddModalOpen: vi.fn(),
    updateManualBooking: vi.fn(),
  });
});

vi.mock("@/store/slices/bookingsSlice", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchBarberBookings: vi.fn(() => () => Promise.resolve([])),
    updateBooking: vi.fn((booking) => ({ type: "bookings/updateBooking", payload: booking })),
  };
});

vi.mock("@/shared/lib/socket", () => ({ getSocket: () => null }));

vi.mock("@/barber/components/calendar/DayTimelineView", () => ({
  default: ({ selectedDaySchedule }) => (
    <div data-testid="day-timeline">
      Timeline {selectedDaySchedule?.from} - {selectedDaySchedule?.to}
    </div>
  ),
}));

vi.mock("@/barber/components/RejectBookingModal", () => ({ default: () => null }));
vi.mock("@/barber/components/bookings/ManualBookingModal", () => ({ default: () => null }));

afterEach(() => vi.clearAllMocks());

describe("BarberCalendarDayPage schedule reload", () => {
  it("renders inherited default hours from sparse schedule provenance", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/calendar/day/:date" element={<BarberCalendarDayPage />} />
      </Routes>,
      {
        initialEntries: ["/admin/calendar/day/2026-09-18"],
        preloadedState: {
          auth: {
            currentUser: { id: "barber-1", role: "barber" },
            token: "token",
            isAuthenticated: true,
          },
          bookings: [],
          services: [],
          schedule: {
            "barber-1": {
              weeklySchedule: {
                mon: { working: true, from: "09:00", to: "18:00" },
              },
              explicitWeeklyDays: [],
              defaultSchedule: {
                startTime: "18:00",
                endTime: "20:00",
                hasBreak: false,
                breakStart: "",
                breakEnd: "",
              },
              dateSchedules: {},
              scheduleOverrides: {},
              nonWorkingDays: [],
            },
          },
        },
      }
    );

    expect(await screen.findByText("Working hours: 18:00 - 20:00")).toBeVisible();
    expect(screen.getByTestId("day-timeline")).toHaveTextContent("18:00 - 20:00");
    expect(screen.queryByText(/09:00/)).not.toBeInTheDocument();
  });

  it("passes the displayed primary salon context to manual booking", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/calendar/day/:date" element={<BarberCalendarDayPage />} />
      </Routes>,
      {
        initialEntries: ["/admin/calendar/day/2026-09-18"],
        preloadedState: {
          auth: {
            currentUser: {
              id: "barber-1",
              role: "barber",
              salons: [
                { salon: "salon-1", status: "approved" },
                { salon: "salon-2", status: "approved", isPrimary: true },
              ],
            },
            token: "token",
            isAuthenticated: true,
          },
          bookings: [],
          services: [],
          schedule: {
            "barber-1": {
              weeklySchedule: {},
              explicitWeeklyDays: [],
              defaultSchedule: { startTime: "18:00", endTime: "20:00" },
              dateSchedules: {},
              scheduleOverrides: {},
              nonWorkingDays: [],
            },
          },
        },
      }
    );

    expect(await screen.findByText("Working hours: 18:00 - 20:00")).toBeVisible();
    expect(mocks.useBarberBookings).toHaveBeenCalledWith(
      expect.objectContaining({ salonContextId: "salon-2" })
    );
  });
});
