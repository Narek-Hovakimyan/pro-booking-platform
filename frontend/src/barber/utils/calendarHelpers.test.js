import { describe, expect, it } from "vitest";

import { getEffectiveDaySchedule } from "./calendarHelpers";

const defaultSchedule = {
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
  breakStart: "",
  breakEnd: "",
};

describe("getEffectiveDaySchedule", () => {
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
