import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate, useParams } from "react-router-dom";

import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import RejectBookingModal from "@/barber/components/RejectBookingModal";
import DayTimelineView from "@/barber/components/calendar/DayTimelineView";
import { getSocket } from "@/shared/lib/socket";
import {
  fetchBarberBookings,
  updateBooking,
} from "@/store/slices/bookingsSlice";
import { formatDateKey, isDateKey, parseDateKey } from "@/shared/utils/dates";
import {
  FALLBACK_DEFAULT_SCHEDULE,
  getBookingId,
  getBookingTime,
  getEffectiveDaySchedule,
} from "@/barber/utils/calendarHelpers";

function addDays(dateKey, offset) {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  date.setDate(date.getDate() + offset);
  return formatDateKey(date);
}

export default function BarberCalendarDayPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { date: routeDate } = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [rejectingBooking, setRejectingBooking] = useState(null);
  const [isRejectingBooking, setIsRejectingBooking] = useState(false);
  const [rejectionError, setRejectionError] = useState("");
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?.id || currentUser?._id;
  const bookings = useSelector((state) => state.bookings);
  const schedule = useSelector((state) => state.schedule);
  const scheduleEntry = schedule[currentUserId];

  // Validate the date parameter
  const isValidDate = isDateKey(routeDate);
  const dateObject = useMemo(
    () => (isValidDate ? parseDateKey(routeDate) : null),
    [isValidDate, routeDate]
  );

  const todayKey = useMemo(() => formatDateKey(new Date()), []);

  const barberBookings = useMemo(
    () =>
      (bookings || []).filter(
        (booking) => String(booking.barberId) === String(currentUserId)
      ),
    [bookings, currentUserId]
  );

  // Filter bookings for the route date only
  const dayBookings = useMemo(
    () =>
      (barberBookings.filter((b) => b.bookingDate === routeDate) || []).sort(
        (a, b) => getBookingTime(a).localeCompare(getBookingTime(b))
      ),
    [barberBookings, routeDate]
  );

  const barberDefaultSchedule =
    scheduleEntry?.defaultSchedule ||
    currentUser?.defaultSchedule ||
    FALLBACK_DEFAULT_SCHEDULE;

  const { selectedDaySchedule, isNonWorkingDay } = useMemo(
    () =>
      isValidDate && routeDate
        ? getEffectiveDaySchedule(scheduleEntry, routeDate, barberDefaultSchedule)
        : { selectedDaySchedule: null, isNonWorkingDay: false },
    [barberDefaultSchedule, scheduleEntry, isValidDate, routeDate]
  );

  const fetchBookings = useCallback(
    async ({
      showLoading = false,
      silent = false,
      clearError = !silent,
      shouldUpdate = () => true,
    } = {}) => {
      if (!currentUserId) return;

      if (showLoading && shouldUpdate()) setIsLoading(true);
      if (clearError && shouldUpdate()) setError("");

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
        if (shouldUpdate()) setIsLoading(false);
      }
    },
    [currentUserId, dispatch]
  );

  useEffect(() => {
    if (!currentUserId) return undefined;

    let isMounted = true;
    const shouldUpdate = () => isMounted;

    const timer = setTimeout(() => {
      fetchBookings({ clearError: false, shouldUpdate });
    }, 0);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [currentUserId, fetchBookings]);

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

  // --- Invalid date state ---
  if (!isValidDate || !routeDate) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Calendar</h1>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center sm:rounded-3xl">
          <p className="text-lg font-semibold text-neutral-900">Invalid calendar date</p>
          <p className="mt-2 text-sm text-neutral-500">
            The date "{routeDate}" is not a valid date format. Dates must be YYYY-MM-DD.
          </p>
          <Link
            to="/admin/calendar"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back to month calendar
          </Link>
        </div>
      </div>
    );
  }

  // --- Valid date state ---
  const prevDate = addDays(routeDate, -1);
  const nextDate = addDays(routeDate, 1);

  const dateLabel = dateObject.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  let workingHoursLabel = "No schedule set";
  if (isNonWorkingDay) {
    workingHoursLabel = "Non-working day";
  } else if (selectedDaySchedule?.from && selectedDaySchedule?.to) {
    workingHoursLabel = `${selectedDaySchedule.from} - ${selectedDaySchedule.to}`;
  } else if (selectedDaySchedule?.working) {
    workingHoursLabel = "No schedule set";
  }

  const handleDateInputChange = (event) => {
    const val = event.target.value;
    if (isDateKey(val)) {
      navigate(`/admin/calendar/day/${val}`);
    }
  };

  const handleAccept = (booking) => updateBookingStatus(booking, "accepted");
  const handleReject = (booking) => openRejectBookingModal(booking);
  const handleComplete = (booking) => updateBookingStatus(booking, "completed");

  return (
    <div className="space-y-5">
      {/* Back to month calendar */}
      <div>
        <Link
          to="/admin/calendar"
          className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to month calendar
        </Link>
      </div>

      {/* Day navigation */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {dateLabel}
            {routeDate === todayKey && (
              <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 align-middle">
                Today
              </span>
            )}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-neutral-500">
            <span className="rounded-full bg-neutral-100 px-3 py-1">
              Working hours: {workingHoursLabel}
            </span>
            {selectedDaySchedule?.breakFrom && selectedDaySchedule?.breakTo && (
              <span className="rounded-full bg-neutral-100 px-3 py-1">
                Break: {selectedDaySchedule.breakFrom} - {selectedDaySchedule.breakTo}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Previous day */}
          <Link
            to={`/admin/calendar/day/${prevDate}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>

          {/* Today */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/admin/calendar/day/${todayKey}`)}
          >
            Today
          </Button>

          {/* Next day */}
          <Link
            to={`/admin/calendar/day/${nextDate}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>

          {/* Date input */}
          <label className="sr-only" htmlFor="day-date-input">Select date</label>
          <input
            id="day-date-input"
            type="date"
            className="h-9 rounded-xl border border-neutral-200 bg-white px-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-400"
            value={routeDate}
            onChange={handleDateInputChange}
          />
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* New Google Calendar-style day timeline */}
      <DayTimelineView
        dateKey={routeDate}
        isNonWorkingDay={isNonWorkingDay}
        bookings={dayBookings}
        isLoading={isLoading}
        selectedDaySchedule={selectedDaySchedule}
        onAccept={handleAccept}
        onReject={handleReject}
        onComplete={handleComplete}
        onNoShow={updateBookingNoShow}
        onLateCancel={updateBookingLateCancel}
      />

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
