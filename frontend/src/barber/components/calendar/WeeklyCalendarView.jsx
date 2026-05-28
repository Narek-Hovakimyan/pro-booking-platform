import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { timeToMinutes, minutesToTime } from "@/shared/utils/time";
import { formatDateKey } from "@/shared/utils/dates";
import {
  getBookingId,
  getBookingTime,
  getBookingDuration,
  getBookingServiceName,
  getClientName,
  getEffectiveDaySchedule,
  getVisibleTimeRange,
  FALLBACK_DEFAULT_SCHEDULE,
} from "@/barber/utils/calendarHelpers";

// ─── Constants ───

const HOUR_HEIGHT_PX = 60;

// ─── Helpers ───

function getSundayOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function formatWeekLabel(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);

  const opts = { month: "short", day: "numeric" };
  const yearOpts = { year: "numeric", ...opts };
  const startStr = start.toLocaleDateString("en-US", opts);
  const endStr = end.toLocaleDateString("en-US", start.getFullYear() !== end.getFullYear() ? yearOpts : opts);

  return `${startStr} – ${endStr}`;
}

function isSameDay(dateA, dateB) {
  return formatDateKey(dateA) === formatDateKey(dateB);
}

function getBookingBlockColor(status) {
  switch (status) {
    case "pending":
      return "bg-amber-50 border-amber-300 text-amber-900";
    case "accepted":
      return "bg-emerald-50 border-emerald-400 text-emerald-900";
    case "completed":
      return "bg-blue-50 border-blue-400 text-blue-900";
    case "rejected":
    case "cancelled":
    case "expired":
      return "bg-neutral-100 border-neutral-300 text-neutral-500 line-through";
    case "no_show":
    case "late_cancelled":
      return "bg-red-50 border-red-300 text-red-800";
    default:
      return "bg-neutral-50 border-neutral-300 text-neutral-700";
  }
}

function getLeftBarColor(status) {
  switch (status) {
    case "pending":
      return "bg-amber-400";
    case "accepted":
      return "bg-emerald-500";
    case "completed":
      return "bg-blue-500";
    case "rejected":
    case "cancelled":
    case "expired":
    case "no_show":
    case "late_cancelled":
      return "bg-neutral-400";
    default:
      return "bg-neutral-300";
  }
}

// ─── Overlap grouping ───

function groupOverlappingBookings(bookings) {
  if (bookings.length === 0) return [];

  const sorted = [...bookings].sort((a, b) => {
    const aMin = timeToMinutes(getBookingTime(a)) ?? 0;
    const bMin = timeToMinutes(getBookingTime(b)) ?? 0;
    return aMin - bMin;
  });

  const groups = [];
  for (const booking of sorted) {
    const bookingStart = timeToMinutes(getBookingTime(booking)) ?? 0;
    const bookingEnd = bookingStart + getBookingDuration(booking);

    let placed = false;
    for (const group of groups) {
      const overlaps = group.some((existing) => {
        const existingStart = timeToMinutes(getBookingTime(existing)) ?? 0;
        const existingEnd = existingStart + getBookingDuration(existing);
        return bookingStart < existingEnd && bookingEnd > existingStart;
      });

      if (!overlaps) {
        group.push(booking);
        placed = true;
        break;
      }
    }

    if (!placed) {
      groups.push([booking]);
    }
  }

  return groups;
}

// ─── Sub-component: Time gutter ───

