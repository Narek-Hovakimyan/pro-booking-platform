import { useEffect, useState } from "react";
import { readFileSync } from "node:fs";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { renderWithProviders } from "@/test/renderWithProviders";
import ClientBooking from "./ClientBooking";
import ClientBookingStepContent from "@/client/components/booking/ClientBookingStepContent";
import api from "@/shared/api/axios";
import { useBooking } from "@/shared/hooks/useBooking";

vi.mock("@/shared/api/axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@/shared/hooks/useBooking", () => ({
  useBooking: vi.fn(),
}));

vi.mock("@/client/components/booking/ClientDetailsStep", () => ({
  default: function ClientDetailsStepMock({
    canConfirm,
    consultation,
    error,
    onChange,
    onConsentChange,
    onConsultationChange,
    onContinue,
    onReferenceFilesChange,
    referenceFiles,
    rebookSummary,
  }) {
    return (
      <section aria-label="client details step">
        {error ? <p role="alert">{error}</p> : null}
        {rebookSummary}
        <button
          onClick={() =>
            onChange?.({ name: "Jamie Client", phone: "+37477123456", note: "Updated note" })
          }
          type="button"
        >
          Set client details
        </button>
        <button
          onClick={() => onConsultationChange?.({ hairType: "curly", notes: "client-safe" })}
          type="button"
        >
          Set consultation
        </button>
        <button
          onClick={() => onConsentChange?.({ accepted: true, textVersion: "v1.0" })}
          type="button"
        >
          Accept consent
        </button>
        <button
          onClick={() =>
            onReferenceFilesChange?.([
              new File(["reference"], "reference.jpg", { type: "image/jpeg" }),
            ])
          }
          type="button"
        >
          Add reference image
        </button>
        <div data-testid="reference-count">{referenceFiles.length}</div>
        <div data-testid="consultation-state">{consultation ? "set" : "unset"}</div>
        <button disabled={!canConfirm} onClick={onContinue} type="button">
          Prepare booking confirmation
        </button>
      </section>
    );
  },
}));

