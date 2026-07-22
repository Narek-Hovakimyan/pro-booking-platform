import { useEffect, useState } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { renderWithProviders } from "@/test/renderWithProviders";
import ClientBooking from "./ClientBooking";
import api from "@/shared/api/axios";
import { useBooking } from "@/shared/hooks/useBooking";

vi.mock("@/shared/api/axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@/shared/hooks/useBooking", () => ({
  useBooking: vi.fn(),
}));

vi.mock("@/client/components/booking/ClientDetailsStep", () => ({
  default: function ClientDetailsStepMock({ canConfirm, onContinue }) {
    return (
      <button disabled={!canConfirm} onClick={onContinue} type="button">
        Prepare booking confirmation
      </button>
    );
  },
}));

vi.mock("@/client/components/booking/BookingConfirmationModal", () => ({
  default: function BookingConfirmationModalMock({
    isOpen,
    canConfirm,
    isQuoteLoading,
    onConfirm,
    pricingQuote,
  }) {
    if (!isOpen) return null;

    return (
      <section aria-label="booking confirmation modal">
        <div>{canConfirm ? "Ready to confirm" : "Waiting for quote"}</div>
        <div>{isQuoteLoading ? "Quote loading" : "Quote ready"}</div>
        {pricingQuote ? <div>Quote total: {pricingQuote.finalPrice}</div> : null}
        <button disabled={!canConfirm} onClick={onConfirm} type="button">
          Confirm booking
        </button>
      </section>
    );
  },
}));

const BARBER_ID = "64b64cfa12ab34cd56ef7890";
const CLIENT_ID = "64b64cfa12ab34cd56ef7899";
const SERVICE_ID = "64b64cfa12ab34cd56ef7888";
const PRIMARY_SALON_ID = "64b64cfa12ab34cd56ef7891";
const EXPLICIT_SALON_ID = "64b64cfa12ab34cd56ef7892";
const BOOKING_DATE = "2026-07-27";
const DAY_KEY = "mon";
const BOOKING_TIME = "10:30";
const CLIENT_NOTE = "Please leave the fringe a little longer.";

const quoteResponse = {
  finalPrice: 12000,
  originalPrice: 12000,
  depositAmount: 0,
  discountAmount: 0,
};

const createdBooking = { _id: "booking-1", status: "pending", payment: null };
const baseService = {
  _id: SERVICE_ID,
  name: "Precision Cut",
  duration: 45,
  price: 12000,
  active: true,
};

const baseBarber = {
  _id: BARBER_ID,
  name: "Alex Barber",
  primarySalon: { _id: PRIMARY_SALON_ID, name: "Primary Studio" },
  approvedSalons: [
    { status: "approved", isPrimary: true, salon: { _id: PRIMARY_SALON_ID, name: "Primary Studio" } },
    { status: "approved", salon: { _id: EXPLICIT_SALON_ID, name: "Second Studio" } },
  ],
};

function buildProps(overrides = {}) {
  return {
    barber: baseBarber,
    step: 4,
    setStep: vi.fn(),
    services: [baseService],
    selectedService: baseService,
    selectedServiceId: SERVICE_ID,
    setSelectedServiceId: vi.fn(),
    selectedDayKey: DAY_KEY,
    setSelectedDayKey: vi.fn(),
    dateOptions: [{ value: BOOKING_DATE, label: "Mon, Jul 27", dayKey: DAY_KEY }],
    selectedDate: BOOKING_DATE,
    selectedDateLabel: "Mon, Jul 27",
    setSelectedDate: vi.fn(),
    nonWorkingDays: [],
    slotMessage: "No available slots",
    selectedTime: BOOKING_TIME,
    setSelectedTime: vi.fn(),
    availableSlots: [BOOKING_TIME],
    isSelectedTimeValid: true,
    isRebooking: false,
    client: { name: "Jamie Client", phone: "+37477123456", note: CLIENT_NOTE },
    currentUser: { id: CLIENT_ID, role: "client", name: "Jamie Client" },
    setClient: vi.fn(),
    selectedSalonId: undefined,
    onSalonSelect: vi.fn(),
    onPriceAdjustmentChange: undefined,
    isServiceDataLoading: false,
    onRefreshServices: vi.fn().mockResolvedValue([baseService]),
    ...overrides,
  };
}