function TimeGutter({ rangeStart, rangeEnd, rangeHours }) {
  return (
    <div className="relative col-span-1 w-14 shrink-0 border-r border-neutral-200">
      <div className="h-10" /> {/* Header spacer */}
      <div className="relative" style={{ height: `${rangeHours * HOUR_HEIGHT_PX}px` }}>
        {Array.from({ length: rangeHours + 1 }, (_, i) => {
          const hourMin = rangeStart + i * 60;
          if (hourMin > rangeEnd) return null;
          return (
            <div
              key={hourMin}
              className="absolute left-0 right-0 flex items-start justify-end pr-2 text-xs text-neutral-400"
              style={{ top: `${i * HOUR_HEIGHT_PX}px`, height: `${HOUR_HEIGHT_PX}px` }}
            >
              <span className="-mt-2">{minutesToTime(hourMin)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sub-component: Day column ───

function DayColumn({
  date,
  isCurrentDay,
  isNonWorking,
  bookings,
  onBookingClick,
  rangeStart,
  rangeHours,
}) {
  const navigate = useNavigate();

  // Group overlapping bookings
  const overlapGroups = useMemo(() => groupOverlappingBookings(bookings), [bookings]);

  return (
    <div
      className={`relative flex-1 min-w-0 border-r border-neutral-200 last:border-r-0 ${
        isCurrentDay ? "bg-blue-50/30" : ""
      } ${isNonWorking ? "bg-neutral-50" : "bg-white"}`}
    >
      {/* Column header */}
      <div
        className={`sticky top-0 z-10 h-10 border-b border-neutral-200 px-1 py-1 text-center ${
          isCurrentDay ? "bg-blue-50" : "bg-white"
        }`}
      >
        <div className="text-[10px] font-medium uppercase leading-tight text-neutral-500">
          {date.toLocaleDateString("en-US", { weekday: "short" })}
        </div>
        <div
          className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
            isCurrentDay
              ? "bg-neutral-900 text-white"
              : "text-neutral-800"
          }`}
        >
          {date.getDate()}
        </div>
      </div>

      {/* Time slots area */}
      <div className="relative" style={{ height: `${rangeHours * HOUR_HEIGHT_PX}px` }}>
        {/* Hour grid lines */}
        {Array.from({ length: rangeHours + 1 }, (_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 border-t border-neutral-100"
            style={{ top: `${i * HOUR_HEIGHT_PX}px` }}
          />
        ))}

        {/* Half-hour grid lines */}
        {Array.from({ length: rangeHours }, (_, i) => (
          <div
            key={`half-${i}`}
            className="absolute left-0 right-0 border-t border-dashed border-neutral-50"
            style={{ top: `${(i + 0.5) * HOUR_HEIGHT_PX}px` }}
          />
        ))}

        {/* Non-working overlay */}
        {isNonWorking && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-neutral-200 px-3 py-1 text-[10px] font-medium text-neutral-500">
              Closed
            </span>
          </div>
        )}

        {/* Booking blocks */}
        {!isNonWorking && overlapGroups.length > 0 && (
          <div className="absolute inset-0">
            {overlapGroups.map((group, groupIdx) => {
              const subCount = overlapGroups.length;
              const subWidth = subCount > 1 ? `${100 / subCount}%` : "100%";
              const subLeft = groupIdx === 0 ? "0" : `${(groupIdx / subCount) * 100}%`;

              return (
                <div
                  key={`group-${groupIdx}`}
                  className="absolute top-0 h-full px-0.5"
                  style={{
                    left: subLeft,
                    width: subWidth,
                    zIndex: 10 + groupIdx,
                  }}
                >
                  {group.map((booking) => {
                    const time = getBookingTime(booking);
                    const duration = getBookingDuration(booking);
                    const startMinutes = timeToMinutes(time);

                    if (startMinutes === null || !Number.isFinite(duration) || duration <= 0) return null;

                    const top = Math.max(0, startMinutes - rangeStart);
                    const height = Math.max(20, Math.round(duration));

                    const status = booking?.status || "pending";
                    const blockColor = getBookingBlockColor(status);
                    const leftBarColor = getLeftBarColor(status);
                    const clientName = getClientName(booking);
                    const serviceName = getBookingServiceName(booking);

                    return (
                      <button
                        key={getBookingId(booking)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onBookingClick ? onBookingClick(booking) : navigate(`/admin/calendar/day/${formatDateKey(date)}`);
                        }}
                        title={`${clientName} - ${serviceName} ${time}`}
                        className={`absolute left-0 right-0 overflow-hidden rounded-md border text-left text-[10px] leading-tight shadow-sm transition-all hover:shadow-md hover:brightness-95 active:brightness-90 ${blockColor}`}
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          minHeight: "20px",
                          zIndex: 20,
                        }}
                      >
                        {/* Left status bar */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${leftBarColor}`} />

                        <div className="ml-1.5 p-0.5">
                          <div className="truncate font-semibold text-neutral-900">
                            {clientName}
                          </div>
                          <div className="truncate text-neutral-600">
                            {serviceName}
                          </div>
                          <div className="text-neutral-500">
                            {time}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───

export default function WeeklyCalendarView({
  weekStart,
  bookings = [],
  scheduleEntry,
  barberDefaultSchedule,
  onWeekChange,
  onBookingClick,
}) {
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekLabel = useMemo(() => formatWeekLabel(weekStart), [weekStart]);

  // Group bookings by date for the visible week
  const bookingsByDate = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      const date = b.bookingDate;
      if (!date) continue;
      if (!map[date]) map[date] = [];
      map[date].push(b);
    }
    return map;
  }, [bookings]);

  // Filter to only this week's dates
  const weekDateStrs = useMemo(
    () => weekDays.map((d) => formatDateKey(d)),
    [weekDays]
  );

  const weekBookingsByDate = useMemo(() => {
    const map = {};
    for (const dateStr of weekDateStrs) {
      map[dateStr] = bookingsByDate[dateStr] || [];
    }
    return map;
  }, [bookingsByDate, weekDateStrs]);

  // Get schedule for each day
  const effectiveBarberSchedule = barberDefaultSchedule || FALLBACK_DEFAULT_SCHEDULE;

  const dayScheduleMap = useMemo(() => {
    const map = {};
    for (const dateStr of weekDateStrs) {
      map[dateStr] = getEffectiveDaySchedule(scheduleEntry, dateStr, effectiveBarberSchedule);
    }
    return map;
  }, [scheduleEntry, weekDateStrs, effectiveBarberSchedule]);

  // ─── Compute dynamic visible time range from all 7 day schedules + all week bookings ───
  const weekRange = useMemo(() => {
    // Collect all day schedules (only working days)
    const schedules = [];
    for (const dateStr of weekDateStrs) {
      const entry = dayScheduleMap[dateStr];
      if (entry && !entry.isNonWorkingDay && entry.selectedDaySchedule?.from && entry.selectedDaySchedule?.to) {
        schedules.push(entry.selectedDaySchedule);
      }
    }

    // Collect all bookings across the week
    const allWeekBookings = [];
    for (const dateStr of weekDateStrs) {
      const dayBookings = weekBookingsByDate[dateStr] || [];
      allWeekBookings.push(...dayBookings);
    }

    return getVisibleTimeRange({ schedules, bookings: allWeekBookings });
  }, [dayScheduleMap, weekBookingsByDate, weekDateStrs]);

  const goToPrevWeek = () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    onWeekChange(prev);
  };

  const goToNextWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    onWeekChange(next);
  };

  const goToToday = () => {
    onWeekChange(getSundayOfWeek(new Date()));
  };

  const isCurrentWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sun = getSundayOfWeek(today);
    return isSameDay(weekStart, sun);
  }, [weekStart]);

  const todayDateStr = useMemo(() => formatDateKey(new Date()), []);

  return (
    <div className="space-y-4">
      {/* ─── Week navigation ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPrevWeek}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="min-w-[200px] text-center text-base font-bold sm:text-lg">
            {weekLabel}
          </h2>
          <Button variant="outline" size="icon" onClick={goToNextWeek}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {!isCurrentWeek && (
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
        )}
      </div>

      {/* ─── Week grid ─── */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <div className="flex min-w-[700px]">
          {/* Time gutter with dynamic range */}
          <TimeGutter
            rangeStart={weekRange.start}
            rangeEnd={weekRange.end}
            rangeHours={weekRange.hours}
          />

          {/* Day columns */}
          {weekDays.map((date, idx) => {
            const dateStr = weekDateStrs[idx];
            const { isNonWorkingDay } = dayScheduleMap[dateStr] || { isNonWorkingDay: false };
            const dayBookings = weekBookingsByDate[dateStr] || [];
            const isCurrentDay = dateStr === todayDateStr;

            return (
              <DayColumn
                key={dateStr}
                date={date}
                isCurrentDay={isCurrentDay}
                isNonWorking={isNonWorkingDay}
                bookings={dayBookings}
                onBookingClick={onBookingClick}
                rangeStart={weekRange.start}
                rangeEnd={weekRange.end}
                rangeHours={weekRange.hours}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
