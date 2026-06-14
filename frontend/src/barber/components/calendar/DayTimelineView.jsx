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
const HOUR_HEIGHT_PX = 80;
const PIXELS_PER_MINUTE = HOUR_HEIGHT_PX / 60;
const GRID_INSET_PX = 10;
const EVENT_COLUMN_GAP_PX = 6;
const EVENT_VERTICAL_GAP_PX = 4;
const MIN_EVENT_HEIGHT_PX = 64;

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

function minutesToPixels(minutes) {
  return Math.round(minutes * PIXELS_PER_MINUTE);
}

function getBookingLayout(booking, rangeStart) {
  const start = timeToMinutes(getBookingTime(booking));
  if (start === null) return null;
  const end = start + getBookingDuration(booking);
  const topPx = minutesToPixels(start - rangeStart);
  const rawHeightPx = minutesToPixels(end - start);
  const visualHeightPx = Math.max(
    MIN_EVENT_HEIGHT_PX,
    rawHeightPx - EVENT_VERTICAL_GAP_PX
  );

  return {
    booking,
    start,
    end,
    topPx,
    visualHeightPx,
    bottomPx: topPx + visualHeightPx,
    columnIndex: 0,
    columnCount: 1,
  };
}

function visualBoxesOverlap(a, b) {
  return a.topPx < b.bottomPx && a.bottomPx > b.topPx;
}

// ─── Overlap column assignment ───
function computeOverlapColumns(bookings, rangeStart) {
  if (!bookings.length) return [];

  const items = bookings
    .map((booking) => getBookingLayout(booking, rangeStart))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  // Build clusters from rendered visual collisions, not just time overlap.
  const clusters = [];
  let activeCluster = [];

  for (const item of items) {
    const overlapsActiveCluster = activeCluster.some((existing) =>
      visualBoxesOverlap(item, existing)
    );

    if (activeCluster.length === 0 || !overlapsActiveCluster) {
      if (activeCluster.length) clusters.push(activeCluster);
      activeCluster = [item];
    } else {
      activeCluster.push(item);
    }
  }

  if (activeCluster.length) clusters.push(activeCluster);

  for (const cluster of clusters) {
    const columnBottoms = [];

    for (const item of cluster) {
      let columnIndex = columnBottoms.findIndex(
        (bottomPx) => bottomPx <= item.topPx
      );

      if (columnIndex === -1) {
        columnIndex = columnBottoms.length;
      }

      item.columnIndex = columnIndex;
      columnBottoms[columnIndex] = item.bottomPx;
    }

    for (const item of cluster) {
      const events = cluster.flatMap((other) => {
        if (!visualBoxesOverlap(item, other) && other !== item) {
          return [];
        }

        return [
          { position: other.topPx, delta: 1 },
          { position: other.bottomPx, delta: -1 },
        ];
      });

      events.sort((a, b) => a.position - b.position || a.delta - b.delta);

      let current = 0;
      let maxConcurrent = 1;
      for (const event of events) {
        current += event.delta;
        if (current > maxConcurrent) maxConcurrent = current;
      }

      item.columnCount = maxConcurrent;
    }
  }

  return items;
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
      top: minutesToPixels(Math.max(0, bf - rangeStart)),
      height: minutesToPixels(bt - bf),
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
function EventBlock({
  booking,
  topPx,
  heightPx,
  isSelected,
  onClick,
  styleOverride = {},
}) {
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

  const isCompact = heightPx < 72;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute min-w-0 overflow-hidden rounded-lg border text-left shadow-sm transition-all hover:shadow-md hover:brightness-95 active:brightness-90 ${app.bg} ${app.border} ${
        isTerminal || isNoShow ? "opacity-75" : ""
      } ${isTerminal ? "line-through" : ""} ${
        isSelected ? "ring-2 ring-neutral-900 ring-offset-1" : ""
      }`}
      style={{
        top: `${topPx}px`,
        height: `${heightPx}px`,
        zIndex: 20,
        ...styleOverride,
      }}
    >
      {/* Left color bar */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-lg ${app.bar}`}
      />

      {/* Content */}
      {isCompact ? (
        /* ── Compact layout (< 72px) ── */
        <div className="ml-2.5 flex h-full min-w-0 flex-col justify-center gap-0.5 overflow-hidden px-2 py-1">
          <div className="flex min-w-0 items-center gap-1">
            <span className={`min-w-0 flex-1 truncate text-[11px] font-semibold ${app.text}`}>
              {clientName}
            </span>
            <span className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-medium uppercase leading-tight ${app.badge}`}>
              {getStatusLabel(status)}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1 text-[9px] text-neutral-600">
            <span className="min-w-0 flex-1 truncate">{serviceName}</span>
            <span className="shrink-0 font-medium text-neutral-500">
              {time}–{endTime}
            </span>
          </div>
        </div>
      ) : (
        /* ── Normal layout (≥ 72px) ── */
        <div className="ml-2.5 flex h-full min-w-0 flex-col justify-center gap-0.5 overflow-hidden px-2.5 py-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${app.text}`}>
              {clientName}
            </span>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase leading-tight ${app.badge}`}>
              {getStatusLabel(status)}
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-1.5 text-xs text-neutral-600">
            <span className="min-w-0 flex-1 truncate">{serviceName}</span>
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
    return minutesToPixels(nowMin - range.start);
  }, [isToday, now, range]);

  const breakOverlay = useBreakOverlay(selectedDaySchedule, range.start);

  const bookedSlots = useMemo(
    () => computeOverlapColumns(bookings, range.start),
    [bookings, range.start]
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

                {/* Booking blocks with overlap column layout */}
                {bookedSlots.length > 0 && (
                  <div
                    className="absolute inset-y-0"
                    style={{
                      left: `${GRID_INSET_PX}px`,
                      right: `${GRID_INSET_PX}px`,
                    }}
                  >
                    {bookedSlots.map((item) => {
                      const colCount = item.columnCount;
                      const colIndex = item.columnIndex;
                      const isSelected =
                        selected &&
                        getBookingId(selected.booking) ===
                          getBookingId(item.booking);

                      const totalGapPx = (colCount - 1) * EVENT_COLUMN_GAP_PX;
                      const columnWidth =
                        colCount > 1
                          ? `calc((100% - ${totalGapPx}px) / ${colCount})`
                          : "100%";
                      const left =
                        colCount > 1
                          ? `calc(${(colIndex / colCount) * 100}% + ${
                              (colIndex * EVENT_COLUMN_GAP_PX) / colCount
                            }px)`
                          : "0";

                      return (
                        <EventBlock
                          key={getBookingId(item.booking)}
                          booking={item.booking}
                          topPx={item.topPx}
                          heightPx={item.visualHeightPx}
                          isSelected={isSelected}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBookingClick(
                              item.booking,
                              item.topPx,
                              item.visualHeightPx
                            );
                          }}
                          styleOverride={{
                            left,
                            width: columnWidth,
                          }}
                        />
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