function setupStrictMocks({ quoteResponses = [quoteResponse], createdBookings = [createdBooking] } = {}) {
  const createBookingMock = vi.fn();
  createdBookings.forEach((booking) => createBookingMock.mockResolvedValueOnce(booking));
  useBooking.mockReturnValue({ createBooking: createBookingMock });

  api.get.mockImplementation((url) => {
    if (url === `/vouchers/public/barber/${BARBER_ID}`) return Promise.resolve({ data: [] });
    throw new Error(`Unexpected api.get call: ${url}`);
  });

  api.post.mockImplementation((url, payload) => {
    if (url === "/bookings/quote") {
      const nextQuoteResponse = quoteResponses.shift() || quoteResponse;
      return Promise.resolve({ data: { ...nextQuoteResponse, echo: payload } });
    }
    throw new Error(`Unexpected api.post call: ${url}`);
  });

  return { createBookingMock };
}

function expectPayloadFields(payload, fields) {
  Object.entries(fields).forEach(([key, value]) => expect(payload[key]).toBe(value));
}

function expectQuotePayload(payload, salonId) {
  expectPayloadFields(payload, {
    barberId: BARBER_ID,
    serviceId: SERVICE_ID,
    bookingDate: BOOKING_DATE,
    dayKey: DAY_KEY,
    time: BOOKING_TIME,
  });
  if (salonId === undefined) expect(Object.hasOwn(payload, "salonId")).toBe(false);
  else expect(payload.salonId).toBe(salonId);
}

function expectCreatePayload(payload, salonId) {
  expectPayloadFields(payload, {
    barberId: BARBER_ID,
    clientId: CLIENT_ID,
    serviceId: SERVICE_ID,
    serviceName: "Precision Cut",
    duration: 45,
    bookingDate: BOOKING_DATE,
    dayKey: DAY_KEY,
    time: BOOKING_TIME,
    status: "pending",
    clientName: "Jamie Client",
    phone: "+37477123456",
    note: CLIENT_NOTE,
  });
  if (salonId === undefined) expect(Object.hasOwn(payload, "salonId")).toBe(false);
  else expect(payload.salonId).toBe(salonId);
}

