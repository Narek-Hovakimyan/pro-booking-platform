import { describe, expect, it } from "vitest";

import {
  getArmeniaDateKey,
  getArmeniaMonthKey,
  getArmeniaTimeKey,
  getArmeniaWeekBounds,
  parseArmeniaDateTime,
} from "./armeniaDateTime";

describe("armeniaDateTime", () => {
  it("maps UTC instants around Armenia midnight and month boundaries", () => {
    const beforeMidnight = new Date("2026-01-31T19:59:00.000Z");
    const afterMidnight = new Date("2026-01-31T20:00:00.000Z");

    expect(getArmeniaDateKey(beforeMidnight)).toBe("2026-01-31");
    expect(getArmeniaDateKey(afterMidnight)).toBe("2026-02-01");
    expect(getArmeniaMonthKey(afterMidnight)).toBe("2026-02");
    expect(getArmeniaTimeKey(afterMidnight)).toBe("00:00");
  });

  it("uses calendar keys and wall time independently of browser-local time", () => {
    expect(getArmeniaWeekBounds(new Date("2026-01-31T20:30:00.000Z"))).toEqual({
      startKey: "2026-01-26",
      endKey: "2026-02-01",
    });
    expect(parseArmeniaDateTime("2026-02-01", "00:30")).toEqual(
      new Date("2026-01-31T20:30:00.000Z")
    );
  });
});
