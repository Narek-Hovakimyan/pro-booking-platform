import { useEffect, useMemo, useState } from "react";

import api from "@/shared/api/axios";
import { getFriendlyApiError, isBarberUnavailableError } from "@/shared/api/errors";
import initialSchedule, {
  defaultPersonalSchedule,
  getDayScheduleFromDefaultSchedule,
} from "@/shared/data/schedule";
import {
  formatArmeniaDateLabel,
  getArmeniaDayKey,
  getNext7ArmeniaDays,
  isBeforeArmeniaToday,
  isDateKey,
} from "@/shared/utils/dates";
import { getSalonSlotAvailabilitySummary } from "@/shared/utils/slots";
import { timeToMinutes } from "@/shared/utils/time";

const EMPTY_SLOT_SUMMARY = {
  availableSlots: [],
  blockedByTime: false,
  blockedByBooking: false,
};

const getMeaningfulWeeklyDay = (daySchedule) =>
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

export function useSalonBookingAvailability({
  salonId,
  services,
  selectedBarber,
  selectedServiceId,
  selectedDate,
  selectedTime,
  setSelectedDate,
  setSelectedTime,
}) {
  const [barberScheduleEntry, setBarberScheduleEntry] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [barberBookings, setBarberBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);

  const dateOptions = useMemo(() => getNext7ArmeniaDays(), []);
  const selectedBarberId = selectedBarber?.id || selectedBarber?._id;

  const selectedBarberServices = useMemo(() => {
    if (!selectedBarber) return [];

    if (Array.isArray(selectedBarber.services) && selectedBarber.services.length > 0) {
      return selectedBarber.services;
    }

    return (services || []).filter(
      (service) => String(service?.barberId) === String(selectedBarberId)
    );
  }, [selectedBarber, selectedBarberId, services]);

  useEffect(() => {
    if (!selectedBarber) {
      const resetId = window.setTimeout(() => {
        setBarberScheduleEntry(null);
        setAvailabilityError("");
      }, 0);

      return () => window.clearTimeout(resetId);
    }

    let isMounted = true;

    async function loadAvailabilityData() {
      setScheduleLoading(true);
      setBookingsLoading(true);
      setBarberBookings([]);
      setAvailabilityError("");

      try {
        const barberId = selectedBarber.id || selectedBarber._id;
        const [scheduleResponse, bookingsResponse] = await Promise.all([
          api.get(`/schedules/${barberId}/${salonId}`),
          api.get(`/bookings/barber/${barberId}`),
        ]);

        if (!isMounted) return;

        setBarberScheduleEntry({
          weeklySchedule:
            scheduleResponse.data?.weeklySchedule || initialSchedule,
          dateSchedules: scheduleResponse.data?.dateSchedules || {},
          scheduleOverrides: scheduleResponse.data?.scheduleOverrides || {},
          defaultSchedule:
            scheduleResponse.data?.defaultSchedule || defaultPersonalSchedule,
          nonWorkingDays: scheduleResponse.data?.nonWorkingDays || [],
        });
        setBarberBookings(bookingsResponse.data || []);
      } catch (requestError) {
        if (isMounted) {
          setBarberScheduleEntry(null);
          setBarberBookings([]);
          setSelectedDate("");
          setSelectedTime("");
          setAvailabilityError(
            isBarberUnavailableError(requestError)
              ? getFriendlyApiError(requestError)
              : "Could not load availability for this specialist."
          );
        }
      } finally {
        if (isMounted) {
          setScheduleLoading(false);
          setBookingsLoading(false);
        }
      }
    }

    loadAvailabilityData();

    return () => {
      isMounted = false;
    };
  }, [salonId, selectedBarber, setSelectedDate, setSelectedTime]);

  const selectedService = useMemo(() => {
    if (!selectedBarber || !selectedServiceId) return null;

    return selectedBarberServices.find(
      (service) => String(service.id || service._id) === String(selectedServiceId)
    );
  }, [selectedBarber, selectedBarberServices, selectedServiceId]);

  const nonWorkingDays = barberScheduleEntry?.nonWorkingDays || [];
  const barberWeeklySchedule = useMemo(
    () => barberScheduleEntry?.weeklySchedule || {},
    [barberScheduleEntry?.weeklySchedule]
  );
  const barberDefaultSchedule =
    barberScheduleEntry?.defaultSchedule || defaultPersonalSchedule;
  const barberScheduleOverrides = barberScheduleEntry?.scheduleOverrides || {};

  const selectedDateOption = isDateKey(selectedDate)
    ? {
        value: selectedDate,
        dayKey: getArmeniaDayKey(selectedDate),
        label: formatArmeniaDateLabel(selectedDate),
      }
    : null;
  const selectedDateLabel = selectedDateOption?.label || selectedDate || "";
  const selectedDateDayKey = selectedDateOption?.dayKey || "";

  const selectedOverride = barberScheduleOverrides[selectedDate];
  const selectedDaySchedule = useMemo(() => {
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

    return getMeaningfulWeeklyDay(weeklyDaySchedule)
      ? weeklyDaySchedule
      : getDayScheduleFromDefaultSchedule(barberDefaultSchedule);
  }, [
    barberDefaultSchedule,
    barberWeeklySchedule,
    selectedDateDayKey,
    selectedOverride,
  ]);

  const isWeeklyDayOff = !selectedDaySchedule?.working;
  const isSelectedDateNonWorking = (nonWorkingDays || []).includes(selectedDate);

  const slotSummary = useMemo(() => {
    if (
      !selectedBarber ||
      !selectedService ||
      !selectedDate ||
      !selectedDateDayKey ||
      !barberScheduleEntry ||
      availabilityError ||
      scheduleLoading ||
      isSelectedDateNonWorking ||
      isWeeklyDayOff
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
    selectedBarber,
    selectedService,
    selectedDate,
    selectedDateDayKey,
    barberScheduleEntry,
    availabilityError,
    scheduleLoading,
    isSelectedDateNonWorking,
    isWeeklyDayOff,
    selectedDaySchedule,
    barberBookings,
  ]);

  const availableSlots = slotSummary.availableSlots;
  const validSelectedTime =
    selectedTime && availableSlots.includes(selectedTime) ? selectedTime : "";
  const slotMessage = availabilityError
    ? availabilityError
    : !selectedService
      ? "Select service first"
      : !selectedDate
        ? "Choose a date first"
        : isSelectedDateNonWorking || isWeeklyDayOff
          ? "Barber is not working this day"
          : slotSummary.blockedByTime
            ? "Not enough time for selected service"
            : slotSummary.blockedByBooking
              ? "This time is already booked"
              : "No available slots";

  const selectDate = (dateKey) => {
    if (!isDateKey(dateKey) || isBeforeArmeniaToday(dateKey)) return;

    setSelectedDate(dateKey);
    setSelectedTime("");
  };

  return {
    barberScheduleEntry,
    scheduleLoading,
    availabilityError,
    barberBookings,
    bookingsLoading,
    dateOptions,
    selectedBarberId,
    selectedBarberServices,
    selectedService,
    selectedDateLabel,
    selectedDateDayKey,
    nonWorkingDays,
    availableSlots,
    validSelectedTime,
    slotMessage,
    isSelectedDateNonWorking,
    isWeeklyDayOff,
    selectDate,
  };
}
