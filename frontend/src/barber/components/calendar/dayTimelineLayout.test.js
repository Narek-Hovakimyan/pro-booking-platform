import { describe, expect, it } from "vitest";

import { computeOverlapColumns, getFirstCreatableSlot, getBookingLayout } from "./dayTimelineLayout";

const booking = (id, time, duration) => ({ id, time, duration });

describe("dayTimelineLayout", () => {
  it("keeps short bookings proportional and separates overlaps", () => {
    expect(getBookingLayout(booking("short", "10:00", 10), 540).visualHeightPx).toBe(20);
    const layout = computeOverlapColumns([booking("first", "10:00", 30), booking("second", "10:10", 20)], 540);
    expect(layout.map((item) => item.columnCount)).toEqual([2, 2]);
    expect(layout.map((item) => item.columnIndex)).toEqual([0, 1]);
  });

  it("finds the first future unoccupied slot and reports when none exists", () => {
    const options = { range: { start: 540, end: 720 }, dateKey: "2026-08-26", selectedDaySchedule: { working: true, from: "09:00", to: "12:00", breakFrom: "10:00", breakTo: "10:30" }, isNonWorkingDay: false, now: new Date("2026-08-26T05:55:00.000Z") };
    expect(getFirstCreatableSlot({ ...options, bookings: [booking("taken", "10:30", 30)] })).toBe("11:00");
    expect(getFirstCreatableSlot({ ...options, bookings: [booking("taken", "09:00", 180)] })).toBe("");
  });
});
