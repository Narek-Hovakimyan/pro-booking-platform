import { describe, expect, it } from "vitest";

import { getEffectiveDaySchedule, getVisibleTimeRange } from "./calendarHelpers";

const defaultSchedule = {
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
  breakStart: "",
  breakEnd: "",
};

describe("getEffectiveDaySchedule", () => {
  it("uses the saved default for generated weekdays without explicit provenance", () => {
    const result = getEffectiveDaySchedule(
      {
        weeklySchedule: {
          mon: { working: true, from: "09:00", to: "18:00" },
        },
        explicitWeeklyDays: [],
      },
      "2026-08-24",
      { ...defaultSchedule, startTime: "13:00" }
    );

    expect(result.selectedDaySchedule).toMatchObject({
      working: true,
      from: "13:00",
      to: "18:00",
    });
  });

  it("honors explicit working and closed weekdays", () => {
    const working = getEffectiveDaySchedule(
      {
        weeklySchedule: {
          mon: { working: true, from: "11:00", to: "16:00" },
        },
        explicitWeeklyDays: ["mon"],
      },
      "2026-08-24",
      defaultSchedule
    );
    const closed = getEffectiveDaySchedule(
      {
        weeklySchedule: { mon: { working: false } },
        explicitWeeklyDays: ["mon"],
      },
      "2026-08-24",
      defaultSchedule
    );

    expect(working.selectedDaySchedule).toMatchObject({ from: "11:00", to: "16:00" });
    expect(closed).toMatchObject({ isNonWorkingDay: true });
  });

  it("keeps populated weekdays explicit when legacy provenance is absent", () => {
    expect(
      getEffectiveDaySchedule(
        { weeklySchedule: { mon: { working: true, from: "09:00", to: "18:00" } } },
        "2026-08-24",
        { ...defaultSchedule, startTime: "13:00" }
      ).selectedDaySchedule
    ).toMatchObject({ from: "09:00", to: "18:00" });
  });

  it("uses the matching weekly day before the default schedule", () => {
    const result = getEffectiveDaySchedule(
      {
        weeklySchedule: {
          mon: {
            working: true,
            from: "11:00",
            to: "16:00",
            breakFrom: "13:00",
            breakTo: "13:30",
          },
        },
      },
      "2026-08-03",
      defaultSchedule
    );

    expect(result).toEqual({
      isNonWorkingDay: false,
      selectedDaySchedule: {
        working: true,
        from: "11:00",
        to: "16:00",
        breakFrom: "13:00",
        breakTo: "13:30",
      },
    });
  });

  it("gives date overrides precedence over weekly schedules", () => {
    const result = getEffectiveDaySchedule(
      {
        weeklySchedule: {
          mon: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
        },
        scheduleOverrides: {
          "2026-08-03": {
            isWorking: true,
            startTime: "10:00",
            endTime: "15:00",
            breakStart: "",
            breakEnd: "",
          },
        },
      },
      "2026-08-03",
      defaultSchedule
    );

    expect(result).toEqual({
      isNonWorkingDay: false,
      selectedDaySchedule: {
        working: true,
        from: "10:00",
        to: "15:00",
        breakFrom: "",
        breakTo: "",
      },
    });
  });

  it("keeps a non-working date closed even when its schedule is otherwise working", () => {
    const result = getEffectiveDaySchedule(
      {
        weeklySchedule: {
          mon: { working: true, from: "10:00", to: "15:00", breakFrom: "", breakTo: "" },
        },
        nonWorkingDays: ["2026-08-03"],
      },
      "2026-08-03",
      defaultSchedule
    );

    expect(result.isNonWorkingDay).toBe(true);
    expect(result.selectedDaySchedule).toMatchObject({ working: true, from: "10:00", to: "15:00" });
  });

  it("keeps the default schedule for an open day without weekly data", () => {
    expect(getEffectiveDaySchedule({}, "2026-08-03", defaultSchedule)).toEqual({
      isNonWorkingDay: false,
      selectedDaySchedule: {
        working: true,
        from: "09:00",
        to: "18:00",
        breakFrom: "",
        breakTo: "",
      },
    });
  });
});

describe("getVisibleTimeRange", () => {
  it("keeps exact day-only schedule boundaries", () => {
    expect(getVisibleTimeRange({ schedules: [{ from: "13:00", to: "20:00" }], exactBoundaries: true })).toMatchObject({ start: 780, end: 1200 });
    expect(getVisibleTimeRange({ schedules: [{ from: "13:30", to: "20:00" }], exactBoundaries: true })).toMatchObject({ start: 810, end: 1200 });
  });

  it("expands exact day ranges for bookings outside working hours without changing the default rounded mode", () => {
    const options = { schedules: [{ from: "13:30", to: "20:00" }], bookings: [{ time: "11:00", duration: 30 }] };
    expect(getVisibleTimeRange({ ...options, exactBoundaries: true })).toMatchObject({ start: 660, end: 1200 });
    expect(getVisibleTimeRange(options)).toMatchObject({ start: 660, end: 1200 });
  });
});
