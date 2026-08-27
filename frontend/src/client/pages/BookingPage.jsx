import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";

import BookingSummary from "@/client/components/BookingSummary";
import ClientBooking from "@/client/components/ClientBooking";
import useBookingPageAvailability from "@/client/hooks/useBookingPageAvailability";
import useBookingPageData from "@/client/hooks/useBookingPageData";
import {
  getBookingScheduleEntry,
  getDefaultSchedule,
  getEntityId,
  getScheduleOverrides,
  getStateSelectedSalonId,
  getWeeklySchedule,
  resolveBookingSalonId,
} from "@/client/utils/bookingPageSchedule";
import {
  formatArmeniaDateLabel,
  getArmeniaDayKey,
  getNext7ArmeniaDays,
  isDateKey,
} from "@/shared/utils/dates";

const EMPTY_NON_WORKING_DAYS = [];

const getRebookContext = (state) => {
  if (!state?.rebook) return null;

  return {
    barberId: state.barberId || getEntityId(state.barber),
    serviceId: state.serviceId || getEntityId(state.service),
  };
};

function BookingStepIndicator({ currentStep }) {
  const steps = [
    { key: 2, label: "Service" },
    { key: 3, label: "Time" },
    { key: 4, label: "Confirm" },
  ];

  return (
    <div className="flex items-center gap-2 sm:gap-4">
      {steps.map((s, idx) => {
        const isActive = currentStep === s.key;
        const isCompleted = currentStep > s.key;
        return (
          <div key={s.key} className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition ${
                  isActive
                    ? "bg-brand-600 text-white"
                    : isCompleted
                      ? "bg-brand-50 text-brand-600"
                      : "bg-neutral-100 text-neutral-400"
                }`}
              >
                {isCompleted ? "✓" : s.key - 1}
              </div>
              <span
                className={`hidden text-sm font-medium sm:inline ${
                  isActive ? "text-neutral-950" : isCompleted ? "text-brand-600" : "text-neutral-400"
                }`}
              >
                {s.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`h-px w-6 shrink-0 sm:w-10 ${
                  isCompleted ? "bg-brand-500" : "bg-neutral-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BookingPage({
  step,
  setStep,
  services,
  selectedServiceId,
  setSelectedServiceId,
  selectedDayKey,
  setSelectedDayKey,
  selectedTime,
  setSelectedTime,
  client,
  currentUser,
  bookings,
  schedule,
  setClient,
}) {
  const { barberId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialRebookContext = getRebookContext(location.state);
  const querySelectedSalonId = searchParams.get("salonId");
  const stateSelectedSalonId = getStateSelectedSalonId(location.state);
  const users = useSelector((state) => state.users);
  const barberFromState = location.state?.barber;
  const barberFromStore = (users || []).find(
    (user) =>
      user?.role === "barber" &&
      String(user?.id || user?._id) === String(barberId)
  );
  const barber = useMemo(() => {
    if (!barberFromState) return barberFromStore;

    return {
      ...barberFromStore,
      ...barberFromState,
      depositSettings:
        barberFromState.depositSettings ?? barberFromStore?.depositSettings,
    };
  }, [barberFromState, barberFromStore]);
  const initialSelectedSalonId = resolveBookingSalonId({
    querySelectedSalonId,
    stateSelectedSalonId,
    barber,
  });
  const [rebookContext, setRebookContext] = useState(initialRebookContext);
  const [selectedDate, setSelectedDate] = useState(() =>
    initialRebookContext?.serviceId ? "" : getNext7ArmeniaDays()[0].value
  );
  const [activeBarberId, setActiveBarberId] = useState(null);
  const [selectedSalonId, setSelectedSalonId] = useState(initialSelectedSalonId);
  const activeSelectedSalonId = resolveBookingSalonId({
    querySelectedSalonId,
    stateSelectedSalonId,
    selectedSalonId,
    barber,
  });
  const [priceAdjustment, setPriceAdjustment] = useState({
    discountPreview: 0,
    pricingQuote: null,
    voucherCode: "",
  });
  const needsEnrichedBarber = !barber?.depositSettings;
  const {
    error,
    isBarberLoading,
    isLoading,
    isScheduleBlocked,
    isServicesLoading,
    refreshServices,
    setError,
    setIsServicesLoading,
  } = useBookingPageData({
    activeSelectedSalonId,
    barberId,
    needsEnrichedBarber,
    setSelectedDate,
    setSelectedDayKey,
    setSelectedServiceId,
    setSelectedTime,
  });

  const barberBookings = useMemo(
    () =>
      (bookings || []).filter(
        (booking) => String(booking?.barberId) === String(barberId)
      ),
    [barberId, bookings]
  );
  const barberServices = useMemo(
    () =>
      (services || []).filter(
        (service) => String(service?.barberId) === String(barberId)
      ),
    [barberId, services]
  );
  const selectedService = isServicesLoading
    ? null
    : barberServices.find(
        (service) => String(service?.id || service?._id) === String(selectedServiceId)
      ) || null;
  const barberScheduleEntry = useMemo(() => getBookingScheduleEntry({
    schedule,
    barberId,
    barberDefaultSchedule: barber?.defaultSchedule,
  }), [barber?.defaultSchedule, barberId, schedule]);
  const barberScheduleOverrides = useMemo(
    () => getScheduleOverrides(barberScheduleEntry),
    [barberScheduleEntry]
  );
  const barberWeeklySchedule = useMemo(
    () => getWeeklySchedule(barberScheduleEntry),
    [barberScheduleEntry]
  );
  const barberDefaultSchedule = getDefaultSchedule(
    barberScheduleEntry,
    barber?.defaultSchedule
  );
  const nonWorkingDays = barberScheduleEntry.nonWorkingDays || EMPTY_NON_WORKING_DAYS;
  const dateOptions = useMemo(() => getNext7ArmeniaDays(), []);
  const customSelectedDateOption = isDateKey(selectedDate)
    ? {
        value: selectedDate,
        dayKey: getArmeniaDayKey(selectedDate),
        label: formatArmeniaDateLabel(selectedDate),
      }
    : null;
  const selectedDateOption =
    dateOptions.find((option) => option.value === selectedDate) ||
    customSelectedDateOption;
  const selectedDateLabel = selectedDateOption?.label || "";
  const isRebooking =
    Boolean(rebookContext?.serviceId) &&
    (!rebookContext?.barberId ||
      String(rebookContext.barberId) === String(barberId));

  useEffect(() => {
    const nextRebookContext = getRebookContext(location.state);

    if (!nextRebookContext) return;

    const nextSearchParams = new URLSearchParams(location.search);

    if (querySelectedSalonId) {
      nextSearchParams.set("salonId", querySelectedSalonId);
    }

    navigate(
      nextSearchParams.toString()
        ? { pathname: location.pathname, search: `?${nextSearchParams.toString()}` }
        : location.pathname,
      {
        replace: true,
        state: location.state?.barber ? { barber: location.state.barber } : null,
      }
    );
  }, [
    location.pathname,
    location.search,
    location.state,
    navigate,
    querySelectedSalonId,
  ]);

  const handleSalonSelect = useCallback(
    (nextSalonId) => {
      setSelectedSalonId(nextSalonId);

      if (!nextSalonId) return;

      const nextSearchParams = new URLSearchParams(location.search);
      nextSearchParams.set("salonId", nextSalonId);
      navigate(
        {
          pathname: location.pathname,
          search: `?${nextSearchParams.toString()}`,
        },
        { replace: true, state: location.state }
      );
    },
    [location.pathname, location.search, location.state, navigate, setSelectedSalonId]
  );

  useEffect(() => {
    const initialDateOption = dateOptions[0];

    const resetId = window.setTimeout(() => {
      setIsServicesLoading(true);
      setStep(isRebooking ? 3 : 2);
      setSelectedServiceId(isRebooking ? rebookContext.serviceId : null);
      setSelectedTime("");
      setSelectedDate(isRebooking ? "" : initialDateOption?.value || "");
      setSelectedDayKey(isRebooking ? "" : initialDateOption?.dayKey || "");
      setClient({ name: "", phone: "", note: "" });
      setActiveBarberId(barberId);
    }, 0);

    return () => window.clearTimeout(resetId);
  }, [
    barberId,
    dateOptions,
    isRebooking,
    rebookContext?.serviceId,
    setClient,
    setSelectedDate,
    setSelectedDayKey,
    setSelectedServiceId,
    setSelectedTime,
    setIsServicesLoading,
    setStep,
  ]);

  const selectedDateDayKey = selectedDateOption?.dayKey || "";

  useEffect(() => {
    if (selectedDateOption?.dayKey) {
      setSelectedDayKey(selectedDateOption.dayKey);
    }
  }, [selectedDateOption?.dayKey, setSelectedDayKey]);

  useEffect(() => {
    if (!isRebooking || isLoading) return;

    const matchingService = barberServices.find(
      (service) => String(service?.id || service?._id) === String(rebookContext.serviceId)
    );

    if (!matchingService) {
      const resetId = window.setTimeout(() => {
        setError("Cannot re-book because specialist/service data is missing");
        setStep(2);
        setSelectedServiceId(null);
        setRebookContext(null);
      }, 0);

      return () => window.clearTimeout(resetId);
    }

    if (!matchingService.active) {
      const resetId = window.setTimeout(() => {
        setError("Selected service is no longer available.");
        setStep(2);
        setSelectedServiceId(null);
        setRebookContext(null);
      }, 0);

      return () => window.clearTimeout(resetId);
    }
  }, [
    barberServices,
    isLoading,
    isRebooking,
    rebookContext?.serviceId,
    setError,
    setSelectedServiceId,
    setStep,
  ]);

  const {
    availableSlots,
    isSelectedTimeValid,
    slotMessage,
  } = useBookingPageAvailability({
    activeBarberId,
    barber,
    barberBookings,
    barberDefaultSchedule,
    barberId,
    barberScheduleEntry,
    barberScheduleOverrides,
    barberWeeklySchedule,
    isLoading,
    isScheduleBlocked,
    isServicesLoading,
    nonWorkingDays,
    selectedDate,
    selectedDateDayKey,
    selectedService,
    selectedTime,
    setSelectedTime,
    step,
  });

  if (!barber && !isLoading && !isBarberLoading && isRebooking) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        <p className="font-semibold">Cannot re-book</p>
        <p className="mt-1">Specialist or service data is missing.</p>
      </div>
    );
  }

  if (!barber && !isLoading && !isBarberLoading) {
    return <Navigate to="/specialists" replace />;
  }

  if (!barber && (isLoading || isBarberLoading)) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-xl bg-neutral-100" />
        <div className="h-4 w-64 animate-pulse rounded-xl bg-neutral-100" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
            {barber?.name || "Booking"}
          </h1>
          {barber?.phone && <p className="mt-1 text-neutral-500">{barber.phone}</p>}
        </div>

        <BookingStepIndicator currentStep={step} />
      </div>

      {isLoading && (
        <div className="space-y-3">
          <div className="h-5 w-56 animate-pulse rounded-xl bg-neutral-100" />
          <div className="h-32 animate-pulse rounded-2xl bg-neutral-100" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:gap-8">
        <ClientBooking
          barber={barber}
          step={step}
          setStep={setStep}
          services={barberServices}
          selectedService={selectedService}
          selectedServiceId={selectedServiceId}
          setSelectedServiceId={setSelectedServiceId}
          selectedDayKey={selectedDayKey}
          setSelectedDayKey={setSelectedDayKey}
          dateOptions={dateOptions}
          selectedDate={selectedDate}
          selectedDateLabel={selectedDateLabel}
          setSelectedDate={setSelectedDate}
          nonWorkingDays={nonWorkingDays}
          slotMessage={slotMessage}
          selectedTime={selectedTime}
          setSelectedTime={setSelectedTime}
          availableSlots={availableSlots}
          isSelectedTimeValid={isSelectedTimeValid}
          isRebooking={isRebooking}
          client={client}
          currentUser={currentUser}
          setClient={setClient}
          selectedSalonId={activeSelectedSalonId}
          onSalonSelect={handleSalonSelect}
          onPriceAdjustmentChange={setPriceAdjustment}
          isServiceDataLoading={isServicesLoading}
          onRefreshServices={refreshServices}
        />

        <BookingSummary
          selectedService={selectedService}
          selectedServiceId={selectedServiceId}
          selectedDayKey={selectedDayKey}
          selectedDateLabel={selectedDateLabel}
          selectedTime={selectedTime}
          client={client}
          depositSettings={barber?.depositSettings}
          discountPreview={priceAdjustment.discountPreview}
          pricingQuote={priceAdjustment.pricingQuote}
          isServiceLoading={isServicesLoading}
        />
      </div>
    </div>
  );
}
