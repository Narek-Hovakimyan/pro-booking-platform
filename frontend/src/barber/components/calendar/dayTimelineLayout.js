import { getBookingDuration, getBookingTime } from "@/barber/utils/calendarHelpers";
import { getArmeniaDateKey, getArmeniaMinutesOfDay } from "@/shared/utils/armeniaDateTime";
import { minutesToTime, timeToMinutes } from "@/shared/utils/time";

export const HOUR_HEIGHT_PX = 80;
export const PIXELS_PER_MINUTE = HOUR_HEIGHT_PX / 60;
const MIN_EVENT_HEIGHT_PX = 20;
const EVENT_VERTICAL_GAP_PX = 4;

export const minutesToPixels = (minutes) => Math.round(minutes * PIXELS_PER_MINUTE);

const boxesOverlap = (first, second) =>
  first.topPx < second.bottomPx && first.bottomPx > second.topPx;

export function getBookingLayout(booking, rangeStart) {
  const start = timeToMinutes(getBookingTime(booking));
  if (start === null) return null;
  const end = start + getBookingDuration(booking);
  const topPx = minutesToPixels(start - rangeStart);
  const visualHeightPx = Math.max(MIN_EVENT_HEIGHT_PX, minutesToPixels(end - start) - EVENT_VERTICAL_GAP_PX);
  return { booking, start, end, topPx, visualHeightPx, bottomPx: topPx + visualHeightPx, columnIndex: 0, columnCount: 1 };
}

export function computeOverlapColumns(bookings, rangeStart) {
  const items = bookings.map((booking) => getBookingLayout(booking, rangeStart)).filter(Boolean)
    .sort((first, second) => first.start - second.start || second.end - first.end);
  const clusters = [];
  let active = [];
  for (const item of items) {
    if (active.length && !active.some((existing) => boxesOverlap(item, existing))) {
      clusters.push(active);
      active = [];
    }
    active.push(item);
  }
  if (active.length) clusters.push(active);
  clusters.forEach((cluster) => {
    const columnBottoms = [];
    cluster.forEach((item) => {
      const availableColumn = columnBottoms.findIndex((bottom) => bottom <= item.topPx);
      item.columnIndex = availableColumn === -1 ? columnBottoms.length : availableColumn;
      columnBottoms[item.columnIndex] = item.bottomPx;
    });
    cluster.forEach((item) => {
      const events = cluster.flatMap((other) => boxesOverlap(item, other) ? [
        { position: other.topPx, delta: 1 }, { position: other.bottomPx, delta: -1 },
      ] : []).sort((first, second) => first.position - second.position || first.delta - second.delta);
      let current = 0;
      item.columnCount = events.reduce((maximum, event) => {
        current += event.delta;
        return Math.max(maximum, current);
      }, 1);
    });
  });
  return items;
}

export function snapTimelineMinutes(minutes, range) {
  return Math.max(range.start, Math.min(range.end - 1, Math.round(minutes / 10) * 10));
}

export function isCreatableSlot({ dateKey, minutes, selectedDaySchedule, isNonWorkingDay, now = new Date() }) {
  const from = timeToMinutes(selectedDaySchedule?.from);
  const to = timeToMinutes(selectedDaySchedule?.to);
  const breakFrom = timeToMinutes(selectedDaySchedule?.breakFrom);
  const breakTo = timeToMinutes(selectedDaySchedule?.breakTo);
  const todayKey = getArmeniaDateKey(now);
  const isPast = dateKey < todayKey || (dateKey === todayKey && minutes < getArmeniaMinutesOfDay(now));
  return !isPast && !isNonWorkingDay && Boolean(selectedDaySchedule?.working) && from !== null && to !== null && minutes >= from && minutes < to && !(breakFrom !== null && breakTo !== null && minutes >= breakFrom && minutes < breakTo);
}

export function getFirstCreatableSlot({ range, dateKey, selectedDaySchedule, isNonWorkingDay, bookings, now }) {
  for (let minutes = Math.ceil(range.start / 10) * 10; minutes < range.end; minutes += 10) {
    if (!isCreatableSlot({ dateKey, minutes, selectedDaySchedule, isNonWorkingDay, now })) continue;
    const occupied = bookings.some((booking) => {
      const start = timeToMinutes(getBookingTime(booking));
      return start !== null && minutes >= start && minutes < start + getBookingDuration(booking);
    });
    if (!occupied) return minutesToTime(minutes);
  }
  return "";
}
