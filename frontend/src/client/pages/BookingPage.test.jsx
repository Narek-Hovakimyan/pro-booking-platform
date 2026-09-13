import { act, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clientBookingProps: null,
  confirmationSetStep: vi.fn(),
  dispatch: vi.fn(),
  navigate: vi.fn(),
}));

import api from "@/shared/api/axios";
import useBookingPageData from "@/client/hooks/useBookingPageData";
import { useClientBookingConfirmation } from "@/client/hooks/useClientBookingConfirmation";
import BookingPage from "./BookingPage";

vi.mock("react-redux", () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (selector) => selector({ users: [{ id: "barber-1", role: "barber" }] }),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/shared/api/axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@/client/components/booking/BookingPageContent", () => ({
  default: function BookingPageContentMock({ clientBookingProps }) {
    mocks.clientBookingProps = clientBookingProps;
    const confirmation = useClientBookingConfirmation({
      barberId: clientBookingProps.barber?.id || clientBookingProps.barber?._id,
      client: clientBookingProps.client,
      currentUser: clientBookingProps.currentUser,
      isSaving: false,
      isSelectedTimeValid: true,
      onRefreshServices: clientBookingProps.onRefreshServices,
      selectedBarberId: clientBookingProps.barber?.id || clientBookingProps.barber?._id,
      selectedBookingSalonId: clientBookingProps.selectedSalonId,
      selectedDate: clientBookingProps.selectedDate,
      selectedDateDayKey: clientBookingProps.selectedDayKey || "mon",
      selectedService: clientBookingProps.selectedService,
      selectedServiceEntityId: clientBookingProps.selectedServiceId,
      selectedTime: clientBookingProps.selectedTime,
      setError: vi.fn(),
      setSelectedTime: vi.fn(),
      setStep: mocks.confirmationSetStep,
      voucherCode: "",
    });

    return (
      <div>
        <output data-testid="selected-service-id">
          {clientBookingProps.selectedService?.id || clientBookingProps.selectedService?._id || "none"}
        </output>
        <output data-testid="services-loading">
          {String(clientBookingProps.isServiceDataLoading)}
        </output>
        <button onClick={() => clientBookingProps.onRefreshServices()} type="button">
          Refresh services
        </button>
        <button onClick={confirmation.openConfirmation} type="button">
          Start confirmation
        </button>
        <output data-testid="confirmation-preparing">
          {String(confirmation.isPreparingConfirmation)}
        </output>
        <output data-testid="confirmation-open">
          {String(confirmation.showConfirmation)}
        </output>
      </div>
    );
  },
}));

const renderPage = (state, props = {}) => {
  const bookingProps = {
    step: 2,
    setStep: vi.fn(),
    services: [],
    selectedServiceId: null,
    setSelectedServiceId: vi.fn(),
    selectedDayKey: "",
    setSelectedDayKey: vi.fn(),
    selectedTime: "",
    setSelectedTime: vi.fn(),
    client: { name: "", phone: "", note: "" },
    currentUser: { id: "client-1" },
    bookings: [],
    schedule: {},
    setClient: vi.fn(),
    ...props,
  };

  render(
    <MemoryRouter initialEntries={[{ pathname: "/booking/barber-1", search: "?salonId=salon-7", state }]}>
      <Routes><Route path="/booking/:barberId" element={<BookingPage {...bookingProps} />} /></Routes>
    </MemoryRouter>
  );
  return bookingProps;
};

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((outerResolve, outerReject) => {
    resolve = outerResolve;
    reject = outerReject;
  });
  return { promise, reject, resolve };
};

const createHookProps = (overrides = {}) => ({
  activeSelectedSalonId: "salon-7",
  barberId: "barber-1",
  needsEnrichedBarber: false,
  setSelectedDate: vi.fn(),
  setSelectedDayKey: vi.fn(),
  setSelectedServiceId: vi.fn(),
  setSelectedTime: vi.fn(),
  ...overrides,
});

const mockServiceRequests = (requests) => {
  vi.mocked(api.get).mockImplementation((url) => {
    if (url.startsWith("/services/")) {
      const request = requests.shift();
      if (!request) throw new Error("Unexpected service request");
      return request.promise;
    }
    return Promise.resolve({ data: [] });
  });
};

const dispatchedServices = () =>
  mocks.dispatch.mock.calls
    .map(([action]) => action?.payload?.services)
    .filter(Boolean);

const resolveInitialServices = async (request, services = []) => {
  await act(async () => {
    request.resolve({ data: services });
    await request.promise;
  });
};