async function prepareAndConfirmBooking(user, expectedQuoteTotal = quoteResponse.finalPrice) {
  await user.click(screen.getByRole("button", { name: "Prepare booking confirmation" }));
  expect(await screen.findByRole("region", { name: "booking confirmation modal" })).toBeVisible();
  await waitFor(() => expect(screen.getByText("Ready to confirm")).toBeVisible());
  expect(await screen.findByText(`Quote total: ${expectedQuoteTotal}`)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Confirm booking" }));
}

function renderBooking(ui, currentUser = buildProps().currentUser) {
  return renderWithProviders(ui, {
    initialEntries: ["/book"],
    preloadedState: {
      auth: { currentUser, token: "token", isAuthenticated: true },
    },
  });
}

function ControlledBookingHarness({ mountSpy }) {
  const [selectedSalonId, setSelectedSalonId] = useState(EXPLICIT_SALON_ID);
  useEffect(() => mountSpy(), [mountSpy]);

  return (
    <>
      <button onClick={() => setSelectedSalonId("   ")} type="button">
        Clear salon context
      </button>
      <ClientBooking {...buildProps({ selectedSalonId, onSalonSelect: setSelectedSalonId })} />
      <Routes>
        <Route path="/book" element={<div>Book marker</div>} />
        <Route path="/success" element={<div>Success marker</div>} />
      </Routes>
    </>
  );
}

async function completeFlow(props) {
  const user = userEvent.setup();
  const { createBookingMock } = setupStrictMocks();

  renderBooking(
    <Routes>
      <Route path="/book" element={<ClientBooking {...props} />} />
      <Route path="/success" element={<div>Success marker</div>} />
    </Routes>,
    props.currentUser
  );

  expect(createBookingMock).not.toHaveBeenCalled();
  await prepareAndConfirmBooking(user);
  await waitFor(() => expect(createBookingMock).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("Success marker")).toBeVisible();
  expect(api.post).not.toHaveBeenCalledWith("/bookings", expect.anything());

  return {
    quotePayload: api.post.mock.calls.find(([url]) => url === "/bookings/quote")?.[1],
    createPayload: createBookingMock.mock.calls[0]?.[0],
  };
}

afterEach(() => vi.clearAllMocks());

describe("ClientBooking salon context payloads", () => {
  it("omits salonId for independent booking without an explicit salon context", async () => {
    const { quotePayload, createPayload } = await completeFlow(buildProps({ selectedSalonId: undefined }));
    expectQuotePayload(quotePayload);
    expectCreatePayload(createPayload);
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only string", "   "],
    ["malformed string", "salon-123"],
    ["23-char hex string", "64b64cfa12ab34cd56ef789"],
    ["25-char hex string", "64b64cfa12ab34cd56ef78910"],
    ["non-hex string", "64b64cfa12ab34cd56ef789g"],
    ["numeric value", 123456789],
    ["object value", { salonId: EXPLICIT_SALON_ID }],
  ])("omits salonId for %s context", async (_label, selectedSalonId) => {
    const { quotePayload, createPayload } = await completeFlow(buildProps({ selectedSalonId }));
    expectQuotePayload(quotePayload);
    expectCreatePayload(createPayload);
  });

  it("includes the explicit canonical salonId when a valid salon context is selected", async () => {
    const { quotePayload, createPayload } = await completeFlow(buildProps({ selectedSalonId: EXPLICIT_SALON_ID }));
    expectQuotePayload(quotePayload, EXPLICIT_SALON_ID);
    expectCreatePayload(createPayload, EXPLICIT_SALON_ID);
  });

  it("trims surrounding whitespace from a valid selected salonId", async () => {
    const rawSalonId = `  ${EXPLICIT_SALON_ID}  `;
    const { quotePayload, createPayload } = await completeFlow(buildProps({ selectedSalonId: rawSalonId }));
    expectQuotePayload(quotePayload, EXPLICIT_SALON_ID);
    expectCreatePayload(createPayload, EXPLICIT_SALON_ID);
    expect(quotePayload.salonId).not.toBe(rawSalonId);
    expect(createPayload.salonId).not.toBe(rawSalonId);
  });

  it("does not retain a prior valid salonId after changing mounted controlled salon context to invalid", async () => {
    const user = userEvent.setup();
    const mountSpy = vi.fn();
    const { createBookingMock } = setupStrictMocks({
      quoteResponses: [
        { ...quoteResponse, finalPrice: 12000 },
        { ...quoteResponse, finalPrice: 9000 },
      ],
      createdBookings: [
        { ...createdBooking, _id: "booking-1" },
        { ...createdBooking, _id: "booking-2" },
      ],
    });

    renderBooking(<ControlledBookingHarness mountSpy={mountSpy} />);

    expect(await screen.findByText("Book marker")).toBeVisible();
    await waitFor(() => expect(mountSpy).toHaveBeenCalledTimes(1));

    await prepareAndConfirmBooking(user, 12000);
    await waitFor(() => expect(createBookingMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Success marker")).toBeVisible();

    const firstQuotePayload = api.post.mock.calls[0]?.[1];
    const firstCreatePayload = createBookingMock.mock.calls[0]?.[0];
    expect(firstQuotePayload).toEqual({
      barberId: BARBER_ID,
      serviceId: SERVICE_ID,
      bookingDate: BOOKING_DATE, dayKey: DAY_KEY, time: BOOKING_TIME,
      voucherCode: undefined,
      salonId: EXPLICIT_SALON_ID,
    });
    expect(firstCreatePayload).toEqual({
      barberId: BARBER_ID,
      clientId: CLIENT_ID,
      serviceId: SERVICE_ID,
      serviceName: "Precision Cut",
      duration: 45, dayKey: DAY_KEY, bookingDate: BOOKING_DATE, time: BOOKING_TIME,
      status: "pending",
      clientName: "Jamie Client",
      phone: "+37477123456",
      note: CLIENT_NOTE,
      salonId: EXPLICIT_SALON_ID,
    });
    const firstQuoteSnapshot = { ...firstQuotePayload };
    const firstCreateSnapshot = { ...firstCreatePayload };

    await user.click(screen.getByRole("button", { name: "Clear salon context" }));
    await prepareAndConfirmBooking(user, 9000);
    await waitFor(() => expect(createBookingMock).toHaveBeenCalledTimes(2));

    const secondQuotePayload = api.post.mock.calls[1]?.[1];
    const secondCreatePayload = createBookingMock.mock.calls[1]?.[0];

    expect(await screen.findByText("Success marker")).toBeVisible();
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(createBookingMock).toHaveBeenCalledTimes(2);
    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(secondQuotePayload).not.toBe(firstQuotePayload);
    expect(secondCreatePayload).not.toBe(firstCreatePayload);
    expectQuotePayload(secondQuotePayload);
    expectCreatePayload(secondCreatePayload);
    expect(secondQuotePayload.salonId).not.toBe(EXPLICIT_SALON_ID);
    expect(secondCreatePayload.salonId).not.toBe(EXPLICIT_SALON_ID);
    expect(firstQuotePayload).toEqual(firstQuoteSnapshot);
    expect(firstCreatePayload).toEqual(firstCreateSnapshot);
    expect(firstQuotePayload.salonId).toBe(EXPLICIT_SALON_ID);
    expect(firstCreatePayload.salonId).toBe(EXPLICIT_SALON_ID);
  });
});
