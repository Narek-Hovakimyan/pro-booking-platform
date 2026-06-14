import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import api from "@/shared/api/axios";
import { getFriendlyApiError, isBarberUnavailableError } from "@/shared/api/errors";
import BookingSummary from "@/client/components/BookingSummary";
import ClientBooking from "@/client/components/ClientBooking";
import initialSchedule, {
  defaultPersonalSchedule,
  getDayScheduleFromDefaultSchedule,
} from "@/shared/data/schedule";
import { setBookings } from "@/store/slices/bookingsSlice";
import { setSchedule } from "@/store/slices/scheduleSlice";
import { setServices } from "@/store/slices/servicesSlice";
import { setBarbers } from "@/store/slices/usersSlice";
import { formatDateLabel, getDayKeyFromDate, getNext7Days, parseDateKey } from "@/shared/utils/dates";
import { getSalonSlotAvailabilitySummary } from "@/shared/utils/slots";
import { timeToMinutes } from "@/shared/utils/time";

const EMPTY_NON_WORKING_DAYS = [];
const EMPTY_SLOT_SUMMARY = {
  availableSlots: [],
  blockedByTime: false,
  blockedByBooking: false,
};

const getEntityId = (entity) =>
  typeof entity === "string" ? entity : entity?.id || entity?._id || "";

const isMeaningfulWeeklyDay = (daySchedule) =>
  Boolean(daySchedule?.working) &&
  timeToMinutes(daySchedule.from) !== null &&
  timeToMinutes(daySchedule.to) !== null;