vi.mock("@/client/components/booking/BookingConfirmationModal", () => ({
  default: function BookingConfirmationModalMock({
    isOpen,
    canConfirm,
    error,
    onClose,
    isQuoteLoading,
    onConfirm,
    pricingQuote,
    quoteError,
  }) {
    if (!isOpen) return null;

    return (
      <section aria-label="booking confirmation modal">
        {error ? <p role="alert">{error}</p> : null}
        {quoteError ? <p role="alert">{quoteError}</p> : null}
        <div>{canConfirm ? "Ready to confirm" : "Waiting for quote"}</div>
        <div>{isQuoteLoading ? "Quote loading" : "Quote ready"}</div>
        {pricingQuote ? <div>Quote total: {pricingQuote.finalPrice}</div> : null}
        <button onClick={onClose} type="button">
          Close modal
        </button>
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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
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

function buildStepContentProps(overrides = {}) {
  return {
    barber: baseBarber,
    step: 4,
    services: [baseService],
    selectedService: baseService,
    selectedServiceId: SERVICE_ID,
    onSelectService: vi.fn(),
    selectedDate: BOOKING_DATE,
    selectedDateLabel: "Mon, Jul 27",
    onSelectDate: vi.fn(),
    onSelectCustomDate: vi.fn(),
    selectedTime: BOOKING_TIME,
    onSelectTime: vi.fn(),
    availableSlots: [BOOKING_TIME],
    isSelectedTimeValid: true,
    isRebooking: false,
    client: { name: "Jamie Client", phone: "+37477123456", note: CLIENT_NOTE },
    onClientChange: vi.fn(),
    bookingState: {
      error: "",
      isSaving: false,
      referenceFiles: [],
      consultation: null,
      consent: null,
      voucherCode: "",
      showWaitlistForm: false,
      waitlistSuccess: false,
      setError: vi.fn(),
      setReferenceFiles: vi.fn(),
      setConsultation: vi.fn(),
      setConsent: vi.fn(),
      setShowWaitlistForm: vi.fn(),
      setWaitlistSuccess: vi.fn(),
    },
    salon: {
      approvedSalons: baseBarber.approvedSalons,
      dateOptions: [{ value: BOOKING_DATE, label: "Mon, Jul 27", dayKey: DAY_KEY }],
      handleContinueAfterService: vi.fn(),
      hasMultipleSalons: true,
      selectedBookingSalonId: PRIMARY_SALON_ID,
      selectedSalonName: "Primary Studio",
      salonSelectorOpen: false,
    },
    confirmation: {
      bookingQuote: quoteResponse,
      canPrepareConfirmation: true,
      canRenderConfirmationModal: true,
      canSubmitConfirmation: true,
      clearBookingQuote: vi.fn(),
      closeConfirmation: vi.fn(),
      confirmDisabledReason: "",
      confirmationService: baseService,
      isPreparingConfirmation: false,
      isQuoteLoading: false,
      openConfirmation: vi.fn(),
      quoteError: "",
      resetConfirmationFlow: vi.fn(),
      setConfirmationService: vi.fn(),
      setQuoteError: vi.fn(),
      setShowConfirmation: vi.fn(),
      showConfirmation: true,
    },
    voucher: {
      discountPreview: 0,
      publicVouchers: [],
      removeVoucher: vi.fn(),
      voucherCodeChange: vi.fn(),
      voucherError: "",
      voucherLoading: false,
      voucherPreview: null,
    },
    todayKey: BOOKING_DATE,
    nonWorkingDays: [],
    slotMessage: "No available slots",
    onContinueToClientDetails: vi.fn(),
    onOpenConfirmation: vi.fn(),
    onBackToServiceSelection: vi.fn(),
    onChangeService: vi.fn(),
    onCancelSalonSelector: vi.fn(),
    onOpenWaitlistForm: vi.fn(),
    onCloseWaitlistForm: vi.fn(),
    onWaitlistSuccess: vi.fn(),
    onResetBookingFlow: vi.fn(),
    onConfirmBooking: vi.fn(),
    selectedServicePriceInfo: {
      hasDiscount: false,
      originalPrice: 12000,
      discountedPrice: 12000,
    },
    canPrepareConfirmation: true,
    isServiceDataLoading: false,
    ...overrides,
  };
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

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

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

describe("ClientBooking split boundaries", () => {
  it("uses Armenia today for the date minimum and custom-date selection", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T20:15:00.000Z"));
    setupStrictMocks();
    const props = buildProps({
      step: 3,
      selectedDate: "2026-02-01",
      selectedDayKey: "sun",
      dateOptions: [{ value: "2026-02-01", label: "Sun, Feb 1", dayKey: "sun" }],
    });

    renderBooking(<ClientBooking {...props} />);

    const dateInput = screen.getByLabelText("Or pick a custom date");
    expect(dateInput).toHaveAttribute("min", "2026-02-01");

    fireEvent.change(dateInput, { target: { value: "2026-01-31" } });
    expect(props.setSelectedDate).not.toHaveBeenCalled();

    fireEvent.change(dateInput, { target: { value: "2026-02-02" } });
    expect(props.setSelectedDate).toHaveBeenCalledWith("2026-02-02");
    expect(props.setSelectedDayKey).toHaveBeenCalledWith("mon");
  });

  it("keeps confirmation unavailable while service data is loading", async () => {
    const user = userEvent.setup();
    const props = buildProps({ isServiceDataLoading: true, step: 4 });

    renderBooking(
      <Routes>
        <Route path="/book" element={<ClientBooking {...props} />} />
      </Routes>
    );

    expect(
      screen.getByRole("button", { name: "Prepare booking confirmation" })
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Prepare booking confirmation" }));
    expect(screen.queryByRole("region", { name: "booking confirmation modal" })).not.toBeInTheDocument();
    expect(props.setStep).not.toHaveBeenCalledWith(4);
  });

  it("resets to the service-selection step when no active services remain", async () => {
    const inactiveService = { ...baseService, active: false };
    const props = buildProps({
      services: [inactiveService],
      selectedService: inactiveService,
      selectedServiceId: SERVICE_ID,
      step: 4,
    });

    renderBooking(
      <Routes>
        <Route path="/book" element={<ClientBooking {...props} />} />
      </Routes>
    );

    await waitFor(() => expect(props.setStep).toHaveBeenCalledWith(2));
    expect(props.setSelectedServiceId).toHaveBeenCalledWith(null);
    expect(props.setSelectedTime).toHaveBeenCalledWith("");
  });

  it("clears date, day, and time when changing the service in rebook mode", async () => {
    const user = userEvent.setup();
    const props = buildProps({
      isRebooking: true,
      step: 3,
      selectedDate: BOOKING_DATE,
      selectedDateLabel: "Mon, Jul 27",
      selectedDayKey: DAY_KEY,
      selectedTime: BOOKING_TIME,
    });

    renderBooking(
      <Routes>
        <Route path="/book" element={<ClientBooking {...props} />} />
      </Routes>
    );

    await user.click(screen.getByRole("button", { name: "Change service" }));
    expect(props.setStep).toHaveBeenCalledWith(2);
    expect(props.setSelectedDate).toHaveBeenCalledWith("");
    expect(props.setSelectedDayKey).toHaveBeenCalledWith("");
    expect(props.setSelectedTime).toHaveBeenCalledWith("");
  });

  it("keeps the payload utility free of React and UI imports", () => {
    const source = readFileSync("src/client/utils/clientBookingPayload.js", "utf8");

    expect(source).not.toMatch(/from\s+["']react["']/);
    expect(source).not.toMatch(/from\s+["']@\/shared\/components\/ui\/button["']/);
    expect(source).not.toMatch(/<Button|<Card|<ServiceStep|<ClientDetailsStep|<BookingConfirmationModal|<WaitlistForm/);
  });

  it("preserves the extracted step content flow", () => {
    const stepThree = renderWithProviders(
      <ClientBookingStepContent {...buildStepContentProps({ step: 3 })} />
    );
    expect(screen.getByText(/Booking at/i)).toBeVisible();
    expect(screen.getByText("Ընտրիր օրը և ժամը")).toBeVisible();
    expect(screen.queryByRole("region", { name: "client details step" })).not.toBeInTheDocument();

    stepThree.rerender(<ClientBookingStepContent {...buildStepContentProps()} />);
    expect(screen.getByRole("region", { name: "client details step" })).toBeVisible();
    expect(screen.getByRole("region", { name: "booking confirmation modal" })).toBeVisible();
    expect(screen.getByText("Quote total: 12000")).toBeVisible();
  });

  it("preserves the original Card and CardContent wrapper structure", () => {
    const { container } = renderWithProviders(
      <ClientBookingStepContent {...buildStepContentProps({ step: 3 })} />
    );
    const card = container.firstElementChild;
    const content = card?.firstElementChild;

    expect(card).toHaveClass("rounded-2xl", "shadow-card", "sm:rounded-3xl");
    expect(card).toHaveClass("border", "bg-white");
    expect(content).toHaveClass("p-4", "sm:p-6");
    expect(screen.getByText("Ընտրիր օրը և ժամը")).toBeVisible();
  });

  it("closes only the salon selector when its Cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancelSalonSelector = vi.fn();
    const onCloseWaitlistForm = vi.fn();

    renderWithProviders(
      <ClientBookingStepContent
        {...buildStepContentProps({
          onCancelSalonSelector,
          onCloseWaitlistForm,
          salon: {
            ...buildStepContentProps().salon,
            salonSelectorOpen: true,
          },
        })}
      />
    );

    expect(screen.getByText("Choose a salon")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelSalonSelector).toHaveBeenCalledTimes(1);
    expect(onCloseWaitlistForm).not.toHaveBeenCalled();
  });
});

describe("ClientBooking booking flow", () => {
  it("submits real FormData with consultation JSON, consent JSON, and reference files", async () => {
    const user = userEvent.setup();
    const { useBooking: useActualBooking } = await vi.importActual("@/shared/hooks/useBooking");
    const referenceFile = new File(["reference"], "reference.jpg", { type: "image/jpeg" });

    api.post.mockResolvedValue({ data: createdBooking });
    api.get.mockResolvedValue({ data: [] });

    function SubmitWithActualHook() {
      const { createBooking } = useActualBooking();

      return (
        <button
          type="button"
          onClick={() =>
            createBooking({
              barberId: BARBER_ID,
              clientId: CLIENT_ID,
              serviceId: SERVICE_ID,
              serviceName: "Precision Cut",
              duration: 45,
              dayKey: DAY_KEY,
              bookingDate: BOOKING_DATE,
              time: BOOKING_TIME,
              status: "pending",
              clientName: "Jamie Client",
              phone: "+37477123456",
              note: CLIENT_NOTE,
              consultation: { hairType: "curly", notes: "client-safe" },
              consent: { accepted: true, textVersion: "v1.0" },
              files: [referenceFile],
            })
          }
        >
          Submit multipart booking
        </button>
      );
    }

    renderWithProviders(<SubmitWithActualHook />);
    await user.click(screen.getByRole("button", { name: "Submit multipart booking" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/bookings",
      expect.any(FormData),
      { headers: { "Content-Type": "multipart/form-data" } }
    ));
    const formData = api.post.mock.calls.find(([url]) => url === "/bookings")?.[1];
    expect(JSON.parse(formData.get("consultation"))).toEqual({
      hairType: "curly",
      notes: "client-safe",
    });
    expect(JSON.parse(formData.get("consent"))).toEqual({
      accepted: true,
      textVersion: "v1.0",
    });
    expect(formData.getAll("referenceImages")).toEqual([referenceFile]);
  });

  it("serializes consultation, consent, and reference files into the booking payload", async () => {
    const user = userEvent.setup();
    const { createBookingMock } = setupStrictMocks();

    renderBooking(
      <Routes>
        <Route path="/book" element={<ClientBooking {...buildProps()} />} />
        <Route path="/success" element={<div>Success marker</div>} />
      </Routes>
    );

    await user.click(screen.getByRole("button", { name: "Set consultation" }));
    await user.click(screen.getByRole("button", { name: "Accept consent" }));
    await user.click(screen.getByRole("button", { name: "Add reference image" }));
    expect(screen.getByTestId("reference-count")).toHaveTextContent("1");

    await prepareAndConfirmBooking(user);
    await waitFor(() => expect(createBookingMock).toHaveBeenCalledTimes(1));

    const payload = createBookingMock.mock.calls[0]?.[0];
    expect(payload.consultation).toEqual({ hairType: "curly", notes: "client-safe" });
    expect(payload.consent).toEqual({ accepted: true, textVersion: "v1.0" });
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0]).toBeInstanceOf(File);
    expect(payload.files[0].name).toBe("reference.jpg");
    expect(await screen.findByText("Success marker")).toBeVisible();
  });

  it("shows a booking denial in the modal, keeps the dialog usable, and allows retry", async () => {
    const user = userEvent.setup();
    const denial = Object.assign(new Error("Denied"), {
      response: { data: { message: "You can create bookings only for yourself" } },
    });
    const createBookingMock = vi
      .fn()
      .mockRejectedValueOnce(denial)
      .mockResolvedValueOnce(createdBooking);
    useBooking.mockReturnValue({ createBooking: createBookingMock });
    api.get.mockResolvedValue({ data: [] });
    api.post.mockImplementation((url, payload) => {
      if (url === "/bookings/quote") {
        return Promise.resolve({ data: { ...quoteResponse, echo: payload } });
      }
      throw new Error(`Unexpected api.post call: ${url}`);
    });

    renderBooking(
      <Routes>
        <Route path="/book" element={<ClientBooking {...buildProps({ currentUser: { id: BARBER_ID, role: "barber" } })} />} />
        <Route path="/success" element={<div>Success marker</div>} />
      </Routes>,
      { id: BARBER_ID, role: "barber" }
    );

    await prepareAndConfirmBooking(user);
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((alert) =>
      alert.textContent === "You can create bookings only for yourself"
    )).toBe(true);
    await user.click(screen.getByRole("button", { name: "Confirm booking" }));
    await waitFor(() => expect(createBookingMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Success marker")).toBeVisible();
  });

  it("blocks duplicate submit clicks while the booking request is in flight", async () => {
    const user = userEvent.setup();
    const pendingBooking = createDeferred();
    const createBookingMock = vi.fn(() => pendingBooking.promise);
    useBooking.mockReturnValue({ createBooking: createBookingMock });
    api.get.mockResolvedValue({ data: [] });
    api.post.mockImplementation((url, payload) => {
      if (url === "/bookings/quote") {
        return Promise.resolve({ data: { ...quoteResponse, echo: payload } });
      }
      throw new Error(`Unexpected api.post call: ${url}`);
    });

    renderBooking(
      <Routes>
        <Route path="/book" element={<ClientBooking {...buildProps()} />} />
        <Route path="/success" element={<div>Success marker</div>} />
      </Routes>
    );

    await prepareAndConfirmBooking(user);
    const confirmButton = screen.getByRole("button", { name: "Confirm booking" });
    await user.click(confirmButton);
    await user.click(confirmButton);
    expect(createBookingMock).toHaveBeenCalledTimes(1);

    pendingBooking.resolve(createdBooking);
    expect(await screen.findByText("Success marker")).toBeVisible();
  });

  it("clears modal errors when the booking modal is closed", async () => {
    const user = userEvent.setup();
    const createBookingMock = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error("Denied"), {
        response: { data: { message: "You can create bookings only for yourself" } },
      })
    );
    useBooking.mockReturnValue({ createBooking: createBookingMock });
    api.get.mockResolvedValue({ data: [] });
    api.post.mockImplementation((url, payload) => {
      if (url === "/bookings/quote") {
        return Promise.resolve({ data: { ...quoteResponse, echo: payload } });
      }
      throw new Error(`Unexpected api.post call: ${url}`);
    });
    const setStep = vi.fn();

    renderBooking(
      <Routes>
        <Route
          path="/book"
          element={<ClientBooking {...buildProps({ setStep })} />}
        />
        <Route path="/success" element={<div>Success marker</div>} />
      </Routes>
    );

    await prepareAndConfirmBooking(user);
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((alert) =>
      alert.textContent === "You can create bookings only for yourself"
    )).toBe(true);
    await user.click(screen.getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "booking confirmation modal" })).not.toBeInTheDocument();
    expect(setStep).toHaveBeenCalledWith(2);
  });

  it("does not let a stale quote response overwrite a reset confirmation", async () => {
    const user = userEvent.setup();
    const pendingQuote = createDeferred();
    setupStrictMocks();
    api.post.mockImplementation((url) => {
      if (url === "/bookings/quote") {
        return pendingQuote.promise;
      }
      throw new Error(`Unexpected api.post call: ${url}`);
    });

    renderBooking(
      <Routes>
        <Route path="/book" element={<ClientBooking {...buildProps()} />} />
      </Routes>
    );

    await user.click(screen.getByRole("button", { name: "Prepare booking confirmation" }));
    expect(await screen.findByRole("region", { name: "booking confirmation modal" })).toBeVisible();
    expect(screen.getByText("Quote loading")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("region", { name: "booking confirmation modal" })).not.toBeInTheDocument();

    pendingQuote.resolve({ data: { ...quoteResponse, finalPrice: 99000 } });
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText("Quote total: 99000")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "booking confirmation modal" })).not.toBeInTheDocument();
  });

  it("ignores a late booking resolve after unmount", async () => {
    const user = userEvent.setup();
    const pendingBooking = createDeferred();
    const createBookingMock = vi.fn(() => pendingBooking.promise);
    useBooking.mockReturnValue({ createBooking: createBookingMock });
    api.get.mockResolvedValue({ data: [] });
    api.post.mockImplementation((url, payload) => {
      if (url === "/bookings/quote") {
        return Promise.resolve({ data: { ...quoteResponse, echo: payload } });
      }
      throw new Error(`Unexpected api.post call: ${url}`);
    });
    const setStep = vi.fn();
    const { unmount } = renderBooking(
      <Routes>
        <Route
          path="/book"
          element={<ClientBooking {...buildProps({ setStep })} />}
        />
        <Route path="/success" element={<div>Success marker</div>} />
      </Routes>
    );

    await prepareAndConfirmBooking(user);
    expect(createBookingMock).toHaveBeenCalledTimes(1);
    unmount();
    pendingBooking.resolve(createdBooking);
    await Promise.resolve();
    expect(setStep).not.toHaveBeenCalledWith(2);
  });

  it("ignores a late booking rejection after unmount without console noise", async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pendingBooking = createDeferred();
    const createBookingMock = vi.fn(() => pendingBooking.promise);
    useBooking.mockReturnValue({ createBooking: createBookingMock });
    api.get.mockResolvedValue({ data: [] });
    api.post.mockImplementation((url, payload) => {
      if (url === "/bookings/quote") {
        return Promise.resolve({ data: { ...quoteResponse, echo: payload } });
      }
      throw new Error(`Unexpected api.post call: ${url}`);
    });
    const setStep = vi.fn();
    const { unmount } = renderBooking(
      <Routes>
        <Route
          path="/book"
          element={<ClientBooking {...buildProps({ setStep })} />}
        />
        <Route path="/success" element={<div>Success marker</div>} />
      </Routes>
    );

    await prepareAndConfirmBooking(user);
    expect(createBookingMock).toHaveBeenCalledTimes(1);
    unmount();
    pendingBooking.reject(new Error("late failure"));
    await Promise.resolve();
    await Promise.resolve();
    expect(setStep).not.toHaveBeenCalledWith(2);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
