import { describe, expect, it } from "vitest";

import { normalizeSchedule } from "./scheduleHelpers";

describe("normalizeSchedule", () => {
  it("preserves explicit weekday provenance, including an empty inheritance set", () => {
    const schedule = normalizeSchedule({
      weeklySchedule: {
        mon: { working: true, from: "09:00", to: "18:00" },
      },
      explicitWeeklyDays: [],
      defaultSchedule: { startTime: "13:00", endTime: "18:00" },
    });

    expect(schedule.explicitWeeklyDays).toEqual([]);
    expect(schedule.weeklySchedule.mon.from).toBe("09:00");
    expect(schedule.defaultSchedule).toMatchObject({
      startTime: "13:00",
      endTime: "18:00",
    });
  });

  it("does not invent provenance for legacy schedules", () => {
    const schedule = normalizeSchedule({
      weeklySchedule: {
        mon: { working: true, from: "10:00", to: "17:00" },
      },
    });

    expect(Object.hasOwn(schedule, "explicitWeeklyDays")).toBe(false);
  });
});
