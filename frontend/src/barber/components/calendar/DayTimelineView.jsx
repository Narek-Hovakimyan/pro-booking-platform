import { useMemo, useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";

import { timeToMinutes, minutesToTime } from "@/shared/utils/time";
import {
  getBookingId,
  getBookingTime,
  getBookingDuration,
  getBookingServiceName,
  getClientName,
  getVisibleTimeRange,
} from "@/barber/utils/calendarHelpers";
import CalendarBookingCard from "@/barber/components/calendar/CalendarBookingCard";

// ─── Constants ───
const HOUR_HEIGHT_PX = 72; // ↑ bigger = more readable

// ─── Color helpers (solid soft backgrounds with subtle borders) ───
function getBlockAppearance(status) {
  switch (status) {
    case "pending":
      return {
        bg: "bg-amber-100",
        border: "border-amber-300",
        text: "text-amber-950",
        badge: "bg-amber-500 text-white",
        bar: "bg-amber-500",
      };
    case "accepted":
      return {
        bg: "bg-emerald-100",
        border: "border-emerald-300",
        text: "text-emerald-950",
        badge: "bg-emerald-600 text-white",
        bar: "bg-emerald-600",
      };
    case "completed":
      return {
        bg: "bg-blue-100",
        border: "border-blue-300",
        text: "text-blue-950",
        badge: "bg-blue-600 text-white",
        bar: "bg-blue-600",
      };
    case "rejected":
    case "cancelled":
    case "expired":
      return {
        bg: "bg-neutral-100",
        border: "border-neutral-200",
        text: "text-neutral-500",
        badge: "bg-neutral-400 text-white",
        bar: "bg-neutral-400",
      };
    case "no_show":
    case "late_cancelled":
      return {
        bg: "bg-red-100",
        border: "border-red-300",
        text: "text-red-950",
        badge: "bg-red-600 text-white",
        bar: "bg-red-600",
      };
    default:
      return {
        bg: "bg-neutral-50",
        border: "border-neutral-200",
        text: "text-neutral-700",
        badge: "bg-neutral-400 text-white",
        bar: "bg-neutral-300",
      };
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

// ─── Derive visible range from schedule + bookings (via shared helper) ───
function useVisibleRange(bookings, selectedDaySchedule) {
  return useMemo(() => {
    const schedules = selectedDaySchedule?.from ? [selectedDaySchedule] : [];
    return getVisibleTimeRange({ schedules, bookings });
  }, [bookings, selectedDaySchedule]);
}

// ─── Current time indicator ───
function useCurrentTime(isToday) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!isToday) return;
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, [isToday]);

  return now;
}

// ─── Break overlay ───
function useBreakOverlay(selectedDaySchedule, rangeStart) {
  return useMemo(() => {
    if (!selectedDaySchedule?.breakFrom || !selectedDaySchedule?.breakTo) return null;
    const bf = timeToMinutes(selectedDaySchedule.breakFrom);
    const bt = timeToMinutes(selectedDaySchedule.breakTo);
    if (bf === null || bt === null || bf >= bt) return null;
    return {
      top: Math.max(0, bf - rangeStart),
      height: bt - bf,
    };
  }, [selectedDaySchedule, rangeStart]);
}

// ─── Inline helpers ───
function getBookingStatus(booking) {
  return booking?.status || "pending";
}

function getClientPhone(booking) {
  return booking?.client?.phone || booking?.clientPhone || booking?.phone || "";
}

function getBookingPrice(booking) {
  const price = Number(booking?.price);
  return Number.isFinite(price) ? price : 0;
}

function getBookingNotes(booking) {
  return booking?.notes || booking?.note || booking?.reason || "";
}

function formatTimeRange(booking) {
  const time = getBookingTime(booking);
  const duration = getBookingDuration(booking);
  const startMinutes = timeToMinutes(time);
  if (startMinutes === null) return time || "";
  return `${time} – ${minutesToTime(startMinutes + duration)}`;
}

