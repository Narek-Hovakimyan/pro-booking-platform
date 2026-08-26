import { createElement, forwardRef, useImperativeHandle } from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import useClientBookingActions from "./useClientBookingActions";

const mocks = vi.hoisted(() => ({ dispatch: vi.fn(), api: { put: vi.fn(), patch: vi.fn(), post: vi.fn() }, navigate: vi.fn(), refresh: vi.fn() }));
vi.mock("react-redux", () => ({ useDispatch: () => mocks.dispatch }));
vi.mock("@/shared/api/axios", () => ({ default: mocks.api }));
vi.mock("@/store/slices/bookingsSlice", () => ({ fetchBarberBookings: vi.fn((id) => ({ type: "barber", id })), cancelBooking: vi.fn((data) => ({ type: "cancel", data })), updateBooking: vi.fn((data) => ({ type: "update", data })) }));
vi.mock("@/store/slices/notificationsSlice", () => ({ addNotification: vi.fn((data) => ({ type: "notification", data })) }));
vi.mock("@/store/slices/reviewsSlice", () => ({ addReview: vi.fn((data) => ({ type: "review", data })) }));

const booking = { id: "booking-1", barberId: "barber-1", salonId: "salon-1", status: "accepted", service: { id: "service-1" } };
const Harness = forwardRef((props, ref) => { const value = useClientBookingActions(props); useImperativeHandle(ref, () => value, [value]); return null; });

describe("useClientBookingActions", () => {
  it("transitions detail/cancel modal state and performs mutation/refetch", async () => {
    mocks.api.put.mockResolvedValue({ data: { ...booking, status: "cancelled" } });
    mocks.refresh.mockResolvedValue([]);
    const ref = { current: null };
    render(createElement(Harness, { ref, currentUser: { id: "client-1" }, navigate: mocks.navigate, refreshBookings: mocks.refresh, setError: vi.fn(), getBarberForBooking: () => ({ id: "barber-1" }), getSalonForBooking: () => ({ id: "salon-1" }), addSalonReview: vi.fn() }));
    act(() => ref.current.openBookingDetailsModal(booking));
    expect(ref.current.showBookingDetailsModal).toBe(true);
    act(() => ref.current.openCancelBookingModal(booking));
    expect(ref.current.cancellingBooking).toBe(booking);
    await act(async () => ref.current.cancelClientBooking({ cancelReason: "changed plans" }));
    expect(mocks.api.put).toHaveBeenCalledWith("/bookings/booking-1", { status: "cancelled", cancelReason: "changed plans" });
    expect(mocks.refresh).toHaveBeenCalled();
    expect(ref.current.cancellingBooking).toBe(null);
  });

  it("keeps rebook navigation salon-scoped", () => {
    const ref = { current: null };
    render(createElement(Harness, { ref, navigate: mocks.navigate, refreshBookings: mocks.refresh, setError: vi.fn(), getBarberForBooking: () => ({ id: "barber-1" }), getSalonForBooking: () => ({ id: "salon-1" }), addSalonReview: vi.fn() }));
    act(() => ref.current.startBookAgain(booking));
    expect(mocks.navigate).toHaveBeenCalledWith("/booking/barber-1?salonId=salon-1", expect.objectContaining({ state: expect.objectContaining({ serviceId: "service-1" }) }));
  });
});
