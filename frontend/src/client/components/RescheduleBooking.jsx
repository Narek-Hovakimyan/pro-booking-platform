import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";
import initialSchedule, {
  defaultPersonalSchedule,
  getDayScheduleFromDefaultSchedule,
} from "@/shared/data/schedule";
import {
  fetchBarberBookings,
  fetchClientBookings,
  updateBooking,
} from "@/store/slices/bookingsSlice";
import {
  getBookingId,
  getBookingSalonId,
} from "@/client/utils/bookingStatusUtils";
import {
  formatDateKey,
  formatDateLabel,
  getDayKeyFromDate,
  getNext7Days,
  parseDateKey,
} from "@/shared/utils/dates";
import { getSlotAvailabilitySummary } from "@/shared/utils/slots";
import { timeToMinutes } from "@/shared/utils/time";

const EMPTY_SLOT_SUMMARY = {
  availableSlots: [],
  blockedByTime: false,
  blockedByBooking: false,
};

const createInitialRescheduleSchedule = (barber) => ({
  weeklySchedule: initialSchedule,
  dateSchedules: {},
  scheduleOverrides: {},
  defaultSchedule: barber?.defaultSchedule || defaultPersonalSchedule,
  nonWorkingDays: [],
});

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

export default function RescheduleBooking({ booking, onClose }) {
  const dispatch = useDispatch();
  const dateOptions = useMemo(() => getNext7Days(), []);
  const [selectedDate, setSelectedDate] = useState(
    booking.bookingDate || dateOptions[0].value
  );
  const [time, setTime] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const bookings = useSelector((state) => state.bookings);
  const users = useSelector((state) => state.users);
  const barber = users.find(
    (user) => user.role === "barber" && String(user.id) === String(booking.barberId)
  );
  const bookingId = getBookingId(booking);
  const originalSalonId = getBookingSalonId(booking);
  const [rescheduleSchedule, setRescheduleSchedule] = useState(() =>
    createInitialRescheduleSchedule(barber)
  );
  const barberScheduleOverrides = rescheduleSchedule.scheduleOverrides || {};
  const barberWeeklySchedule = rescheduleSchedule.weeklySchedule || {};
  const barberDefaultSchedule =
    rescheduleSchedule.defaultSchedule ||
    barber?.defaultSchedule ||
    defaultPersonalSchedule;
  const nonWorkingDays = rescheduleSchedule.nonWorkingDays || [];
  const selectedDateObject = parseDateKey(selectedDate);
  const selectedDayKey = selectedDateObject
    ? getDayKeyFromDate(selectedDateObject)
    : booking.dayKey;
  const selectedDateLabel = selectedDateObject
    ? formatDateLabel(selectedDateObject)
    : selectedDate;
  const selectedOverride = barberScheduleOverrides[selectedDate];
  const weeklyDaySchedule = barberWeeklySchedule[selectedDayKey];
  const explicitWeeklyDayOff = getExplicitWeeklyDayOff(weeklyDaySchedule);
  const selectedDaySchedule = selectedOverride
    ? {
        working: Boolean(selectedOverride.isWorking),
        from: selectedOverride.startTime || "",
        to: selectedOverride.endTime || "",
        breakFrom: selectedOverride.breakStart || "",
        breakTo: selectedOverride.breakEnd || "",
      }
    : explicitWeeklyDayOff
      ? explicitWeeklyDayOff
      : isMeaningfulWeeklyDay(weeklyDaySchedule)
      ? weeklyDaySchedule
      : getDayScheduleFromDefaultSchedule(barberDefaultSchedule);
  const isBarberNotWorking =
    nonWorkingDays.includes(selectedDate) || !selectedDaySchedule?.working;
  const barberBookings = bookings
    .filter((item) => String(item.barberId) === String(booking.barberId))
    .map((item) =>
      bookingId && getBookingId(item) === bookingId
        ? { ...item, id: bookingId }
        : item
    );
  const slotSummary = !isBarberNotWorking
    ? getSlotAvailabilitySummary(
        selectedDaySchedule,
        Number(booking.duration),
        barberBookings,
        selectedDayKey,
        { selectedDate, ignoreBookingId: bookingId }
      )
    : EMPTY_SLOT_SUMMARY;
  const availableSlots = slotSummary.availableSlots;
  const slotMessage = isBarberNotWorking
    ? "Specialist is not working this day"
    : slotSummary.blockedByTime
      ? "Not enough time for selected service"
      : slotSummary.blockedByBooking
        ? "This time is already booked"
        : "No available slots";
  const todayKey = formatDateKey(new Date());

  useEffect(() => {
    let isMounted = true;

    async function loadScheduleAndBookings() {
      setIsLoading(true);
      setError("");

      try {
        // Reschedule keeps the original booking salon; changing salon is out of scope.
        const scheduleUrl = originalSalonId
          ? `/schedules/${booking.barberId}/${originalSalonId}`
          : `/schedules/${booking.barberId}`;
        const [scheduleResponse] = await Promise.all([
          api.get(scheduleUrl),
          dispatch(fetchBarberBookings(booking.barberId)),
        ]);

        if (isMounted) {
          setRescheduleSchedule({
            weeklySchedule: scheduleResponse.data?.weeklySchedule || initialSchedule,
            dateSchedules: scheduleResponse.data?.dateSchedules || {},
            scheduleOverrides: scheduleResponse.data?.scheduleOverrides || {},
            defaultSchedule:
              scheduleResponse.data?.defaultSchedule ||
              barber?.defaultSchedule ||
              defaultPersonalSchedule,
            nonWorkingDays: scheduleResponse.data?.nonWorkingDays || [],
          });
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Could not load available times. Please try again."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadScheduleAndBookings();

    return () => {
      isMounted = false;
    };
  }, [barber?.defaultSchedule, booking.barberId, dispatch, originalSalonId]);

  const selectDate = (dateKey) => {
    if (!parseDateKey(dateKey) || dateKey < todayKey) return;

    setSelectedDate(dateKey);
    setTime("");
  };

  const saveBookingTime = async () => {
    setIsSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      const { data } = await api.post(`/bookings/${bookingId}/reschedule-request`, {
        bookingDate: selectedDate,
        dayKey: selectedDayKey,
        time,
      });

      dispatch(updateBooking(data));
      await Promise.all([
        dispatch(fetchClientBookings(booking.clientId)),
        dispatch(fetchBarberBookings(booking.barberId)),
      ]);
      setSuccessMessage(
        "Reschedule request sent. The professional will approve or reject it."
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not send reschedule request. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-xl space-y-5 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:rounded-3xl sm:p-6">
        <div>
          <h2 className="text-xl font-bold sm:text-2xl">Reschedule booking</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Choose a new date and available time to request.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {dateOptions.map((day) => (
            <Button
              className="flex-1 sm:flex-none"
              key={day.value}
              onClick={() => {
                selectDate(day.value);
              }}
              variant={selectedDate === day.value ? "default" : "outline"}
            >
              {day.label}
            </Button>
          ))}
        </div>

        <label className="grid gap-2 text-sm font-semibold sm:max-w-xs">
          Choose another date
          <input
            className="rounded-2xl border p-3 font-normal"
            min={todayKey}
            type="date"
            value={selectedDate}
            onChange={(event) => selectDate(event.target.value)}
          />
        </label>

        <p className="text-sm font-medium text-neutral-600">{selectedDateLabel}</p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {isLoading ? (
            <p className="col-span-full text-sm text-neutral-500">
              Loading available slots...
            </p>
          ) : availableSlots.length > 0 ? (
            availableSlots.map((slot) => (
              <Button
                key={slot}
                onClick={() => setTime(slot)}
                variant={time === slot ? "default" : "outline"}
              >
                {slot}
              </Button>
            ))
          ) : (
            <p className="col-span-full rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-sm text-neutral-500">
              {slotMessage}
            </p>
          )}
        </div>

        <div className="grid gap-2 sm:flex">
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {successMessage && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {successMessage}
            </p>
          )}
          <Button
            className="w-full sm:w-auto"
            disabled={
              !time ||
              !availableSlots.includes(time) ||
              isSaving ||
              Boolean(successMessage)
            }
            onClick={saveBookingTime}
          >
            {isSaving ? "Sending..." : "Send reschedule request"}
          </Button>
          <Button className="w-full sm:w-auto" onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