function getStatusLabel(status) {
  switch (status) {
    case "pending": return "Pending";
    case "accepted": return "Accepted";
    case "completed": return "Completed";
    case "rejected": return "Rejected";
    case "cancelled": return "Cancelled";
    case "expired": return "Expired";
    case "no_show": return "No Show";
    case "late_cancelled": return "Late Cancel";
    default: return status;
  }
}

// ─── Sub-component: Event block ───
function EventBlock({ booking, topPx, heightPx, isSelected, onClick }) {
  const time = getBookingTime(booking);
  const duration = getBookingDuration(booking);
  const startMinutes = timeToMinutes(time);
  if (startMinutes === null) return null;

  const endTime = minutesToTime(startMinutes + duration);
  const status = booking?.status || "pending";
  const app = getBlockAppearance(status);
  const clientName = getClientName(booking);
  const serviceName = getBookingServiceName(booking);
  const isTerminal = ["rejected", "cancelled", "expired"].includes(status);
  const isNoShow = ["no_show", "late_cancelled"].includes(status);

  // For very short blocks (< 60px), show a compact layout
  const isCompact = heightPx < 64;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute left-0 right-0 overflow-hidden rounded-xl border text-left shadow-sm transition-all hover:shadow-md hover:brightness-95 active:brightness-90 ${app.bg} ${app.border} ${
        isTerminal || isNoShow ? "opacity-75" : ""
      } ${isTerminal ? "line-through" : ""} ${
        isSelected ? "ring-2 ring-neutral-900 ring-offset-1" : ""
      }`}
      style={{
        top: `${topPx}px`,
        height: `${heightPx}px`,
        minHeight: "44px",
        zIndex: 20,
      }}
    >
      {/* Left color bar */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl ${app.bar}`}
      />

      {/* Content */}
      {isCompact ? (
        /* ── Compact layout (< 64px) ── */
        <div className="ml-2.5 flex h-full items-center gap-1.5 overflow-hidden py-1 pr-2">
          <span className={`truncate text-xs font-semibold ${app.text}`}>
            {clientName}
          </span>
          <span className="shrink-0 text-[10px] text-neutral-500">
            {time}
          </span>
          <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase leading-tight ${app.badge}`}>
            {getStatusLabel(status)}
          </span>
        </div>
      ) : (
        /* ── Normal layout (≥ 64px) ── */
        <div className="ml-2.5 flex flex-col justify-center gap-0.5 overflow-hidden py-2 pr-2">
          <div className="flex items-center gap-2">
            <span className={`truncate text-sm font-semibold ${app.text}`}>
              {clientName}
            </span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase leading-tight ${app.badge}`}>
              {getStatusLabel(status)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            <span className="truncate">{serviceName}</span>
            <span className="shrink-0 font-medium text-neutral-500">
              {time} – {endTime}
            </span>
          </div>
        </div>
      )}
    </button>
  );
}

