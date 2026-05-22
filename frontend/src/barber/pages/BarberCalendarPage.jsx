import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import api from "@/shared/api/axios";
import { Card, CardContent } from "@/shared/components/ui/card";
import RejectBookingModal from "@/barber/components/RejectBookingModal";
import CalendarTimeline from "@/barber/components/calendar/CalendarTimeline";
import CalendarMonthNav from "@/barber/components/calendar/CalendarMonthNav";
import CalendarGrid from "@/barber/components/calendar/CalendarGrid";
import CalendarDayDetailHeader from "@/barber/components/calendar/CalendarDayDetailHeader";
import { getSocket } from "@/shared/lib/socket";
import {
  fetchBarberBookings,
  updateBooking,
} from "@/store/slices/bookingsSlice";
import { formatDateKey, getDayKeyFromDate, parseDateKey } from "@/shared/utils/dates";
import { minutesToTime, timeToMinutes } from "@/shared/utils/time";
import {
  FALLBACK_DEFAULT_SCHEDULE,
  TIMELINE_INTERVAL_MINUTES,
  getBookingId,
  getBookingTime,
  getBookingDuration,
  getBookingStatus,
  getEffectiveDaySchedule,
  getTimelineRowType,
  getMonthDays,
} from "@/barber/utils/calendarHelpers";