describe("BookingPage route and reset behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.dispatch.mockClear();
    mocks.navigate.mockClear();
    mocks.confirmationSetStep.mockClear();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    vi.mocked(api.post).mockResolvedValue({
      data: { finalPrice: 1000, originalPrice: 1000, depositAmount: 0 },
    });
  });

  afterEach(() => vi.useRealTimers());

  it("keeps salon query context while cleaning rebook state and resets into the rebook step", () => {
    const props = renderPage({
      rebook: true,
      barber: { id: "barber-1", depositSettings: { enabled: false } },
      barberId: "barber-1",
      serviceId: "service-1",
      selectedSalonId: "salon-7",
    });

    expect(mocks.navigate).toHaveBeenCalledWith(
      { pathname: "/booking/barber-1", search: "?salonId=salon-7" },
      expect.objectContaining({ replace: true, state: { barber: { id: "barber-1", depositSettings: { enabled: false } } } })
    );
    act(() => vi.runOnlyPendingTimers());
    expect(props.setStep).toHaveBeenCalledWith(3);
    expect(props.setSelectedServiceId).toHaveBeenCalledWith("service-1");
  });

  it("resets a standard booking flow to service selection", () => {
    const props = renderPage({ barber: { id: "barber-1", depositSettings: { enabled: false } } });

    act(() => vi.runOnlyPendingTimers());
    expect(props.setStep).toHaveBeenCalledWith(2);
    expect(props.setSelectedServiceId).toHaveBeenCalledWith(null);
    expect(props.setSelectedTime).toHaveBeenCalledWith("");
    expect(props.setClient).toHaveBeenCalledWith({ name: "", phone: "", note: "" });
  });

  it("keeps the selected service available while confirmation refreshes services", async () => {
    const initial = createDeferred();
    const refresh = createDeferred();
    const service = { id: "service-1", barberId: "barber-1", active: true };
    mockServiceRequests([initial, refresh]);

    renderPage(
      { barber: { id: "barber-1", depositSettings: { enabled: false } } },
      { services: [service], selectedServiceId: service.id, selectedTime: "10:00" }
    );

    await resolveInitialServices(initial, [service]);
    expect(screen.getByTestId("selected-service-id")).toHaveTextContent(service.id);

    act(() => {
      screen.getByRole("button", { name: "Refresh services" }).click();
    });

    expect(screen.getByTestId("services-loading")).toHaveTextContent("true");
    expect(screen.getByTestId("selected-service-id")).toHaveTextContent(service.id);

    await act(async () => {
      refresh.resolve({ data: [service] });
      await refresh.promise;
    });

    expect(screen.getByTestId("services-loading")).toHaveTextContent("false");
    expect(screen.getByTestId("selected-service-id")).toHaveTextContent(service.id);
  });

  it("continues confirmation through the quote after the refresh loading transition", async () => {
    const initial = createDeferred();
    const refresh = createDeferred();
    const service = { id: "service-1", barberId: "barber-1", active: true, price: 1000 };
    mockServiceRequests([initial, refresh]);

    renderPage(
      { barber: { id: "barber-1", depositSettings: { enabled: false } } },
      {
        client: { name: "Client", phone: "+37477123456", note: "" },
        currentUser: { id: "client-1", role: "client" },
        services: [service],
        selectedServiceId: service.id,
        selectedTime: "10:00",
      }
    );

    await resolveInitialServices(initial, [service]);
    act(() => {
      screen.getByRole("button", { name: "Start confirmation" }).click();
    });

    expect(screen.getByTestId("services-loading")).toHaveTextContent("true");
    expect(screen.getByTestId("selected-service-id")).toHaveTextContent(service.id);
    expect(screen.getByTestId("confirmation-preparing")).toHaveTextContent("true");

    await act(async () => {
      refresh.resolve({ data: [service] });
      await refresh.promise;
    });

    expect(api.post).toHaveBeenCalledWith(
      "/bookings/quote",
      expect.objectContaining({ barberId: "barber-1", serviceId: service.id }),
      expect.any(Object)
    );
    expect(screen.getByTestId("confirmation-open")).toHaveTextContent("true");
  });

  it("fails closed when the refreshed service is no longer available", async () => {
    const initial = createDeferred();
    const refresh = createDeferred();
    const service = { id: "service-1", barberId: "barber-1", active: true, price: 1000 };
    mockServiceRequests([initial, refresh]);
    vi.mocked(api.post).mockClear();

    renderPage(
      { barber: { id: "barber-1", depositSettings: { enabled: false } } },
      {
        client: { name: "Client", phone: "+37477123456", note: "" },
        currentUser: { id: "client-1", role: "client" },
        services: [service],
        selectedServiceId: service.id,
        selectedTime: "10:00",
      }
    );

    await resolveInitialServices(initial, [service]);
    act(() => {
      screen.getByRole("button", { name: "Start confirmation" }).click();
    });

    await act(async () => {
      refresh.resolve({ data: [] });
      await refresh.promise;
    });

    expect(api.post).not.toHaveBeenCalled();
    expect(mocks.confirmationSetStep).toHaveBeenCalledWith(2);
    expect(screen.getByTestId("confirmation-open")).toHaveTextContent("false");
  });

  it("keeps a newer manual service refresh when the initial request resolves late", async () => {
    const initial = createDeferred();
    const refresh = createDeferred();
    mockServiceRequests([initial, refresh]);
    const props = createHookProps();
    const { result } = renderHook(() => useBookingPageData(props));

    let refreshPromise;
    act(() => {
      refreshPromise = result.current.refreshServices();
    });
    await act(async () => {
      refresh.resolve({ data: [{ id: "fresh-service" }] });
      await refreshPromise;
    });

    await resolveInitialServices(initial, [{ id: "stale-service" }]);

    expect(dispatchedServices()).toEqual([[{ id: "fresh-service" }]]);
    expect(result.current.isServicesLoading).toBe(false);
  });

  it("keeps the newest manual refresh loading state and result", async () => {
    const initial = createDeferred();
    const firstRefresh = createDeferred();
    const secondRefresh = createDeferred();
    mockServiceRequests([initial, firstRefresh, secondRefresh]);
    const props = createHookProps();
    const { result } = renderHook(() => useBookingPageData(props));

    let firstPromise;
    let secondPromise;
    act(() => {
      firstPromise = result.current.refreshServices();
      secondPromise = result.current.refreshServices();
    });

    await act(async () => {
      firstRefresh.resolve({ data: [{ id: "older-refresh" }] });
      await firstPromise;
    });
    expect(result.current.isServicesLoading).toBe(true);

    await act(async () => {
      secondRefresh.resolve({ data: [{ id: "newest-refresh" }] });
      await secondPromise;
    });
    await resolveInitialServices(initial, [{ id: "stale-initial" }]);

    expect(dispatchedServices()).toEqual([[{ id: "newest-refresh" }]]);
    expect(result.current.isServicesLoading).toBe(false);
  });

  it("ignores a stale initial service failure after a newer successful refresh", async () => {
    const initial = createDeferred();
    const refresh = createDeferred();
    mockServiceRequests([initial, refresh]);
    const props = createHookProps();
    const { result } = renderHook(() => useBookingPageData(props));

    let refreshPromise;
    act(() => {
      refreshPromise = result.current.refreshServices();
    });
    await act(async () => {
      refresh.resolve({ data: [{ id: "fresh-service" }] });
      await refreshPromise;
    });
    await act(async () => {
      initial.reject({ response: { data: { message: "Stale service failure" } } });
      await initial.promise.catch(() => {});
    });

    expect(result.current.error).toBe("");
    expect(props.setSelectedServiceId).not.toHaveBeenCalled();
    expect(props.setSelectedTime).not.toHaveBeenCalled();
    expect(dispatchedServices()).toEqual([[{ id: "fresh-service" }]]);
  });

  it("ignores an older manual refresh failure after a newer refresh succeeds", async () => {
    const initial = createDeferred();
    const firstRefresh = createDeferred();
    const secondRefresh = createDeferred();
    mockServiceRequests([initial, firstRefresh, secondRefresh]);
    const props = createHookProps();
    const { result } = renderHook(() => useBookingPageData(props));

    await resolveInitialServices(initial);
    mocks.dispatch.mockClear();

    let firstPromise;
    let secondPromise;
    act(() => {
      firstPromise = result.current.refreshServices().catch(() => {});
      secondPromise = result.current.refreshServices();
    });
    await act(async () => {
      secondRefresh.resolve({ data: [{ id: "newest-refresh" }] });
      await secondPromise;
    });
    await act(async () => {
      firstRefresh.reject({ response: { data: { message: "Stale refresh failure" } } });
      await firstPromise;
    });

    expect(result.current.error).toBe("");
    expect(dispatchedServices()).toEqual([[{ id: "newest-refresh" }]]);
    expect(result.current.isServicesLoading).toBe(false);
  });

  it("invalidates a manual refresh when the barber or salon context changes", async () => {
    const initial = createDeferred();
    const staleRefresh = createDeferred();
    const nextContext = createDeferred();
    mockServiceRequests([initial, staleRefresh, nextContext]);
    const props = createHookProps();
    const { result, rerender } = renderHook(
      ({ hookProps }) => useBookingPageData(hookProps),
      { initialProps: { hookProps: props } }
    );

    let staleRefreshPromise;
    act(() => {
      staleRefreshPromise = result.current.refreshServices();
    });
    rerender({
      hookProps: {
        ...props,
        activeSelectedSalonId: "salon-8",
        barberId: "barber-2",
      },
    });

    await resolveInitialServices(nextContext, [{ id: "new-context-service" }]);
    await act(async () => {
      staleRefresh.resolve({ data: [{ id: "stale-context-service" }] });
      await staleRefreshPromise;
    });
    await resolveInitialServices(initial, [{ id: "stale-initial-service" }]);

    expect(dispatchedServices()).toEqual([[{ id: "new-context-service" }]]);
    expect(result.current.isServicesLoading).toBe(false);
  });

  it("does not update services after unmounting with a manual refresh pending", async () => {
    const initial = createDeferred();
    const refresh = createDeferred();
    mockServiceRequests([initial, refresh]);
    const props = createHookProps();
    const { result, unmount } = renderHook(() => useBookingPageData(props));

    let refreshPromise;
    act(() => {
      refreshPromise = result.current.refreshServices();
    });
    unmount();

    await act(async () => {
      refresh.resolve({ data: [{ id: "post-unmount-service" }] });
      await refreshPromise;
    });
    await resolveInitialServices(initial, [{ id: "post-unmount-initial" }]);

    expect(dispatchedServices()).toEqual([]);
  });
});