// ─── Sub-component: Booking detail anchored popover ───
function BookingDetailPopover({
  booking,
  topPx,
  heightPx,
  totalHeight,
  onClose,
  onAccept,
  onReject,
  onComplete,
  onNoShow,
  onLateCancel,
}) {
  if (!booking) return null;

  // Compute popover position (below block, or above if near bottom)
  const POPOVER_WIDTH_PX = 360;
  const GAP_PX = 8;
  const VERTICAL_PADDING = 20; // safety margin from edges
  const popoverBelow = topPx + heightPx + GAP_PX;
  const spaceBelow = totalHeight - popoverBelow;
  const POPOVER_ESTIMATED_HEIGHT = 320;

  const placeBelow = spaceBelow >= POPOVER_ESTIMATED_HEIGHT;
  const popoverTop = placeBelow
    ? popoverBelow
    : Math.max(VERTICAL_PADDING, topPx - POPOVER_ESTIMATED_HEIGHT - GAP_PX);

  return (
    <div
      className="absolute z-50 rounded-2xl border border-neutral-200 bg-white shadow-xl transition-all"
      style={{
        top: `${popoverTop}px`,
        left: "50%",
        transform: "translateX(-50%)",
        width: `${Math.min(POPOVER_WIDTH_PX, 100)}%`,
        maxWidth: `${POPOVER_WIDTH_PX}px`,
        minWidth: "260px",
      }}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-700"
        aria-label="Close booking detail"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="p-4 sm:p-5">
        <CalendarBookingCard
          booking={booking}
          status={getBookingStatus(booking)}
          clientName={getClientName(booking)}
          timeRange={formatTimeRange(booking)}
          serviceName={getBookingServiceName(booking)}
          phone={getClientPhone(booking)}
          duration={getBookingDuration(booking)}
          price={getBookingPrice(booking)}
          notes={getBookingNotes(booking)}
          onAccept={() => { onAccept?.(booking); onClose(); }}
          onReject={() => { onReject?.(booking); onClose(); }}
          onComplete={() => { onComplete?.(booking); onClose(); }}
          onNoShow={() => { onNoShow?.(booking); onClose(); }}
          onLateCancel={() => { onLateCancel?.(booking); onClose(); }}
        />
      </div>
    </div>
  );
}