const getExplicitWeeklyDayOff = (daySchedule) =>
  daySchedule?.working === false
    ? {
        working: false,
        from: daySchedule.from || "",
        to: daySchedule.to || "",
        breakFrom: daySchedule.breakFrom || "",
        breakTo: daySchedule.breakTo || "",
      }
    : null;

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
  const dispatch = useDispatch();
  const initialRebookContext = getRebookContext(location.state);
  const querySelectedSalonId = searchParams.get("salonId");
  const initialSelectedSalonId =
    querySelectedSalonId ||
    location.state?.selectedSalonId ||
    getEntityId(location.state?.salon) ||
    null;
  const [rebookContext, setRebookContext] = useState(initialRebookContext);
  const [isLoading, setIsLoading] = useState(true);
  const [isServicesLoading, setIsServicesLoading] = useState(true);
  const [isBarberLoading, setIsBarberLoading] = useState(false);
  const [isScheduleBlocked, setIsScheduleBlocked] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(() =>
    initialRebookContext?.serviceId ? "" : getNext7Days()[0].value
  );
  const [activeBarberId, setActiveBarberId] = useState(null);
  const [selectedSalonId, setSelectedSalonId] = useState(initialSelectedSalonId);
  const activeSelectedSalonId = querySelectedSalonId || selectedSalonId;
  const [priceAdjustment, setPriceAdjustment] = useState({
    discountPreview: 0,
    voucherCode: "",
  });
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
  const needsEnrichedBarber = !barber?.depositSettings;

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
  const barberScheduleEntry = useMemo(
    () =>
      schedule?.[barberId] || {
        weeklySchedule: {},
        dateSchedules: {},
        defaultSchedule: barber?.defaultSchedule || defaultPersonalSchedule,
        nonWorkingDays: [],
      },
    [barber?.defaultSchedule, barberId, schedule]
  );
  const barberScheduleOverrides = useMemo(
    () => barberScheduleEntry.scheduleOverrides || {},
    [barberScheduleEntry.scheduleOverrides]
  );
  const barberWeeklySchedule = useMemo(
    () => barberScheduleEntry.weeklySchedule || {},
    [barberScheduleEntry.weeklySchedule]
  );
  const barberDefaultSchedule =
    barberScheduleEntry.defaultSchedule ||
    barber?.defaultSchedule ||
    defaultPersonalSchedule;
  const nonWorkingDays = barberScheduleEntry.nonWorkingDays || EMPTY_NON_WORKING_DAYS;
  const dateOptions = useMemo(() => getNext7Days(), []);
  const selectedDateObject = parseDateKey(selectedDate);
  const customSelectedDateOption = selectedDateObject
    ? {
        date: selectedDateObject,
        value: selectedDate,
        dayKey: getDayKeyFromDate(selectedDateObject),
        label: formatDateLabel(selectedDateObject),
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

    navigate(location.pathname, {
      replace: true,
      state: location.state?.barber ? { barber: location.state.barber } : null,
    });
  }, [location.pathname, location.state, navigate]);

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
    [location.pathname, location.search, location.state, navigate]
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
    setStep,
  ]);

  const refreshServices = useCallback(async () => {
    setIsServicesLoading(true);
      setError("");

    try {
      const servicesUrl = activeSelectedSalonId
        ? `/services/${barberId}?salonId=${activeSelectedSalonId}`
        : `/services/${barberId}`;
      const servicesResponse = await api.get(servicesUrl);
      dispatch(
        setServices({
          barberId,
          services: servicesResponse.data,
        })
      );
      return servicesResponse.data;
    } catch (requestError) {
      const message =
        isBarberUnavailableError(requestError)
          ? getFriendlyApiError(requestError)
          : requestError.response?.data?.message ||
            "Could not load services. Please try again.";
      setError(message);
      throw new Error(message, { cause: requestError });
    } finally {
      setIsServicesLoading(false);
    }
  }, [activeSelectedSalonId, barberId, dispatch]);

  useEffect(() => {
    if (!needsEnrichedBarber) return undefined;

    let isMounted = true;

    async function fetchBarber() {
      setIsBarberLoading(true);

      try {
        const { data } = await api.get("/users/barbers");

        if (isMounted) {
          dispatch(setBarbers(data));
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Cannot re-book because specialist/service data is missing"
          );
        }
      } finally {
        if (isMounted) {
          setIsBarberLoading(false);
        }
      }
    }

    fetchBarber();

    return () => {
      isMounted = false;
    };
  }, [barberId, dispatch, needsEnrichedBarber]);

  const selectedDateDayKey = selectedDateOption?.dayKey || "";
  const selectedOverride = barberScheduleOverrides[selectedDate];
  const selectedDaySchedule = useMemo(() => {
    // Keep frontend slot visibility aligned with backend getScheduleForDate.
    if (selectedOverride) {
      return {
        working: Boolean(selectedOverride.isWorking),
        from: selectedOverride.startTime || "",
        to: selectedOverride.endTime || "",
        breakFrom: selectedOverride.breakStart || "",
        breakTo: selectedOverride.breakEnd || "",
      };
    }

    const weeklyDaySchedule = selectedDateDayKey
      ? barberWeeklySchedule[selectedDateDayKey]
      : null;
    const explicitWeeklyDayOff = getExplicitWeeklyDayOff(weeklyDaySchedule);

    if (explicitWeeklyDayOff) {
      return explicitWeeklyDayOff;
    }

    return isMeaningfulWeeklyDay(weeklyDaySchedule)
      ? weeklyDaySchedule
      : getDayScheduleFromDefaultSchedule(barberDefaultSchedule);
  }, [
    barberDefaultSchedule,
    barberWeeklySchedule,
    selectedDateDayKey,
    selectedOverride,
  ]);
  const isWeeklyDayOff = !selectedDaySchedule?.working;

  useEffect(() => {
    if (selectedDateOption?.dayKey) {
      setSelectedDayKey(selectedDateOption.dayKey);
    }
  }, [selectedDateOption?.dayKey, setSelectedDayKey]);

  useEffect(() => {
    let isMounted = true;

    async function fetchBookingData() {
      setIsLoading(true);
      setIsServicesLoading(true);
      setIsScheduleBlocked(false);
      setError("");

      try {
        const servicesUrl = activeSelectedSalonId
          ? `/services/${barberId}?salonId=${activeSelectedSalonId}`
          : `/services/${barberId}`;
        const servicesResponse = await api.get(servicesUrl);

        if (!isMounted) return;

        dispatch(
          setServices({
            barberId,
            services: servicesResponse.data,
          })
        );
      } catch (requestError) {
        if (isMounted) {
          const message = isBarberUnavailableError(requestError)
            ? getFriendlyApiError(requestError)
            : requestError.response?.data?.message ||
              "Could not load services. Please try again.";
          setError(message);
          setSelectedServiceId(null);
          setSelectedTime("");
        }
      } finally {
        if (isMounted) {
          setIsServicesLoading(false);
        }
      }

      try {
        // Fetch per-salon schedule if a salon is selected, otherwise use legacy route
        const scheduleUrl = activeSelectedSalonId
          ? `/schedules/${barberId}/${activeSelectedSalonId}`
          : `/schedules/${barberId}`;
        const scheduleResponse = await api.get(scheduleUrl);

        if (!isMounted) return;

        dispatch(
          setSchedule({
            barberId,
            weeklySchedule: scheduleResponse.data?.weeklySchedule || initialSchedule,
            dateSchedules: scheduleResponse.data?.dateSchedules || {},
            scheduleOverrides: scheduleResponse.data?.scheduleOverrides || {},
            defaultSchedule:
              scheduleResponse.data?.defaultSchedule || defaultPersonalSchedule,
            nonWorkingDays: scheduleResponse.data?.nonWorkingDays || [],
          })
        );
      } catch (requestError) {
        if (isMounted) {
          const message = isBarberUnavailableError(requestError)
            ? getFriendlyApiError(requestError)
            : requestError.response?.data?.message ||
              "Could not load schedule. Please try again.";
          setIsScheduleBlocked(true);
          setSelectedDate("");
          setSelectedDayKey("");
          setSelectedTime("");
          setError(message);
        }
      }

      try {
        const bookingsResponse = await api.get(`/bookings/barber/${barberId}`);

        if (!isMounted) return;

        dispatch(
          setBookings({
            bookings: bookingsResponse.data,
            scope: { key: "barberId", value: barberId },
          })
        );
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Could not load booked times. Please try again."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchBookingData();

    return () => {
      isMounted = false;
    };
  }, [
    barberId,
    dispatch,
    activeSelectedSalonId,
    setSelectedDayKey,
    setSelectedServiceId,
    setSelectedTime,
  ]);

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
    setSelectedServiceId,
    setStep,
  ]);

  const isSelectedDateNonWorking = (nonWorkingDays || []).includes(selectedDate);
  const isBarberNotWorking = isSelectedDateNonWorking || isWeeklyDayOff;
  const slotSummary = useMemo(() => {
    if (
      step < 3 ||
      String(activeBarberId) !== String(barberId) ||
      !barber ||
      !selectedService ||
      !selectedDate ||
      !selectedDateDayKey ||
      isScheduleBlocked ||
      isBarberNotWorking
    ) {
      return EMPTY_SLOT_SUMMARY;
    }

    return getSalonSlotAvailabilitySummary(
      selectedDaySchedule,
      selectedService?.duration || 20,
      barberBookings,
      selectedDateDayKey,
      { selectedDate }
    );
  }, [
    activeBarberId,
    barberId,
    barber,
    barberBookings,
    isBarberNotWorking,
    isScheduleBlocked,
    selectedDate,
    selectedDateDayKey,
    selectedDaySchedule,
    selectedService,
    step,
  ]);
  const availableSlots = slotSummary.availableSlots;

  useEffect(() => {
    if (isLoading || isServicesLoading) return;

    if (selectedTime && !availableSlots.includes(selectedTime)) {
      setSelectedTime("");
    }
  }, [availableSlots, isLoading, isServicesLoading, selectedTime, setSelectedTime]);

  const slotMessage = isScheduleBlocked
    ? "This barber is not currently accepting bookings at this salon."
    : !selectedService
    ? "Select service first"
    : !selectedDate
      ? "Choose a date first"
    : isBarberNotWorking
      ? "Specialist is not working this day"
      : slotSummary.blockedByTime
        ? "Not enough time for selected service"
        : slotSummary.blockedByBooking
          ? "This time is already booked"
          : "No available slots";

  if (!barber && !isLoading && !isBarberLoading && isRebooking) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Cannot re-book because specialist/service data is missing
      </p>
    );
  }

  if (!barber && !isLoading && !isBarberLoading) {
    return <Navigate to="/specialists" replace />;
  }

  if (!barber && (isLoading || isBarberLoading)) {
    return <p className="text-neutral-500">Loading booking data...</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">
          {barber?.name || "Booking"}
        </h1>
        {barber?.phone && <p className="mt-1 text-neutral-500">{barber.phone}</p>}
      </div>

      {isLoading && (
        <p className="text-neutral-500">Loading booking data...</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px] lg:gap-6">
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
          isSelectedTimeValid={
            Boolean(selectedTime) && availableSlots.includes(selectedTime)
          }
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
          isServiceLoading={isServicesLoading}
        />
      </div>
    </div>
  );
}
