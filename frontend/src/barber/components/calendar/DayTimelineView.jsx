import { useCallback, useEffect, useMemo, useState } from "react";

import BookingDetailPopover from "@/barber/components/calendar/BookingDetailPopover";
import { getBookingId, getBookingServiceName, getBookingTime, getClientName, getVisibleTimeRange } from "@/barber/utils/calendarHelpers";
import { getArmeniaDateKey, getArmeniaMinutesOfDay } from "@/shared/utils/armeniaDateTime";
import { minutesToTime } from "@/shared/utils/time";
import { HOUR_HEIGHT_PX, computeOverlapColumns, getFirstCreatableSlot, isCreatableSlot, minutesToPixels, snapTimelineMinutes } from "./dayTimelineLayout";

const GRID_INSET_PX = 10;
const EVENT_COLUMN_GAP_PX = 6;
const statusLabels = { pending: "Pending confirmation", accepted: "Confirmed", completed: "Completed", rejected: "Rejected", cancelled: "Cancelled", expired: "Expired", no_show: "No-show", late_cancelled: "Late cancellation" };
const tones = { pending: ["bg-amber-100", "border-amber-300", "text-amber-950", "bg-amber-500 text-white", "bg-amber-500"], accepted: ["bg-emerald-100", "border-emerald-300", "text-emerald-950", "bg-emerald-600 text-white", "bg-emerald-600"], completed: ["bg-blue-100", "border-blue-300", "text-blue-950", "bg-blue-600 text-white", "bg-blue-600"], no_show: ["bg-red-100", "border-red-300", "text-red-950", "bg-red-600 text-white", "bg-red-600"], late_cancelled: ["bg-red-100", "border-red-300", "text-red-950", "bg-red-600 text-white", "bg-red-600"] };

function EventBlock({ item, selected, onClick }) {
  const { booking, topPx, visualHeightPx, columnIndex, columnCount } = item;
  const [bg, border, text, badge, bar] = tones[booking?.status] || ["bg-neutral-100", "border-neutral-200", "text-neutral-600", "bg-neutral-400 text-white", "bg-neutral-400"];
  const gap = (columnCount - 1) * EVENT_COLUMN_GAP_PX;
  const width = columnCount > 1 ? `calc((100% - ${gap}px) / ${columnCount})` : "100%";
  const left = columnCount > 1 ? `calc(${(columnIndex / columnCount) * 100}% + ${(columnIndex * EVENT_COLUMN_GAP_PX) / columnCount}px)` : "0";
  const compact = visualHeightPx < 72;
  return <button type="button" onClick={onClick} className={`absolute min-w-0 overflow-hidden rounded-lg border text-left shadow-sm transition hover:brightness-95 ${bg} ${border} ${selected ? "ring-2 ring-neutral-900 ring-offset-1" : ""}`} style={{ top: `${topPx}px`, height: `${visualHeightPx}px`, left, width, zIndex: 20 }}>
    <span className={`absolute inset-y-0 left-0 w-1.5 ${bar}`} /><span className="ml-2.5 flex h-full min-w-0 flex-col justify-center gap-0.5 overflow-hidden px-2 py-1"><span className="flex min-w-0 items-center gap-1"><span className={`min-w-0 flex-1 truncate font-semibold ${compact ? "text-[11px]" : "text-sm"} ${text}`}>{getClientName(booking)}</span><span className={`shrink-0 rounded px-1 py-0.5 font-medium uppercase ${compact ? "text-[8px]" : "text-[10px]"} ${badge}`}>{statusLabels[booking?.status] || booking?.status}</span></span><span className={`flex min-w-0 items-center gap-1 text-neutral-600 ${compact ? "text-[9px]" : "text-xs"}`}><span className="min-w-0 flex-1 truncate">{getBookingServiceName(booking)}</span><span className="shrink-0">{getBookingTime(booking)}–{minutesToTime(item.end)}</span></span></span>
  </button>;
}

