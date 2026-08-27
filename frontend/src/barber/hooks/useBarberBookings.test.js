import { createElement, forwardRef, useImperativeHandle, useState } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useBarberBookings from "./useBarberBookings";

const state = vi.hoisted(() => ({ auth: { currentUser: { id: "barber-1", salons: [{ salon: "salon-1", status: "approved", isPrimary: true }] } }, notifications: [] }));
const mocks = vi.hoisted(() => ({ dispatch: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), socket: { on: vi.fn(), off: vi.fn() } }));
vi.mock("react-redux", () => ({ useDispatch: () => mocks.dispatch, useSelector: (selector) => selector(state) }));
vi.mock("@/shared/api/axios", () => ({ default: { get: mocks.get, post: mocks.post, put: mocks.put, patch: mocks.patch } }));
vi.mock("@/shared/lib/socket", () => ({ getSocket: () => mocks.socket }));
vi.mock("@/store/slices/bookingsSlice", () => ({ addBooking: vi.fn((data) => data), fetchBarberBookings: vi.fn(() => ({ type: "fetch" })), updateBooking: vi.fn((data) => data) }));

const Harness = forwardRef(({ selectedDate = "2026-08-26", services = [], manageLifecycle = true, salonContextId = null }, ref) => {
  const [date, setDate] = useState(selectedDate);
  const value = useBarberBookings({ services, selectedDate: date, setSelectedDate: setDate, manageLifecycle, salonContextId });
  useImperativeHandle(ref, () => value, [value]);
  return null;
});

const activeServices = [{ id: "service-1", barberId: "barber-1", active: true }];

const fillManualBooking = (ref) => {
  act(() => ref.current.openAddBookingModal());
  act(() => {
    ref.current.updateManualBooking("clientName", "Alex");
    ref.current.updateManualBooking("clientPhone", "123");
    ref.current.updateManualBooking("serviceId", "service-1");
    ref.current.updateManualBooking("time", "10:00");
  });
};

describe("useBarberBookings", () => {
  beforeEach(() => {
    state.auth.currentUser = { id: "barber-1", salons: [{ salon: "salon-1", status: "approved", isPrimary: true }] };
    mocks.dispatch.mockResolvedValue([]); mocks.get.mockResolvedValue({ data: [] }); mocks.post.mockResolvedValue({ data: { id: "new" } });
    mocks.socket.on.mockClear(); mocks.socket.off.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.socket.on.mockReset();
    mocks.socket.off.mockReset();
  });

  it("refreshes through one scoped socket listener and highlights new bookings", async () => {
    let handler;
    mocks.socket.on.mockImplementation((event, callback) => { if (event === "bookingUpdated") handler = callback; });
    const ref = { current: null };
    render(createElement(Harness, { ref }));
    await waitFor(() => expect(mocks.socket.on).toHaveBeenCalledTimes(1));
    expect(typeof handler).toBe("function");
    handler({ booking: { barberId: "barber-1" } });
    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalled());
  });

  it("validates and creates manual bookings with the primary salon", async () => {
    const ref = { current: null };
    render(createElement(Harness, { ref, services: activeServices }));
    await waitFor(() => expect(ref.current).toBeTruthy());
    fillManualBooking(ref);
    await act(async () => ref.current.createManualBooking({ preventDefault: vi.fn() }));
    expect(mocks.post).toHaveBeenCalledWith("/bookings", expect.objectContaining({ salonId: "salon-1", createdBy: "barber" }));
  });

  it("uses the only approved salon without requiring a primary flag", async () => {
    state.auth.currentUser = {
      id: "barber-1",
      salons: [{ salon: "salon-only", status: "approved" }],
    };
    const ref = { current: null };
    render(createElement(Harness, { ref, services: activeServices }));
    await waitFor(() => expect(ref.current).toBeTruthy());
    fillManualBooking(ref);
    await act(async () => ref.current.createManualBooking({ preventDefault: vi.fn() }));
    expect(mocks.post).toHaveBeenCalledWith(
      "/bookings",
      expect.objectContaining({ salonId: "salon-only" })
    );
  });

  it("uses an explicit calendar salon context among multiple approved salons", async () => {
    state.auth.currentUser = {
      id: "barber-1",
      salons: [
        { salon: "salon-1", status: "approved" },
        { salon: "salon-2", status: "approved" },
      ],
    };
    const ref = { current: null };
    render(createElement(Harness, { ref, services: activeServices, salonContextId: "salon-2" }));
    await waitFor(() => expect(ref.current).toBeTruthy());
    fillManualBooking(ref);
    await act(async () => ref.current.createManualBooking({ preventDefault: vi.fn() }));
    expect(mocks.post).toHaveBeenCalledWith(
      "/bookings",
      expect.objectContaining({ salonId: "salon-2" })
    );
  });

  it("fails closed when multiple approved salons have no calendar context", async () => {
    state.auth.currentUser = {
      id: "barber-1",
      salons: [
        { salon: "salon-1", status: "approved" },
        { salon: "salon-2", status: "approved" },
      ],
    };
    const ref = { current: null };
    render(createElement(Harness, { ref, services: activeServices }));
    await waitFor(() => expect(ref.current).toBeTruthy());
    fillManualBooking(ref);
    await act(async () => ref.current.createManualBooking({ preventDefault: vi.fn() }));
    expect(mocks.post).not.toHaveBeenCalled();
    expect(ref.current.actionError).toBe(
      "Choose a salon context in the calendar before creating a booking."
    );
  });

  it("preserves personal booking when no salon context exists", async () => {
    state.auth.currentUser = { id: "barber-1", salons: [] };
    const ref = { current: null };
    render(createElement(Harness, { ref, services: activeServices }));
    await waitFor(() => expect(ref.current).toBeTruthy());
    fillManualBooking(ref);
    await act(async () => ref.current.createManualBooking({ preventDefault: vi.fn() }));
    expect(mocks.post).toHaveBeenCalledWith(
      "/bookings",
      expect.objectContaining({ salonId: undefined })
    );
  });

  it("opens one prefilled manual booking without a second calendar lifecycle", async () => {
    const ref = { current: null };
    render(createElement(Harness, { ref, manageLifecycle: false }));
    await waitFor(() => expect(ref.current).toBeTruthy());
    act(() => ref.current.openAddBookingModal({ bookingDate: "2026-08-30", time: "10:10" }));
    expect(ref.current.manualBooking).toMatchObject({ bookingDate: "2026-08-30", time: "10:10" });
    expect(mocks.socket.on).not.toHaveBeenCalled();
  });
});