export default function BarberCalendarPage() {
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [rejectingBooking, setRejectingBooking] = useState(null);
  const [isRejectingBooking, setIsRejectingBooking] = useState(false);
  const [rejectionError, setRejectionError] = useState("");
  const [showFullTimeline, setShowFullTimeline] = useState(false);
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?.id || currentUser?._id;
  const bookings = useSelector((state) => state.bookings);
  const notifications = useSelector((state) => state.notifications);
  const schedule = useSelector((state) => state.schedule);
  const scheduleEntry = schedule[currentUserId];

  // Calendar navigation state
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState(formatDateKey(today));

  const barberBookings = useMemo(
    () =>
      (bookings || []).filter(
        (booking) => String(booking.barberId) === String(currentUserId)
      ),
    [bookings, currentUserId]
  );

  // Group bookings by date for the visible month
  const bookingsByDate = useMemo(() => {
    const map = {};
    for (const b of barberBookings) {
      const date = b.bookingDate;
      if (!date) continue;
      if (!map[date]) map[date] = [];
      map[date].push(b);
    }
    return map;
  }, [barberBookings]);

  // Bookings for the selected day
  const selectedBookings = useMemo(
    () =>
      (bookingsByDate[selectedDateKey] || []).sort((a, b) =>
        getBookingTime(a).localeCompare(getBookingTime(b))
      ),
    [bookingsByDate, selectedDateKey]
  );

  const selectedDateObject = useMemo(
    () => parseDateKey(selectedDateKey) || today,
    [selectedDateKey, today]
  );

  const barberDefaultSchedule =
    scheduleEntry?.defaultSchedule ||
    currentUser?.defaultSchedule ||
    FALLBACK_DEFAULT_SCHEDULE;
  const { selectedDaySchedule, isNonWorkingDay } = useMemo(
    () =>
      getEffectiveDaySchedule(
        scheduleEntry,
        selectedDateKey,
        barberDefaultSchedule
      ),
    [barberDefaultSchedule, scheduleEntry, selectedDateKey]
  );

  const timelineRows = useMemo(() => {
    if (isNonWorkingDay) return [];

    const startMinutes = timeToMinutes(selectedDaySchedule?.from || "09:00");
    const endMinutes = timeToMinutes(selectedDaySchedule?.to || "18:00");
    const breakStartMinutes = timeToMinutes(selectedDaySchedule?.breakFrom || "");
    const breakEndMinutes = timeToMinutes(selectedDaySchedule?.breakTo || "");

    if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
      return [];
    }

    const normalizedBookings = selectedBookings
      .map((booking) => {
        const startTime = getBookingTime(booking);
        const bookingStartMinutes = timeToMinutes(startTime);
        const duration = getBookingDuration(booking);

        if (bookingStartMinutes === null) return null;

        return {
          booking,
          id: String(getBookingId(booking)),
          startTime,
          startMinutes: bookingStartMinutes,
          endMinutes: bookingStartMinutes + duration,
          duration,
          status: getBookingStatus(booking),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.startMinutes - b.startMinutes);

    return Array.from(
      { length: Math.ceil((endMinutes - startMinutes) / TIMELINE_INTERVAL_MINUTES) },
      (_, index) => {
        const slotMinutes = startMinutes + index * TIMELINE_INTERVAL_MINUTES;
        const slotTime = minutesToTime(slotMinutes);
        const bookingStartingAtSlot =
          normalizedBookings.find((entry) => entry.startMinutes === slotMinutes) || null;
        const overlappingBooking =
          normalizedBookings.find(
            (entry) =>
              slotMinutes >= entry.startMinutes && slotMinutes < entry.endMinutes
          ) || null;

        return {
          slotTime,
          slotMinutes,
          rowType: getTimelineRowType({
            slotMinutes,
            breakStartMinutes,
            breakEndMinutes,
            bookingStartingAtSlot,
            overlappingBooking,
          }),
          bookingEntry: bookingStartingAtSlot,
          overlappingBooking,
          breakRange:
            breakStartMinutes !== null && breakEndMinutes !== null
              ? `${minutesToTime(breakStartMinutes)} - ${minutesToTime(breakEndMinutes)}`
              : "",
        };
      }
    );
  }, [isNonWorkingDay, selectedBookings, selectedDaySchedule]);

  const notificationCount = notifications.length;

  const fetchBookings = useCallback(
    async ({
      showLoading = false,
      silent = false,
      clearError = !silent,
      shouldUpdate = () => true,
    } = {}) => {
      if (!currentUserId) return;

      if (showLoading && shouldUpdate()) {
        setIsLoading(true);
      }
      if (clearError && shouldUpdate()) {
        setError("");
      }

      try {
        await dispatch(fetchBarberBookings(currentUserId));
      } catch (requestError) {
        if (shouldUpdate() && !silent) {
          setError(
            requestError.response?.data?.message ||
              "Could not load bookings. Please try again."
          );
        }
      } finally {
        if (shouldUpdate()) {
          setIsLoading(false);
        }
      }
    },
    [currentUserId, dispatch]
  );

  useEffect(() => {
    if (!currentUserId) return undefined;

    let isMounted = true;
    const shouldUpdate = () => isMounted;

    const immediateFetchId = setTimeout(() => {
      fetchBookings({ clearError: false, shouldUpdate });
    }, 0);

    return () => {
      isMounted = false;
      clearTimeout(immediateFetchId);
    };
  }, [currentUserId, fetchBookings, notificationCount]);

  // Socket listener for real-time booking updates
  useEffect(() => {
    if (!currentUserId) return;

    const socket = getSocket();
    if (!socket) return;

    const handleBookingUpdated = (data) => {
      const bookingBarberId = data.booking.barberId || data.booking.barber?._id;
      if (String(bookingBarberId) === String(currentUserId)) {
        fetchBookings({ silent: true });
      }
    };

    socket.on("bookingUpdated", handleBookingUpdated);

    return () => {
      socket.off("bookingUpdated", handleBookingUpdated);
    };
  }, [currentUserId, fetchBookings]);

  const updateBookingNoShow = async (booking) => {
    if (!window.confirm("Mark this booking as no-show? This cannot be undone.")) return;
    setError("");

    try {
      const bookingId = getBookingId(booking);
      const { data } = await api.patch(`/bookings/${bookingId}/no-show`);
      dispatch(updateBooking(data));
      await fetchBookings({ silent: true });
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not mark no-show. Please try again."
      );
    }
  };

  const updateBookingLateCancel = async (booking) => {
    if (!window.confirm("Mark this booking as late cancellation? This cannot be undone.")) return;
    setError("");

    try {
      const bookingId = getBookingId(booking);
      const { data } = await api.patch(`/bookings/${bookingId}/late-cancel`);
      dispatch(updateBooking(data));
      await fetchBookings({ silent: true });
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not mark late cancellation. Please try again."
      );
    }
  };

  const updateBookingStatus = async (booking, status) => {
    setError("");

    try {
      const bookingId = getBookingId(booking);
      const { data } = await api.put(`/bookings/${bookingId}`, { status });
      dispatch(updateBooking(data));
      await fetchBookings({ silent: true });
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not update booking. Please try again."
      );
    }
  };

  const openRejectBookingModal = (booking) => {
    setRejectingBooking(booking);
    setRejectionError("");
    setError("");
  };

  const rejectBooking = async ({ rejectionReason }) => {
    if (!rejectingBooking || isRejectingBooking) return;

    setRejectionError("");
    setIsRejectingBooking(true);

    try {
      const { data } = await api.put(`/bookings/${getBookingId(rejectingBooking)}`, {
        status: "rejected",
        rejectionReason,
      });
      dispatch(updateBooking(data));
      await fetchBookings({ silent: true });
      setRejectingBooking(null);
    } catch (requestError) {
      setRejectionError(
        requestError.response?.data?.message ||
          "Could not reject booking. Please try again."
      );
    } finally {
      setIsRejectingBooking(false);
    }
  };

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const goToToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDateKey(formatDateKey(now));
  };

  const monthDays = useMemo(
    () => getMonthDays(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const todayKey = formatDateKey(today);

  const handleDayClick = (dateStr) => {
    setSelectedDateKey(dateStr);
  };

  const handleDateChange = (nextDateKey) => {
    const parsedDate = parseDateKey(nextDateKey);
    if (!parsedDate) return;
    setViewYear(parsedDate.getFullYear());
    setViewMonth(parsedDate.getMonth());
    setSelectedDateKey(nextDateKey);
  };

  const selectedDateLabel = useMemo(() => {
    return selectedDateObject.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [selectedDateObject]);

  const selectedDateDayKey = getDayKeyFromDate(selectedDateObject);
  const workingHoursLabel = selectedDaySchedule?.from && selectedDaySchedule?.to
    ? `${selectedDaySchedule.from} - ${selectedDaySchedule.to}`
    : "09:00 - 18:00";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Calendar</h1>
        <p className="mt-2 text-neutral-500">
          Pick a day to see your working timeline and bookings hour by hour.
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <CalendarMonthNav
        monthLabel={monthLabel}
        onPrevMonth={goToPrevMonth}
        onNextMonth={goToNextMonth}
        onGoToToday={goToToday}
      />

      <CalendarGrid
        monthDays={monthDays}
        viewYear={viewYear}
        viewMonth={viewMonth}
        todayKey={todayKey}
        selectedDateKey={selectedDateKey}
        bookingsByDate={bookingsByDate}
        scheduleEntry={scheduleEntry}
        barberDefaultSchedule={barberDefaultSchedule}
        onDayClick={handleDayClick}
      />

      <Card className="rounded-2xl sm:rounded-3xl">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <CalendarDayDetailHeader
            selectedDateLabel={selectedDateLabel}
            selectedDateDayKey={selectedDateDayKey}
            selectedDateKey={selectedDateKey}
            workingHoursLabel={workingHoursLabel}
            breakFrom={selectedDaySchedule?.breakFrom}
            breakTo={selectedDaySchedule?.breakTo}
            onDateChange={handleDateChange}
          />

          <CalendarTimeline
            timelineRows={timelineRows}
            isLoading={isLoading && selectedBookings.length === 0}
            isNonWorkingDay={isNonWorkingDay}
            isEmpty={!isLoading && !isNonWorkingDay && selectedBookings.length === 0}
            showFullTimeline={showFullTimeline}
            onToggleFullTimeline={() => setShowFullTimeline((prev) => !prev)}
            onAccept={(booking) => updateBookingStatus(booking, "accepted")}
            onReject={(booking) => openRejectBookingModal(booking)}
            onComplete={(booking) => updateBookingStatus(booking, "completed")}
            onNoShow={(booking) => updateBookingNoShow(booking)}
            onLateCancel={(booking) => updateBookingLateCancel(booking)}
          />
        </CardContent>
      </Card>

      {rejectingBooking && (
        <RejectBookingModal
          booking={rejectingBooking}
          error={rejectionError}
          isSubmitting={isRejectingBooking}
          onClose={() => setRejectingBooking(null)}
          onSubmit={rejectBooking}
        />
      )}
    </div>
  );
}
