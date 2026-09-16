import { useMemo } from "react";

import {
  getBookingScheduleEntry,
  getDefaultSchedule,
  getScheduleOverrides,
  getWeeklySchedule,
} from "@/client/utils/bookingPageSchedule";
import {
  formatArmeniaDateLabel,
  getArmeniaDayKey,
  getNext7ArmeniaDays,
  isDateKey,
} from "@/shared/utils/dates";

const EMPTY_NON_WORKING_DAYS = [];

export default function useBookingPageDerivedState({
  barber,
  barberId,
  bookings,
  schedule,
  selectedDate,
  selectedServiceId,
  services,
}) {
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
  const selectedService =
    barberServices.find(
      (service) => String(service?.id || service?._id) === String(selectedServiceId)
    ) || null;
  const barberScheduleEntry = useMemo(
    () =>
      getBookingScheduleEntry({
        schedule,
        barberId,
        barberDefaultSchedule: barber?.defaultSchedule,
      }),
    [barber?.defaultSchedule, barberId, schedule]
  );
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

  return {
    barberBookings,
    barberDefaultSchedule,
    barberScheduleEntry,
    barberScheduleOverrides,
    barberServices,
    barberWeeklySchedule,
    dateOptions,
    nonWorkingDays,
    selectedDateLabel: selectedDateOption?.label || "",
    selectedDateOption,
    selectedService,
  };
}