// ─── Main component ───
export default function DayTimelineView({
  dateKey,
  isNonWorkingDay,
  bookings = [],
  isLoading,
  selectedDaySchedule,
  onAccept,
  onReject,
  onComplete,
  onNoShow,
  onLateCancel,
}) {
  // State: selected booking info with computed position
  const [selected, setSelected] = useState(null);
  // selected = { booking, topPx, heightPx } | null

  const range = useVisibleRange(bookings, selectedDaySchedule);
  const isToday = useMemo(() => {
    if (!dateKey) return false;
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return dateKey === `${y}-${m}-${d}`;
  }, [dateKey]);

  const now = useCurrentTime(isToday);

  const currentTimePx = useMemo(() => {
    if (!isToday) return null;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < range.start || nowMin > range.end) return null;
    return nowMin - range.start;
  }, [isToday, now, range]);

  const breakOverlay = useBreakOverlay(selectedDaySchedule, range.start);

  const overlapGroups = useMemo(
    () => groupOverlappingBookings(bookings),
    [bookings]
  );

  const totalHeight = range.hours * HOUR_HEIGHT_PX;

  const handleBookingClick = useCallback(
    (booking, topPx, heightPx) => {
      const currentId = selected ? getBookingId(selected.booking) : null;
      const clickedId = getBookingId(booking);
      if (currentId === clickedId) {
        setSelected(null);
      } else {
        setSelected({ booking, topPx, heightPx });
      }
    },
    [selected]
  );

  // ─── Loading state ───
  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-neutral-200 bg-white p-12 text-sm text-neutral-500">
        Loading bookings...
      </div>
    );
  }

  // ─── Non-working day (no schedule) ───
  if (isNonWorkingDay) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-200">
          <span className="text-lg font-bold text-neutral-500">—</span>
        </div>
        <p className="text-base font-semibold text-neutral-700">Non-working day</p>
        <p className="mt-1 text-sm text-neutral-500">No schedule for this day</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Timeline grid (overflow-visible so popover is not clipped) ─── */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <div className="flex min-w-[520px]">
            {/* Time gutter */}
            <div className="w-16 shrink-0 border-r border-neutral-200 bg-neutral-50/50">
              <div className="relative" style={{ height: `${totalHeight}px` }}>
                {Array.from({ length: range.hours + 1 }, (_, i) => {
                  const hourMin = range.start + i * 60;
                  if (hourMin > range.end) return null;
                  return (
                    <div
                      key={hourMin}
                      className="absolute left-0 right-0 flex items-start justify-end pr-2.5 text-xs font-medium tracking-tight text-neutral-400"
                      style={{
                        top: `${i * HOUR_HEIGHT_PX}px`,
                        height: `${HOUR_HEIGHT_PX}px`,
                      }}
                    >
                      <span className="-mt-2">{minutesToTime(hourMin)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Day column */}
            <div className="relative flex-1 min-w-0 bg-white">
              <div className="relative" style={{ height: `${totalHeight}px` }}>
                {/* Hour grid lines */}
                {Array.from({ length: range.hours + 1 }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-neutral-100"
                    style={{ top: `${i * HOUR_HEIGHT_PX}px` }}
                  />
                ))}

                {/* Half-hour grid lines */}
                {Array.from({ length: range.hours }, (_, i) => (
                  <div
                    key={`half-${i}`}
                    className="absolute left-0 right-0 border-t border-dashed border-neutral-50"
                    style={{ top: `${(i + 0.5) * HOUR_HEIGHT_PX}px` }}
                  />
                ))}

                {/* Current time indicator */}
                {isToday && currentTimePx !== null && (
                  <div
                    className="absolute left-0 right-0 z-30 flex items-center pointer-events-none"
                    style={{ top: `${currentTimePx}px` }}
                  >
                    <div className="z-10 h-3 w-3 -ml-1.5 rounded-full bg-red-500 shadow-[0_0_0_2px_white]" />
                    <div className="flex-1 border-t-[2.5px] border-red-500" />
                  </div>
                )}

                {/* Break overlay */}
                {breakOverlay && (
                  <div
                    className="absolute left-0 right-0 z-20 flex items-center justify-center bg-gradient-to-r from-sky-100/60 via-sky-100/40 to-sky-100/60 border-t border-b border-sky-200"
                    style={{
                      top: `${breakOverlay.top}px`,
                      height: `${Math.max(32, breakOverlay.height)}px`,
                    }}
                  >
                    <span className="rounded-full bg-sky-200/80 px-3 py-0.5 text-[11px] font-semibold text-sky-700 shadow-sm backdrop-blur-sm">
                      Break
                    </span>
                  </div>
                )}

                {/* Empty day */}
                {bookings.length === 0 && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center">
                    <div className="text-center">
                      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
                        <span className="text-lg text-neutral-400">✓</span>
                      </div>
                      <p className="text-sm font-medium text-neutral-500">
                        No bookings scheduled
                      </p>
                      <p className="text-xs text-neutral-400">
                        This day is free and available
                      </p>
                    </div>
                  </div>
                )}

                {/* Booking blocks */}
                {overlapGroups.length > 0 && (
                  <div className="absolute inset-0">
                    {overlapGroups.map((group, groupIdx) => {
                      const subCount = overlapGroups.length;
                      const subWidth =
                        subCount > 1 ? `${100 / subCount}%` : "100%";
                      const subLeft = `${(groupIdx / subCount) * 100}%`;

                      return (
                        <div
                          key={`group-${groupIdx}`}
                          className="absolute top-0 h-full"
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
                            if (startMinutes === null) return null;

                            const topPx = Math.max(0, startMinutes - range.start);
                            const heightPx = Math.max(44, Math.round(duration));
                            const isSelected =
                              selected &&
                              getBookingId(selected.booking) ===
                                getBookingId(booking);

                            return (
                              <EventBlock
                                key={getBookingId(booking)}
                                booking={booking}
                                topPx={topPx}
                                heightPx={heightPx}
                                isSelected={isSelected}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleBookingClick(booking, topPx, heightPx);
                                }}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ─── Anchored booking detail popover (inside day column) ─── */}
                {selected && (
                  <BookingDetailPopover
                    booking={selected.booking}
                    topPx={selected.topPx}
                    heightPx={selected.heightPx}
                    totalHeight={totalHeight}
                    onClose={() => setSelected(null)}
                    onAccept={onAccept}
                    onReject={onReject}
                    onComplete={onComplete}
                    onNoShow={onNoShow}
                    onLateCancel={onLateCancel}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
