import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dispatch: vi.fn() }));
const noop = () => {};

import api from "@/shared/api/axios";
import useBookingPageData from "./useBookingPageData";

vi.mock("react-redux", () => ({ useDispatch: () => mocks.dispatch }));
vi.mock("@/shared/api/axios", () => ({ default: { get: vi.fn() } }));

const deferred = () => {
  let resolve;
  const promise = new Promise((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
};

function Harness({ barberId = "barber-1", salonId = "salon-1", needsEnrichedBarber = false, setters = {} }) {
  const data = useBookingPageData({
    barberId,
    activeSelectedSalonId: salonId,
    needsEnrichedBarber,
    setSelectedDate: setters.date || noop,
    setSelectedDayKey: setters.dayKey || noop,
    setSelectedServiceId: setters.service || noop,
    setSelectedTime: setters.time || noop,
  });
  return <><span data-testid="error">{data.error}</span><span data-testid="loading">{String(data.isLoading)}</span><button type="button" onClick={() => data.refreshServices().catch(() => {})}>refresh</button></>;
}

const successResponses = () => {
  api.get.mockResolvedValueOnce({ data: [{ id: "service-1" }] })
    .mockResolvedValueOnce({ data: { weeklySchedule: {} } })
    .mockResolvedValueOnce({ data: [{ id: "booking-1" }] });
};

beforeEach(() => {
  mocks.dispatch.mockClear();
  api.get.mockReset();
});

describe("useBookingPageData", () => {
  it("loads services, schedule, then bookings with salon-scoped endpoints", async () => {
    successResponses();
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(api.get.mock.calls.slice(0, 3).map(([url]) => url)).toEqual([
      "/services/barber-1?salonId=salon-1", "/schedules/barber-1/salon-1", "/bookings/barber/barber-1",
    ]);
    expect(mocks.dispatch).toHaveBeenCalledTimes(3);
  });

  it("clears selection after service failure while continuing later loads", async () => {
    const setters = { service: vi.fn(), time: vi.fn() };
    api.get.mockImplementation((url) => {
      if (url.startsWith("/services")) return Promise.reject({ response: { data: { message: "services unavailable" } } });
      return Promise.resolve({ data: [] });
    });
    render(<Harness setters={setters} />);
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(setters.service).toHaveBeenCalledWith(null);
    expect(setters.time).toHaveBeenCalledWith("");
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it("reports enriched-barber failure without preventing page data loading", async () => {
    api.get.mockImplementation((url) => url === "/users/barbers"
      ? Promise.reject({ response: { data: { message: "barber unavailable" } } })
      : Promise.resolve({ data: [] }));
    render(<Harness needsEnrichedBarber />);
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("error")).toHaveTextContent("barber unavailable");
  });

  it("blocks schedule failures and lets bookings failure provide its current error", async () => {
    const setters = { date: vi.fn(), dayKey: vi.fn(), time: vi.fn() };
    api.get.mockImplementation((url) => {
      if (url.startsWith("/schedules")) return Promise.reject({ response: { data: { message: "schedule unavailable" } } });
      if (url.startsWith("/bookings")) return Promise.reject({ response: { data: { message: "bookings unavailable" } } });
      return Promise.resolve({ data: [] });
    });
    render(<Harness setters={setters} />);
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("bookings unavailable"));
    expect(setters.date).toHaveBeenCalledWith("");
    expect(setters.dayKey).toHaveBeenCalledWith("");
  });

  it("does not dispatch stale initial data after unmount or salon switch", async () => {
    const first = deferred();
    api.get.mockReturnValueOnce(first.promise);
    const view = render(<Harness />);
    view.rerender(<Harness salonId="salon-2" />);
    await act(async () => first.resolve({ data: [] }));
    expect(mocks.dispatch).not.toHaveBeenCalled();
    view.unmount();
  });

  it("refreshes the current salon services with the confirmation timeout", async () => {
    successResponses();
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    api.get.mockResolvedValueOnce({ data: [{ id: "service-2" }] });
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith(
      "/services/barber-1?salonId=salon-1", expect.objectContaining({ timeout: expect.any(Number) })
    ));
  });
});
