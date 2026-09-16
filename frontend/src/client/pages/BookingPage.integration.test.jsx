import { useCallback, useContext, useEffect } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSelector } from "react-redux";
import { Routes, Route, UNSAFE_NavigationContext } from "react-router-dom";

import { renderWithProviders } from "@/test/renderWithProviders";
import { useBookingFlow } from "@/shared/hooks/useBookingFlow";
import BookingPage from "./BookingPage";
import SuccessPage from "./SuccessPage";
import api from "@/shared/api/axios";

vi.mock("@/shared/api/axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const BARBER_ID = "64b64cfa12ab34cd56ef7890";
const CLIENT_ID = "64b64cfa12ab34cd56ef7899";
const SALON_ID = "64b64cfa12ab34cd56ef7892";
const SERVICE_ID = "64b64cfa12ab34cd56ef7888";
const BOOKING_DATE = "2030-01-07";
const BOOKING_TIME = "10:00";

const service = {
  _id: SERVICE_ID,
  barberId: BARBER_ID,
  name: "Precision Cut",
  duration: 30,
  price: 12000,
  active: true,
};

const createdBooking = {
  _id: "booking-1",
  barberId: BARBER_ID,
  clientId: CLIENT_ID,
  salonId: SALON_ID,
  serviceName: service.name,
  bookingDate: BOOKING_DATE,
  dayKey: "mon",
  time: BOOKING_TIME,
  duration: service.duration,
  finalPrice: service.price,
  status: "pending",
};

const weeklySchedule = Object.fromEntries(
  ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((dayKey) => [
    dayKey,
    { working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" },
  ])
);

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

function NavigationRecorder({ events }) {
  const { navigator } = useContext(UNSAFE_NavigationContext);

  useEffect(() => {
    const push = navigator.push;
    const pushSpy = vi.spyOn(navigator, "push").mockImplementation((...args) => {
      events.push("navigate");
      return push(...args);
    });

    return () => pushSpy.mockRestore();
  }, [events, navigator]);

  return null;
}

function BookingFlowHost({ events }) {
  const services = useSelector((state) => state.services);
  const bookings = useSelector((state) => state.bookings);
  const schedule = useSelector((state) => state.schedule);
  const currentUser = useSelector((state) => state.auth.currentUser);
  const bookingFlow = useBookingFlow({ currentUser, currentUserRole: currentUser.role });
  const resetBooking = useCallback(() => {
    events.push("reset");
    bookingFlow.resetBooking();
  }, [bookingFlow, events]);

  return (
    <>
      <NavigationRecorder events={events} />
      <Routes>
        <Route
          path="/booking/:barberId"
          element={
            <BookingPage
              step={bookingFlow.step}
              setStep={bookingFlow.setStep}
              services={services}
              selectedServiceId={bookingFlow.selectedServiceId}
              setSelectedServiceId={bookingFlow.setSelectedServiceId}
              selectedDayKey={bookingFlow.selectedDayKey}
              setSelectedDayKey={bookingFlow.setSelectedDayKey}
              selectedTime={bookingFlow.selectedTime}
              setSelectedTime={bookingFlow.setSelectedTime}
              client={bookingFlow.bookingClient}
              currentUser={currentUser}
              bookings={bookings}
              schedule={schedule}
              setClient={bookingFlow.setClient}
            />
          }
        />
        <Route
          path="/success"
          element={<SuccessPage client={bookingFlow.bookingClient} resetBooking={resetBooking} />}
        />
      </Routes>
    </>
  );
}

describe("BookingPage successful booking integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("completes salon-scoped confirmation before immediate reconciliation", async () => {
    const initialServices = createDeferred();
    const refreshServices = createDeferred();
    const events = [];
    const bootstrapTimers = [];
    let serviceRequestCount = 0;
    let barberBookingRequestCount = 0;
    const setTimeoutSpy = vi.spyOn(window, "setTimeout").mockImplementation((callback, _delay, ...args) => {
      bootstrapTimers.push(() => callback(...args));
      return bootstrapTimers.length;
    });

    api.get.mockImplementation((url) => {
      if (url === `/services/${BARBER_ID}?salonId=${SALON_ID}`) {
        serviceRequestCount += 1;
        return serviceRequestCount === 1
          ? initialServices.promise
          : refreshServices.promise;
      }
      if (url === `/schedules/${BARBER_ID}/${SALON_ID}`) {
        return Promise.resolve({
          data: { weeklySchedule, nonWorkingDays: [], defaultSchedule: { startTime: "09:00", endTime: "18:00" } },
        });
      }
      if (url === `/bookings/barber/${BARBER_ID}`) {
        barberBookingRequestCount += 1;
        if (barberBookingRequestCount > 1) events.push("barber-reconcile-request");
        return Promise.resolve({ data: barberBookingRequestCount === 1 ? [] : [createdBooking] });
      }
      if (url === `/bookings/client/${CLIENT_ID}`) {
        events.push("client-reconcile-request");
        return Promise.resolve({ data: [createdBooking] });
      }
      if (url.startsWith(`/vouchers/public/barber/${BARBER_ID}?`)) {
        return Promise.resolve({ data: [] });
      }
      throw new Error(`Unexpected GET ${url}`);
    });
    api.post.mockImplementation((url) => {
      if (url === "/bookings/quote") {
        return Promise.resolve({
          data: { finalPrice: 12000, originalPrice: 12000, depositAmount: 0, discountAmount: 0 },
        });
      }
      if (url === "/bookings") return Promise.resolve({ data: createdBooking });
      throw new Error(`Unexpected POST ${url}`);
    });

    const { store } = renderWithProviders(<BookingFlowHost events={events} />, {
      initialEntries: [`/booking/${BARBER_ID}?salonId=${SALON_ID}`],
      preloadedState: {
        auth: {
          currentUser: { id: CLIENT_ID, role: "client", name: "Jamie Client", phone: "+37477123456" },
          token: "token",
          isAuthenticated: true,
        },
        users: [{
          _id: BARBER_ID,
          role: "barber",
          name: "Alex Barber",
          depositSettings: { enabled: false },
          approvedSalons: [{ status: "approved", salon: { _id: SALON_ID, name: "Approved Studio" } }],
        }],
      },
    });
    const unsubscribe = store.subscribe(() => {
      if (store.getState().bookings.some((booking) => booking.id === createdBooking._id)) {
        events.push("reconcile");
      }
    });

    expect(serviceRequestCount).toBe(1);
    act(() => bootstrapTimers.splice(0).forEach((runTimer) => runTimer()));
    setTimeoutSpy.mockRestore();
    await act(async () => {
      initialServices.resolve({ data: [service] });
      await initialServices.promise;
    });

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Precision Cut/ }));
    await user.click(screen.getByRole("button", { name: "Շարունակել" }));
    fireEvent.change(screen.getByLabelText("Other date"), { target: { value: BOOKING_DATE } });
    await user.click(await screen.findByRole("button", { name: BOOKING_TIME }));
    const continueToDetails = screen.getByRole("button", { name: "Շարունակել" });
    await waitFor(() => expect(continueToDetails).toBeEnabled());
    await user.click(continueToDetails);
    await user.click(screen.getByRole("button", { name: "Հաստատել ամրագրումը" }));

    await waitFor(() => expect(serviceRequestCount).toBe(2));
    expect(screen.getByRole("button", { name: "Refreshing price..." })).toBeDisabled();

    await act(async () => {
      refreshServices.resolve({ data: [service] });
      await refreshServices.promise;
    });

    const confirmation = await screen.findByRole("dialog", { name: "Confirm booking" });
    await user.click(within(confirmation).getByRole("button", { name: "Confirm booking" }));

    expect(await screen.findByRole("heading", { name: "Ամրագրման հարցումը ուղարկված է" })).toBeVisible();
    await waitFor(() => expect(events).toContain("reconcile"));

    const quoteCall = api.post.mock.calls.find(([url]) => url === "/bookings/quote");
    const createCalls = api.post.mock.calls.filter(([url]) => url === "/bookings");
    expect(quoteCall?.[1]).toEqual(expect.objectContaining({ salonId: SALON_ID }));
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0][1]).toEqual(expect.objectContaining({ salonId: SALON_ID }));
    expect(createCalls[0][1]).not.toHaveProperty("idempotencyKey");
    expect(createCalls[0][2]).toEqual({
      headers: { "Idempotency-Key": expect.any(String) },
    });
    expect(api.get).toHaveBeenCalledWith(`/bookings/client/${CLIENT_ID}`);
    expect(api.get).toHaveBeenCalledWith(`/bookings/barber/${BARBER_ID}`);
    expect(barberBookingRequestCount).toBe(2);
    expect(events.indexOf("reset")).toBeLessThan(events.indexOf("reconcile"));
    expect(events.indexOf("navigate")).toBeLessThan(events.indexOf("reconcile"));
    expect(events.indexOf("reset")).toBeLessThan(events.indexOf("client-reconcile-request"));
    expect(events.indexOf("navigate")).toBeLessThan(events.indexOf("client-reconcile-request"));
    expect(events.indexOf("reset")).toBeLessThan(events.indexOf("barber-reconcile-request"));
    expect(events.indexOf("navigate")).toBeLessThan(events.indexOf("barber-reconcile-request"));
    expect(screen.queryByRole("dialog", { name: "Confirm booking" })).not.toBeInTheDocument();
    unsubscribe();
  });
});
