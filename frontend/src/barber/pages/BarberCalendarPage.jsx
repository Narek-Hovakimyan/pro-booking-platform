import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import CalendarMonthNav from "@/barber/components/calendar/CalendarMonthNav";
import CalendarGrid from "@/barber/components/calendar/CalendarGrid";
import WeeklyCalendarView from "@/barber/components/calendar/WeeklyCalendarView";
import { getSocket } from "@/shared/lib/socket";
import { fetchBarberBookings } from "@/store/slices/bookingsSlice";
import { formatDateKey } from "@/shared/utils/dates";
import {
  FALLBACK_DEFAULT_SCHEDULE,
  getMonthDays,
} from "@/barber/utils/calendarHelpers";

function getSundayOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

export default function BarberCalendarPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?.id || currentUser?._id;
  const bookings = useSelector((state) => state.bookings);
  const notifications = useSelector((state) => state.notifications);
  const schedule = useSelector((state) => state.schedule);
  const scheduleEntry = schedule[currentUserId];

  // Calendar navigation state
  const today = useMemo(() => new Date(), []);
  const [viewMode, setViewMode] = useState("month"); // "month" | "week"
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [weekStart, setWeekStart] = useState(() => getSundayOfWeek(new Date()));

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

  const barberDefaultSchedule =
    scheduleEntry?.defaultSchedule ||
    currentUser?.defaultSchedule ||
    FALLBACK_DEFAULT_SCHEDULE;

  const notificationCount = notifications.length;

  const fetchBookings = useCallback(
    async ({
      silent = false,
      clearError = !silent,
      shouldUpdate = () => true,
    } = {}) => {
      if (!currentUserId) return;

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

  // ─── Month navigation ───
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

  const goToTodayMonth = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
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
    navigate(`/admin/calendar/day/${dateStr}`);
  };

  const handleBookingClick = (booking) => {
    // Navigate to day detail page for this booking's date
    const date = booking.bookingDate;
    if (date) {
      navigate(`/admin/calendar/day/${date}`);
    }
  };

  // ─── View toggle button styles ───
  const viewToggleActive = "bg-neutral-900 text-white";
  const viewToggleInactive = "bg-white text-neutral-600 hover:bg-neutral-100";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Calendar</h1>
          <p className="mt-2 text-neutral-500">
            {viewMode === "month"
              ? "Pick a day to see your working timeline and bookings hour by hour."
              : "View your weekly schedule at a glance."}
          </p>
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg border border-neutral-200 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("month")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              viewMode === "month" ? viewToggleActive : viewToggleInactive
            }`}
          >
            Month
          </button>
          <button
            type="button"
            onClick={() => setViewMode("week")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              viewMode === "week" ? viewToggleActive : viewToggleInactive
            }`}
          >
            Week
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* ─── Month View ─── */}
      {viewMode === "month" && (
        <>
          <CalendarMonthNav
            monthLabel={monthLabel}
            onPrevMonth={goToPrevMonth}
            onNextMonth={goToNextMonth}
            onGoToToday={goToTodayMonth}
          />

          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            <p className="font-medium text-neutral-800">
              Click any day to open the full day timeline.
            </p>
            <p className="mt-1 text-neutral-500">
              Booking labels show the first appointments for each day.
            </p>
          </div>

          <CalendarGrid
            monthDays={monthDays}
            viewYear={viewYear}
            viewMonth={viewMonth}
            todayKey={todayKey}
            selectedDateKey=""
            bookingsByDate={bookingsByDate}
            scheduleEntry={scheduleEntry}
            barberDefaultSchedule={barberDefaultSchedule}
            onDayClick={handleDayClick}
          />
        </>
      )}

      {/* ─── Week View ─── */}
      {viewMode === "week" && (
        <WeeklyCalendarView
          weekStart={weekStart}
          bookings={barberBookings}
          scheduleEntry={scheduleEntry}
          barberDefaultSchedule={barberDefaultSchedule}
          onWeekChange={setWeekStart}
          onBookingClick={handleBookingClick}
        />
      )}
    </div>
  );
}
