import { describe, expect, it } from "vitest";

import { formatEventDate, getEventDateTime } from "./eventFormatters";

describe("eventFormatters Armenia time", () => {
  it("parses event calendar date and wall time at Armenia +04:00", () => {
    expect(getEventDateTime({ date: "2026-02-01", time: "00:30" })).toEqual(
      new Date("2026-01-31T20:30:00.000Z")
    );
  });

  it("formats Armenia calendar dates without browser-local parsing", () => {
    expect(formatEventDate("2026-02-01")).toBe("Sun, Feb 1");
    expect(formatEventDate("invalid")).toBe("Date not set");
  });
});
