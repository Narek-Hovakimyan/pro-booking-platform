import { describe, expect, it } from "vitest";

import {
  getArmeniaDayKey,
  getArmeniaTodayKey,
  getNext7ArmeniaDays,
  isBeforeArmeniaToday,
} from "./dates";
import { getSlotAvailabilitySummary, isPastSlotForDate } from "./slots";

describe("Armenia booking availability", () => {
  it("uses Armenia's calendar date at the midnight boundary", () => {
    const beforeMidnight = new Date("2026-01-31T19:59:00.000Z");
    const afterMidnight = new Date("2026-01-31T20:00:00.000Z");

    expect(getArmeniaTodayKey(beforeMidnight)).toBe("2026-01-31");
    expect(getArmeniaTodayKey(afterMidnight)).toBe("2026-02-01");
    expect(getNext7ArmeniaDays(afterMidnight)[0]).toMatchObject({
      value: "2026-02-01",
      dayKey: "sun",
    });
  });

  it("filters previous Armenia dates while retaining future Armenia dates", () => {
    const now = new Date("2026-01-31T20:15:00.000Z");

    expect(isBeforeArmeniaToday("2026-01-31", now)).toBe(true);
    expect(isBeforeArmeniaToday("2026-02-01", now)).toBe(false);
    expect(isBeforeArmeniaToday("2026-02-02", now)).toBe(false);
    expect(getArmeniaDayKey("2026-02-01")).toBe("sun");
  });

  it("compares same-day slots against Armenia wall-clock time", () => {
    const now = new Date("2026-02-01T06:10:00.000Z");

    expect(isPastSlotForDate("2026-02-01", "10:10", now)).toBe(true);
    expect(isPastSlotForDate("2026-02-01", "10:20", now)).toBe(false);
  });

  it("keeps Armenia-future slots even when another timezone is on the previous day", () => {
    const now = new Date("2026-01-31T20:15:00.000Z");

    expect(isPastSlotForDate("2026-02-01", "00:10", now)).toBe(true);
    expect(isPastSlotForDate("2026-02-01", "00:20", now)).toBe(false);
    expect(isPastSlotForDate("2026-02-02", "00:00", now)).toBe(false);
  });

  it("filters availability using fixed Armenia instants without changing API keys", () => {
    const now = new Date("2026-01-31T20:15:00.000Z");
    const summary = getSlotAvailabilitySummary(
      { working: true, from: "00:00", to: "00:40" },
      10,
      [],
      "sun",
      { selectedDate: "2026-02-01", now }
    );

    expect(summary.availableSlots).toEqual(["00:20", "00:30"]);
    expect("2026-02-01").toBe("2026-02-01");
    expect("00:20").toBe("00:20");
  });
});
