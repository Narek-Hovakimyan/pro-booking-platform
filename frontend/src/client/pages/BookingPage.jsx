import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";

import BookingPageContent from "@/client/components/booking/BookingPageContent";
import useBookingPageAvailability from "@/client/hooks/useBookingPageAvailability";
import useBookingPageData from "@/client/hooks/useBookingPageData";
import useBookingPageDerivedState from "@/client/hooks/useBookingPageDerivedState";
import {
  getEntityId,
  getStateSelectedSalonId,
  resolveBookingSalonId,
} from "@/client/utils/bookingPageSchedule";
import { getNext7ArmeniaDays } from "@/shared/utils/dates";

const getRebookContext = (state) => {
  if (!state?.rebook) return null;

  return {
    barberId: state.barberId || getEntityId(state.barber),
    serviceId: state.serviceId || getEntityId(state.service),
  };
};

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

  const {
    barberBookings,
    barberDefaultSchedule,
    barberScheduleEntry,
    barberScheduleOverrides,
    barberServices,
    barberWeeklySchedule,
    dateOptions,
    nonWorkingDays,
    selectedDateLabel,
    selectedDateOption,
    selectedService,
  } = useBookingPageDerivedState({
    barber,
    barberId,
    bookings,
    schedule,
    selectedDate,
    selectedServiceId,
    services,
  });
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
    <BookingPageContent
      barber={barber}
      display={{ error, isLoading, step }}
      clientBookingProps={{
        barber,
        step,
        setStep,
        services: barberServices,
        selectedService,
        selectedServiceId,
        setSelectedServiceId,
        selectedDayKey,
        setSelectedDayKey,
        dateOptions,
        selectedDate,
        selectedDateLabel,
        setSelectedDate,
        nonWorkingDays,
        slotMessage,
        selectedTime,
        setSelectedTime,
        availableSlots,
        isSelectedTimeValid,
        isRebooking,
        client,
        currentUser,
        setClient,
        selectedSalonId: activeSelectedSalonId,
        onSalonSelect: handleSalonSelect,
        onPriceAdjustmentChange: setPriceAdjustment,
        isServiceDataLoading: isServicesLoading,
        onRefreshServices: refreshServices,
      }}
      summaryProps={{
        selectedService,
        selectedServiceId,
        selectedDayKey,
        selectedDateLabel,
        selectedTime,
        client,
        depositSettings: barber?.depositSettings,
        discountPreview: priceAdjustment.discountPreview,
        pricingQuote: priceAdjustment.pricingQuote,
        isServiceLoading: isServicesLoading,
      }}
    />
  );
}