export default function DayTimelineView({ dateKey, isNonWorkingDay, bookings = [], isLoading, selectedDaySchedule, onAccept, onReject, onComplete, onNoShow, onLateCancel, onCreateSlot, pendingBookingIds = new Set() }) {
  const [selected, setSelected] = useState(null);
  const [slotError, setSlotError] = useState("");
  const range = useMemo(() => getVisibleTimeRange({ schedules: selectedDaySchedule?.from ? [selectedDaySchedule] : [], bookings, exactBoundaries: true }), [bookings, selectedDaySchedule]);
  const isToday = dateKey === getArmeniaDateKey();
  const [now, setNow] = useState(() => new Date());
  const bookedSlots = useMemo(() => computeOverlapColumns(bookings, range.start), [bookings, range.start]);
  const totalHeight = range.hours * HOUR_HEIGHT_PX;
  const timelineMarks = useMemo(() => {
    const marks = [];
    for (let minutes = range.start; minutes < range.end; minutes += 60) marks.push(minutes);
    if (marks.at(-1) !== range.end) marks.push(range.end);
    return marks;
  }, [range.end, range.start]);
  const breakOverlay = useMemo(() => {
    const [from, to] = [selectedDaySchedule?.breakFrom, selectedDaySchedule?.breakTo];
    if (!from || !to) return null;
    const start = Number(from.slice(0, 2)) * 60 + Number(from.slice(3));
    const end = Number(to.slice(0, 2)) * 60 + Number(to.slice(3));
    return end > start ? { top: minutesToPixels(start - range.start), height: minutesToPixels(end - start) } : null;
  }, [range.start, selectedDaySchedule]);
  useEffect(() => {
    if (!isToday) return undefined;
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, [isToday]);
  const createSlot = useCallback((minutes) => {
    const snapped = snapTimelineMinutes(minutes, range);
    if (!isCreatableSlot({ dateKey, minutes: snapped, selectedDaySchedule, isNonWorkingDay })) { setSlotError("That time is unavailable for a new booking."); return; }
    setSlotError(""); onCreateSlot?.(minutesToTime(snapped));
  }, [dateKey, isNonWorkingDay, onCreateSlot, range, selectedDaySchedule]);
  const createFirstKeyboardSlot = useCallback(() => {
    const time = getFirstCreatableSlot({ range, dateKey, selectedDaySchedule, isNonWorkingDay, bookings, now });
    if (time) { setSlotError(""); onCreateSlot?.(time); } else setSlotError("There is no available time slot in this timeline.");
  }, [bookings, dateKey, isNonWorkingDay, now, onCreateSlot, range, selectedDaySchedule]);
  const currentMinute = getArmeniaMinutesOfDay(now);
  const currentTimePx = isToday && currentMinute >= range.start && currentMinute <= range.end ? minutesToPixels(currentMinute - range.start) : null;
  if (isLoading) return <div className="flex items-center justify-center rounded-2xl border border-neutral-200 bg-white p-12 text-sm text-neutral-500">Loading bookings...</div>;
  if (isNonWorkingDay && !bookings.length) return <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center"><p className="text-base font-semibold text-neutral-700">Non-working day</p><p className="mt-1 text-sm text-neutral-500">No schedule for this day</p></div>;
  return <div className="space-y-4">
    {isNonWorkingDay && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">This day is closed for new availability. Existing bookings remain actionable.</div>}
    {slotError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{slotError}</p>}
    {onCreateSlot && <button type="button" className="sr-only rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 focus:not-sr-only" onClick={createFirstKeyboardSlot} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); createFirstKeyboardSlot(); } }}>Add booking at the first available time</button>}
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm"><div className="overflow-x-auto"><div className="flex min-w-[520px]">
      <div className="w-16 shrink-0 border-r border-neutral-200 bg-neutral-50/50"><div className="relative" style={{ height: `${totalHeight}px` }}>{timelineMarks.map((minutes, index) => <div key={minutes} data-testid={`time-label-${minutesToTime(minutes)}`} className="absolute left-0 right-0 flex justify-end pr-2.5 text-xs text-neutral-400" style={{ top: `${minutesToPixels(minutes - range.start)}px`, transform: index === 0 ? "none" : index === timelineMarks.length - 1 ? "translateY(-100%)" : "translateY(-50%)" }}><span>{minutesToTime(minutes)}</span></div>)}</div></div>
      <div className="relative min-w-0 flex-1 bg-white"><div className="relative" style={{ height: `${totalHeight}px` }} onClick={(event) => { if (!onCreateSlot || event.target.closest("button")) return; createSlot(range.start + (event.clientY - event.currentTarget.getBoundingClientRect().top) / (HOUR_HEIGHT_PX / 60)); }}>
        {timelineMarks.map((minutes) => <div key={`hour-${minutes}`} className="absolute inset-x-0 border-t border-neutral-100" style={{ top: `${minutesToPixels(minutes - range.start)}px` }} />)}
        {timelineMarks.slice(0, -1).map((minutes, index) => <div key={`half-${minutes}`} className="absolute inset-x-0 border-t border-dashed border-neutral-50" style={{ top: `${minutesToPixels(minutes + (timelineMarks[index + 1] - minutes) / 2 - range.start)}px` }} />)}
        {currentTimePx !== null && <div className="pointer-events-none absolute inset-x-0 z-30 border-t-[2.5px] border-red-500" style={{ top: `${currentTimePx}px` }} />}
        {breakOverlay && <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center justify-center border-y border-sky-200 bg-sky-100/60" style={{ top: `${breakOverlay.top}px`, height: `${Math.max(32, breakOverlay.height)}px` }}><span className="text-[11px] font-semibold text-sky-700">Break</span></div>}
        {!bookings.length && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-neutral-500">No bookings scheduled</div>}
        <div className="absolute inset-y-0" style={{ left: `${GRID_INSET_PX}px`, right: `${GRID_INSET_PX}px` }}>{bookedSlots.map((item) => <EventBlock key={getBookingId(item.booking)} item={item} selected={getBookingId(selected?.booking) === getBookingId(item.booking)} onClick={(event) => { event.stopPropagation(); setSelected({ booking: item.booking, topPx: item.topPx, heightPx: item.visualHeightPx, trigger: event.currentTarget }); }} />)}</div>
        {selected && <BookingDetailPopover booking={selected.booking} topPx={selected.topPx} heightPx={selected.heightPx} totalHeight={totalHeight} onClose={() => setSelected(null)} onAccept={onAccept} onReject={onReject} onComplete={onComplete} onNoShow={onNoShow} onLateCancel={onLateCancel} isActionPending={pendingBookingIds.has(String(getBookingId(selected.booking)))} returnFocus={selected.trigger} />}
      </div></div>
    </div></div></div>
  </div>;
}
