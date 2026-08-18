import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/renderWithProviders";
import api from "@/shared/api/axios";
import { getPublicSalonBooking } from "@/shared/api/publicSalonBooking";
import { useBooking } from "@/shared/hooks/useBooking";
import { formatDateKey } from "@/shared/utils/dates";

import SalonBookingSteps from "./salon-public-booking/SalonBookingSteps";
import SalonBookingSummary from "./salon-public-booking/SalonBookingSummary";
import { useSalonBookingAvailability } from "./salon-public-booking/useSalonBookingAvailability";
import { useSalonBookingSubmission } from "./salon-public-booking/useSalonBookingSubmission";
import { useSalonPublicBookingData } from "./salon-public-booking/useSalonPublicBookingData";

vi.mock("@/shared/api/axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("@/shared/api/publicSalonBooking", () => ({
  getPublicSalonBooking: vi.fn(),
}));

vi.mock("@/shared/hooks/useBooking", () => ({
  useBooking: vi.fn(),
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function PublicDataHarness({ salonId }) {
  const state = useSalonPublicBookingData(salonId);

  return (
    <div>
      <div data-testid="loading">{String(state.isLoading)}</div>
      <div data-testid="error">{state.error}</div>
      <div data-testid="salon">{state.salon?.name || ""}</div>
    </div>
  );
}

function AvailabilityHarness({
  salonId,
  selectedBarber,
  selectedServiceId,
  services,
  initialDate = "2026-08-10",
}) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedTime, setSelectedTime] = useState("");
  const state = useSalonBookingAvailability({
    salonId,
    barbers: [],
    services,
    selectedBarber,
    selectedServiceId,
    selectedDate,
    selectedTime,
    setSelectedDate,
    setSelectedTime,
  });

  return (
    <div>
      <div data-testid="barber-id">{state.selectedBarberId || ""}</div>
      <div data-testid="services">
        {state.selectedBarberServices.map((service) => service.name).join(",")}
      </div>
      <div data-testid="slots">{state.availableSlots.join(",")}</div>
      <div data-testid="message">{state.slotMessage}</div>
      <button onClick={() => state.selectDate("2026-08-10")} type="button">
        select-date
      </button>
    </div>
  );
}

function SubmissionHarness({
  currentUser,
  selectedBarber,
  selectedService,
  selectedDate = "2026-08-10",
  selectedDateDayKey = "mon",
  validSelectedTime = "10:00",
  client = { name: "Jamie Client", phone: "+37477123456", note: "private note" },
}) {
  const state = useSalonBookingSubmission({
    salonId: "salon-1",
    currentUser,
    selectedBarber,
    selectedService,
    selectedDate,
    selectedDateDayKey,
    validSelectedTime,
    client,
  });

    return (
      <div>
        <div data-testid="success">{String(state.bookingSuccess)}</div>
        <div data-testid="payment">{state.bookingPayment ? "set" : "unset"}</div>
        <div data-testid="promo">{state.promoCode}</div>
        <div data-testid="validated-promo">{state.validatedPromo?.promotion?.code || ""}</div>
        <div data-testid="promo-discount">{state.validatedPromo?.discountAmount || 0}</div>
        <div data-testid="public-promotions">
          {state.publicPromotions.map((promotion) => promotion.code).join(",")}
        </div>
      <button onClick={() => state.setPromoCode("SAVE10")} type="button">
        seed-promo
      </button>
      <button onClick={() => state.handleApplyPromo()} type="button">
        apply-promo
      </button>
      <button disabled={state.isSaving} onClick={state.submitBooking} type="button">
        submit
      </button>
      <button onClick={state.resetBookingFlow} type="button">
        reset-flow
      </button>
      <button onClick={state.resetPromoState} type="button">
        reset-promo
      </button>
    </div>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

beforeEach(() => {
  api.get.mockResolvedValue({ data: [] });
  useBooking.mockReturnValue({ createBooking: vi.fn() });
});

describe("SalonPublicBookingPage split hooks", () => {
  it("keeps only current applicable salon-promotion discovery after a selection change", async () => {
    const staleDiscovery = deferred();
    api.get.mockImplementation((url) => {
      if (url.includes("barberId=barber-a")) return staleDiscovery.promise;
      if (url.includes("barberId=barber-b")) return Promise.resolve({ data: [{ code: "BONLY" }] });
      throw new Error(`Unexpected GET ${url}`);
    });

    const { rerender } = renderWithProviders(
      <SubmissionHarness
        currentUser={{ id: "client-1", role: "client" }}
        selectedBarber={{ id: "barber-a", name: "Ava" }}
        selectedService={{ id: "service-a", name: "Cut", price: 12000, duration: 30 }}
      />
    );

    rerender(
      <SubmissionHarness
        currentUser={{ id: "client-1", role: "client" }}
        selectedBarber={{ id: "barber-b", name: "Bea" }}
        selectedService={{ id: "service-b", name: "Color", price: 14000, duration: 45 }}
      />
    );

    await waitFor(() => expect(screen.getByTestId("public-promotions")).toHaveTextContent("BONLY"));
    await act(async () => {
      staleDiscovery.resolve({ data: [{ code: "STALE" }] });
      await Promise.resolve();
    });
    expect(screen.getByTestId("public-promotions")).toHaveTextContent("BONLY");
    expect(screen.getByTestId("public-promotions")).not.toHaveTextContent("STALE");
  });

  it("shows discovered promotions only after an explicit client action", async () => {
    const onApplyPromo = vi.fn();
    renderWithProviders(
      <SalonBookingSummary
        salon={{ name: "North Studio" }}
        selectedBarber={{ name: "Ava", depositSettings: { enabled: false } }}
        selectedService={{ name: "Cut", duration: 30, price: 12000 }}
        selectedDateLabel="Mon, Aug 10"
        validSelectedTime="10:00"
        currentUser={null}
        promoCode=""
        setPromoCode={vi.fn()}
        promoStatus={{ type: "", message: "" }}
        publicPromotions={[{ code: "SALON20" }]}
        validatingPromo={false}
        onApplyPromo={onApplyPromo}
        onRemovePromo={vi.fn()}
        client={{ name: "", phone: "", note: "" }}
        setClient={vi.fn()}
        submitError=""
        canConfirmBooking={false}
        confirmDisabledReason=""
        isSaving={false}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
        authRedirect="%2Fsalons%2Fsalon-1%2Fbook"
        selectedServicePriceInfo={{ hasDiscount: false, originalPrice: 12000, discountedPrice: 12000 }}
        publicPromoDiscount={0}
        publicTotalDiscount={0}
        publicFinalPrice={12000}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "SALON20" }));
    expect(onApplyPromo).toHaveBeenCalledWith("SALON20");
  });

  it("preserves manual salon promo-code validation", async () => {
    api.post.mockResolvedValue({
      data: { valid: true, promotion: { code: "SAVE10", title: "Save Ten" }, discountAmount: 10 },
    });
    renderWithProviders(
      <SubmissionHarness
        currentUser={{ id: "client-1", role: "client" }}
        selectedBarber={{ id: "barber-1", name: "Ava" }}
        selectedService={{ id: "svc-1", name: "Cut", price: 12000, duration: 30 }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "seed-promo" }));
    fireEvent.click(screen.getByRole("button", { name: "apply-promo" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/salons/salon-1/promotions/validate",
      { code: "SAVE10", serviceId: "svc-1", barberId: "barber-1" }
    ));
    await waitFor(() => expect(screen.getByTestId("validated-promo")).toHaveTextContent("SAVE10"));
  });

  it("ignores promo validation that resolves after the selected barber changes", async () => {
    const pending = deferred();
    api.post.mockReturnValue(pending.promise);
    const { rerender } = renderWithProviders(
      <SubmissionHarness
        currentUser={{ id: "client-1", role: "client" }}
        selectedBarber={{ id: "barber-a", name: "Ava" }}
        selectedService={{ id: "svc-1", name: "Cut", price: 12000, duration: 30 }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "seed-promo" }));
    fireEvent.click(screen.getByRole("button", { name: "apply-promo" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    rerender(
      <SubmissionHarness
        currentUser={{ id: "client-1", role: "client" }}
        selectedBarber={{ id: "barber-b", name: "Bea" }}
        selectedService={{ id: "svc-1", name: "Cut", price: 12000, duration: 30 }}
      />
    );

    await act(async () => {
      pending.resolve({
        data: { valid: true, promotion: { code: "SAVE10", title: "Save Ten" }, discountAmount: 10 },
      });
    });

    expect(screen.getByTestId("promo")).toHaveTextContent("");
    expect(screen.getByTestId("validated-promo")).toHaveTextContent("");
    expect(screen.getByTestId("promo-discount")).toHaveTextContent("0");
  });

  it("ignores promo validation that resolves after the selected service changes", async () => {
    const pending = deferred();
    const createBookingMock = vi.fn().mockResolvedValue({});
    useBooking.mockReturnValue({ createBooking: createBookingMock });
    api.post.mockReturnValue(pending.promise);
    const { rerender } = renderWithProviders(
      <SubmissionHarness
        currentUser={{ id: "client-1", role: "client" }}
        selectedBarber={{ id: "barber-1", name: "Ava" }}
        selectedService={{ id: "svc-a", name: "Cut", price: 12000, duration: 30 }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "seed-promo" }));
    fireEvent.click(screen.getByRole("button", { name: "apply-promo" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    rerender(
      <SubmissionHarness
        currentUser={{ id: "client-1", role: "client" }}
        selectedBarber={{ id: "barber-1", name: "Ava" }}
        selectedService={{ id: "svc-b", name: "Color", price: 14000, duration: 45 }}
      />
    );

    await act(async () => {
      pending.resolve({
        data: { valid: true, promotion: { code: "SAVE10", title: "Save Ten" }, discountAmount: 10 },
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => expect(createBookingMock).toHaveBeenCalledTimes(1));
    expect(createBookingMock.mock.calls[0][0]).not.toHaveProperty("promotionCode");
    expect(screen.getByTestId("validated-promo")).toHaveTextContent("");
  });

  it("drops stale public booking data after a salon switch and final unmount", async () => {
    const stale = deferred();
    const fresh = deferred();
    getPublicSalonBooking.mockImplementation((salonId) => {
      if (salonId === "salon-a") return stale.promise;
      if (salonId === "salon-b") return fresh.promise;
      throw new Error(`Unexpected salon ${salonId}`);
    });

    const { rerender, unmount } = renderWithProviders(<PublicDataHarness salonId="salon-a" />);

    rerender(<PublicDataHarness salonId="salon-b" />);

    await act(async () => {
      stale.resolve({
        salon: { name: "Stale Salon" },
        barbers: [],
        services: [],
      });
      await Promise.resolve();
    });

    await act(async () => {
      fresh.resolve({
        salon: { name: "Fresh Salon" },
        barbers: [],
        services: [],
      });
      await Promise.resolve();
    });

    expect(await screen.findByText("Fresh Salon")).toBeVisible();
    expect(screen.queryByText("Stale Salon")).not.toBeInTheDocument();

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    unmount();

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("keeps barber-scoped services isolated and ignores stale availability for a prior barber", async () => {
    const barberA = { id: "barber-a", services: [] };
    const barberB = { id: "barber-b", services: [] };
    const services = [
      { id: "svc-a", barberId: "barber-a", name: "Cut A", duration: 20 },
      { id: "svc-b", barberId: "barber-b", name: "Cut B", duration: 20 },
    ];
    const scheduleA = deferred();
    const bookingsA = deferred();
    const scheduleB = deferred();
    const bookingsB = deferred();

    api.get.mockImplementation((url) => {
      if (url === "/schedules/barber-a/salon-1") return scheduleA.promise;
      if (url === "/bookings/barber/barber-a") return bookingsA.promise;
      if (url === "/schedules/barber-b/salon-2") return scheduleB.promise;
      if (url === "/bookings/barber/barber-b") return bookingsB.promise;
      throw new Error(`Unexpected GET ${url}`);
    });

    const { rerender } = renderWithProviders(
      <AvailabilityHarness
        salonId="salon-1"
        selectedBarber={barberA}
        selectedServiceId="svc-a"
        services={services}
      />
    );

    rerender(
      <AvailabilityHarness
        salonId="salon-2"
        selectedBarber={barberB}
        selectedServiceId="svc-b"
        services={services}
      />
    );

    await act(async () => {
      scheduleB.resolve({
        data: {
          weeklySchedule: {
            mon: { working: true, from: "11:00", to: "12:00" },
          },
          defaultSchedule: {},
          scheduleOverrides: {},
          nonWorkingDays: [],
        },
      });
      bookingsB.resolve({ data: [] });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId("barber-id")).toHaveTextContent("barber-b"));
    expect(screen.getByTestId("services")).toHaveTextContent("Cut B");
    expect(screen.getByTestId("slots").textContent).toContain("11:00");

    await act(async () => {
      scheduleA.resolve({
        data: {
          weeklySchedule: {
            mon: { working: true, from: "09:00", to: "10:00" },
          },
          defaultSchedule: {},
          scheduleOverrides: {},
          nonWorkingDays: [],
        },
      });
      bookingsA.resolve({ data: [] });
      await Promise.resolve();
    });

    expect(screen.getByTestId("slots").textContent).toContain("11:00");
    expect(screen.getByTestId("slots").textContent).not.toContain("09:00");
  });

  it("keeps the custom date minimum on the local date even across the Armenia midnight boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T20:30:00.000Z"));

    try {
      const localDateKey = formatDateKey(new Date());

      const { container } = renderWithProviders(
        <SalonBookingSteps
          salon={{ name: "North Studio" }}
          step={3}
          selectedBarber={{ id: "barber-1", name: "Ava", services: [] }}
          selectedBarberId="barber-1"
          selectedBarberServices={[]}
          barbers={[]}
          services={[]}
          selectedService={{ id: "svc-1", name: "Cut", duration: 30, price: 12000 }}
          selectedServiceId="svc-1"
          handleSelectBarber={vi.fn()}
          handleSelectService={vi.fn()}
          setStep={vi.fn()}
          dateOptions={[{ value: localDateKey, label: "Today" }]}
          selectedDate={localDateKey}
          selectedDateLabel="Today"
          nonWorkingDays={[]}
          selectDate={vi.fn()}
          setSelectedTime={vi.fn()}
          availableSlots={[]}
          scheduleLoading={false}
          bookingsLoading={false}
          slotMessage=""
          validSelectedTime=""
          currentUser={null}
          client={{ name: "", phone: "", note: "" }}
          setClient={vi.fn()}
          promoCode=""
          setPromoCode={vi.fn()}
          promoStatus={{ type: "", message: "" }}
          validatedPromo={null}
          validatingPromo={false}
          onApplyPromo={vi.fn()}
          onRemovePromo={vi.fn()}
          submitError=""
          canConfirmBooking={false}
          confirmDisabledReason=""
          isSaving={false}
          onConfirm={vi.fn()}
          onBackFromConfirm={vi.fn()}
          authRedirect="/login?redirect=%2Fsalons%2Fsalon-1%2Fbook"
        />
      );

      const dateInput = container.querySelector('input[type="date"]');

      expect(dateInput).not.toBeNull();
      expect(dateInput).toHaveAttribute("min", localDateKey);
      expect(dateInput).not.toHaveAttribute("min", "2026-08-07");
    } finally {
      vi.useRealTimers();
    }
  });

  it("blocks duplicate submit clicks and supports a clean reset flow", async () => {
    const pending = deferred();
    const createBookingMock = vi.fn(() => pending.promise);
    useBooking.mockReturnValue({ createBooking: createBookingMock });

    renderWithProviders(
      <SubmissionHarness
        currentUser={{ id: "client-1", role: "client", name: "Jamie Client" }}
        selectedBarber={{ id: "barber-1", name: "Ava" }}
        selectedService={{ id: "svc-1", name: "Cut", price: 12000, duration: 30 }}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "submit" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "submit" })).toBeDisabled());
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(createBookingMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ payment: { paymentStatus: "pending" } });
      await Promise.resolve();
    });

    expect(screen.getByTestId("success")).toHaveTextContent("true");
    expect(screen.getByTestId("payment")).toHaveTextContent("set");

    await act(async () => {
      screen.getByRole("button", { name: "seed-promo" }).click();
      screen.getByRole("button", { name: "reset-flow" }).click();
    });

    expect(screen.getByTestId("success")).toHaveTextContent("false");
    expect(screen.getByTestId("payment")).toHaveTextContent("unset");
    expect(screen.getByTestId("promo")).toHaveTextContent("SAVE10");
  });

  it("preserves the auth redirect on login and register links", () => {
    renderWithProviders(
      <SalonBookingSummary
        salon={{ name: "North Studio" }}
        selectedBarber={{ name: "Ava", depositSettings: { enabled: false } }}
        selectedService={{ name: "Cut", duration: 30, price: 12000 }}
        selectedDateLabel="Mon, Aug 10"
        validSelectedTime="10:00"
        currentUser={null}
        promoCode=""
        setPromoCode={vi.fn()}
        promoStatus={{ type: "", message: "" }}
        validatingPromo={false}
        onApplyPromo={vi.fn()}
        onRemovePromo={vi.fn()}
        client={{ name: "", phone: "", note: "" }}
        setClient={vi.fn()}
        submitError=""
        canConfirmBooking={false}
        confirmDisabledReason=""
        isSaving={false}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
        authRedirect="%2Fsalons%2Fsalon-1%2Fbook"
        selectedServicePriceInfo={{
          hasDiscount: false,
          originalPrice: 12000,
          discountedPrice: 12000,
        }}
        publicPromoDiscount={0}
        publicTotalDiscount={0}
        publicFinalPrice={12000}
      />
    );

    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/login?redirect=%2Fsalons%2Fsalon-1%2Fbook"
    );
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute(
      "href",
      "/register?redirect=%2Fsalons%2Fsalon-1%2Fbook"
    );
  });
});
