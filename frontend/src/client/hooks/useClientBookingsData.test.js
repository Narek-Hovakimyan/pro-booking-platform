import { createElement, forwardRef, useImperativeHandle } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useClientBookingsData from "./useClientBookingsData";

const state = vi.hoisted(() => ({ auth: { currentUser: { id: "client-1" } }, bookings: [], reviews: [], users: [] }));
const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  socket: { on: vi.fn(), off: vi.fn() },
  get: vi.fn(),
  fetchClientBookings: vi.fn((id) => ({ type: "fetch", id })),
  setReviews: vi.fn((payload) => payload),
  setBarbers: vi.fn((payload) => payload),
}));
vi.mock("react-redux", () => ({ useDispatch: () => mocks.dispatch, useSelector: (selector) => selector(state) }));
vi.mock("@/shared/lib/socket", () => ({ getSocket: () => mocks.socket }));
vi.mock("@/shared/api/axios", () => ({ default: { get: mocks.get } }));
vi.mock("@/store/slices/bookingsSlice", () => ({ fetchClientBookings: mocks.fetchClientBookings }));
vi.mock("@/store/slices/reviewsSlice", () => ({ setReviews: mocks.setReviews }));
vi.mock("@/store/slices/usersSlice", () => ({ setBarbers: mocks.setBarbers }));

const Harness = forwardRef((props, ref) => { const value = useClientBookingsData(); useImperativeHandle(ref, () => value, [value]); return null; });
const deferred = () => {
  let resolve;
  const promise = new Promise((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
};

describe("useClientBookingsData", () => {
  beforeEach(() => {
    state.bookings = [
      { id: "active", clientId: "client-1", status: "accepted" },
      { id: "done", clientId: "client-1", status: "completed" },
      { id: "other", clientId: "other", status: "completed" },
    ];
    mocks.dispatch.mockResolvedValue(state.bookings);
    mocks.get.mockResolvedValue({ data: [] });
    mocks.socket.on.mockClear(); mocks.socket.off.mockClear();
  });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it("scopes bookings, groups statuses, and cleans one socket listener", async () => {
    const ref = { current: null };
    const view = render(createElement(Harness, { ref }));
    await waitFor(() => expect(ref.current?.myBookings).toHaveLength(2));
    expect(ref.current.activeBookings).toHaveLength(1);
    expect(ref.current.historyBookings).toHaveLength(1);
    expect(mocks.socket.on).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(mocks.socket.off).toHaveBeenCalledTimes(1);
  });

  it("classifies past accepted and confirmed bookings as history without changing other statuses", async () => {
    state.bookings = [
      { id: "past-accepted", clientId: "client-1", bookingDate: "2000-08-01", time: "10:00", status: "accepted" },
      { id: "past-confirmed", clientId: "client-1", bookingDate: "2000-08-02", time: "10:00", status: "confirmed" },
      { id: "completed", clientId: "client-1", bookingDate: "2000-08-03", time: "10:00", status: "completed" },
      { id: "pending", clientId: "client-1", bookingDate: "2099-08-04", time: "10:00", status: "pending" },
      { id: "other-client", clientId: "other", bookingDate: "2000-08-05", time: "10:00", status: "completed" },
    ];
    mocks.dispatch.mockResolvedValue(state.bookings);
    const ref = { current: null };
    render(createElement(Harness, { ref }));

    await waitFor(() => expect(ref.current?.myBookings).toHaveLength(4));
    expect(ref.current.historyBookings.map((booking) => booking.id).sort()).toEqual([
      "completed", "past-accepted", "past-confirmed",
    ]);
    expect(ref.current.activeBookings.map((booking) => booking.id)).toEqual(["pending"]);
  });

  it("surfaces loading errors without writing stale state", async () => {
    mocks.dispatch.mockRejectedValueOnce(new Error("offline"));
    const ref = { current: null };
    render(createElement(Harness, { ref }));
    await waitFor(() => expect(ref.current?.error).toContain("Could not load bookings"));
    await act(async () => {});
    expect(ref.current.isLoading).toBe(false);
  });

  it("ignores a deferred stale load after newer review enrichment completes", async () => {
    vi.useFakeTimers();
    const older = deferred();
    const newer = deferred();
    const newerBookings = [{
      id: "new-booking", clientId: "client-1", barberId: "new-barber", salonId: "new-salon",
    }];
    const olderBookings = [{
      id: "old-booking", clientId: "other-client", barberId: "old-barber", salonId: "old-salon",
    }];
    let fetchCount = 0;
    mocks.dispatch.mockImplementation((action) => {
      if (action?.type === "fetch") return [older.promise, newer.promise][fetchCount++];
      return Promise.resolve(action);
    });
    mocks.get.mockImplementation((url) => {
      if (url === "/reviews/new-barber") return Promise.resolve({ data: [{ bookingId: "new-booking" }] });
      if (url === "/salon-reviews/salon/new-salon") return Promise.resolve({ data: { reviews: [{ bookingId: "new-booking", salonId: "new-salon" }] } });
      if (url === "/users/barbers") return Promise.resolve({ data: [{ id: "new-barber" }] });
      throw new Error(`Unexpected stale enrichment request: ${url}`);
    });
    const ref = { current: null };
    render(createElement(Harness, { ref }));
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    let newerLoad;
    act(() => { newerLoad = ref.current.refreshBookings({ showLoading: true }); });
    await act(async () => { newer.resolve(newerBookings); await newerLoad; });

    expect(ref.current.salonReviews).toEqual([{ bookingId: "new-booking", salonId: "new-salon" }]);
    expect(ref.current.isLoading).toBe(false);
    expect(ref.current.error).toBe("");
    expect(mocks.fetchClientBookings).toHaveBeenCalledWith("client-1");
    expect(mocks.setReviews).toHaveBeenCalledWith({ barberId: "new-barber", reviews: [{ bookingId: "new-booking" }] });

    await act(async () => { older.resolve(olderBookings); await older.promise; });
    await act(async () => {});
    expect(ref.current.salonReviews).toEqual([{ bookingId: "new-booking", salonId: "new-salon" }]);
    expect(ref.current.isLoading).toBe(false);
    expect(ref.current.error).toBe("");
    expect(mocks.get).not.toHaveBeenCalledWith("/reviews/old-barber");
    expect(mocks.get).not.toHaveBeenCalledWith("/salon-reviews/salon/old-salon");
  });
});
