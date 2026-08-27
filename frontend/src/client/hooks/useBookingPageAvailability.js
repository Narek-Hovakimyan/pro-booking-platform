import { useEffect, useMemo } from "react";

import { getEffectiveDaySchedule } from "@/client/utils/bookingPageSchedule";
import { getSalonSlotAvailabilitySummary } from "@/shared/utils/slots";

const EMPTY_SLOT_SUMMARY = {
  availableSlots: [],
  blockedByTime: false,
  blockedByBooking: false,
};

export default function useBookingPageAvailability({
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
}) {
  const selectedOverride = barberScheduleOverrides[selectedDate];
  const selectedDaySchedule = useMemo(() => getEffectiveDaySchedule({
    selectedOverride,
    selectedDateDayKey,
    weeklySchedule: barberWeeklySchedule,
    scheduleEntry: barberScheduleEntry,
    defaultSchedule: barberDefaultSchedule,
  }), [
    barberDefaultSchedule,
    barberWeeklySchedule,
    barberScheduleEntry,
    selectedDateDayKey,
    selectedOverride,
  ]);
  const isWeeklyDayOff = !selectedDaySchedule?.working;
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

  return {
    availableSlots,
    isBarberNotWorking,
    isSelectedTimeValid: Boolean(selectedTime) && availableSlots.includes(selectedTime),
    selectedDaySchedule,
    slotMessage,
  };
}
