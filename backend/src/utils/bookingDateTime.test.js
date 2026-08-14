import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  ARMENIA_UTC_OFFSET_HOURS,
  getArmeniaDayBounds,
  getArmeniaDateKey,
  getArmeniaMonthBounds,
  getCurrentMonthKey,
  isBeyondBookingHorizon,
  MAX_BOOKING_HORIZON_DAYS,
} from "./bookingDateTime.js";

const RealDate = Date;

afterEach(() => {
  global.Date = RealDate;
});

test("getCurrentMonthKey uses Armenia/Yerevan business month near UTC month boundary", () => {
  const fixedNow = new RealDate("2026-01-31T20:30:00.000Z");

  global.Date = class extends RealDate {
    constructor(value) {
      super(value ?? fixedNow);
    }

    static now() {
      return fixedNow.getTime();
    }
  };

  assert.equal(getArmeniaDateKey(fixedNow), "2026-02-01");
  assert.equal(getCurrentMonthKey(), "2026-02");
});

test("Armenia day and month bounds convert calendar boundaries to UTC instants", () => {
  const dayBounds = getArmeniaDayBounds("2026-02-01");
  const monthBounds = getArmeniaMonthBounds(new RealDate("2026-01-31T20:30:00.000Z"));

  assert.deepEqual(dayBounds, {
    start: new RealDate("2026-01-31T20:00:00.000Z"),
    end: new RealDate("2026-02-01T20:00:00.000Z"),
  });
  assert.deepEqual(monthBounds, {
    start: new RealDate("2026-01-31T20:00:00.000Z"),
    end: new RealDate("2026-02-28T20:00:00.000Z"),
  });
});

test("isBeyondBookingHorizon allows dates within 180 days (Armenia date)", () => {
  const fixedNow = new RealDate("2026-01-31T20:30:00.000Z"); // Armenia = 2026-02-01

  global.Date = class extends RealDate {
    constructor(value) {
      super(value ?? fixedNow);
    }
    static now() {
      return fixedNow.getTime();
    }
  };

  // 2026-02-01 + 179 days = 2026-07-30 → allowed
  assert.equal(isBeyondBookingHorizon("2026-07-30"), false);
  // 2026-02-01 + 180 days = 2026-07-31 → allowed (exactly at horizon)
  assert.equal(isBeyondBookingHorizon("2026-07-31"), false);
  // 2026-02-01 + 181 days = 2026-08-01 → rejected
  assert.equal(isBeyondBookingHorizon("2026-08-01"), true);
});

test("isBeyondBookingHorizon is stable across process timezones", () => {
  const previousTimeZone = process.env.TZ;
  const fixedNow = new RealDate("2026-01-31T20:30:00.000Z");

  global.Date = class extends RealDate {
    constructor(value) {
      super(value ?? fixedNow);
    }
    static now() {
      return fixedNow.getTime();
    }
  };

  try {
    for (const timezone of ["UTC", "Asia/Yerevan", "America/Los_Angeles"]) {
      process.env.TZ = timezone;
      assert.deepEqual(
        [
          isBeyondBookingHorizon("2026-07-30"),
          isBeyondBookingHorizon("2026-07-31"),
          isBeyondBookingHorizon("2026-08-01"),
        ],
        [false, false, true]
      );
    }
  } finally {
    if (previousTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTimeZone;
    }
  }
});

test("isBeyondBookingHorizon rejects far future date for any reasonable fixed now", () => {
  const fixedNow = new RealDate("2026-06-01T00:00:00.000Z");

  global.Date = class extends RealDate {
    constructor(value) {
      super(value ?? fixedNow);
    }
    static now() {
      return fixedNow.getTime();
    }
  };

  // 2099 is always far beyond any 180-day horizon
  assert.equal(isBeyondBookingHorizon("2099-01-01"), true);
});

test("isBeyondBookingHorizon returns false for non-string or non-matching format", () => {
  assert.equal(isBeyondBookingHorizon("not-a-date"), false);
  assert.equal(isBeyondBookingHorizon(""), false);
  assert.equal(isBeyondBookingHorizon(null), false);
  assert.equal(isBeyondBookingHorizon(undefined), false);
  assert.equal(isBeyondBookingHorizon(123), false);
});

test("isBeyondBookingHorizon does not validate month/day integrity (caller's job)", () => {
  const fixedNow = new RealDate("2026-01-31T20:30:00.000Z"); // Armenia = 2026-02-01

  global.Date = class extends RealDate {
    constructor(value) {
      super(value ?? fixedNow);
    }
    static now() {
      return fixedNow.getTime();
    }
  };

  // This only does regex matching, not date validation.
  // "2026-13-01" lexicographically > the fixed test horizon → returns true.
  assert.equal(isBeyondBookingHorizon("2026-13-01"), true);
});

test("exported MAX_BOOKING_HORIZON_DAYS is 180", () => {
  assert.equal(MAX_BOOKING_HORIZON_DAYS, 180);
});

test("exported Armenia UTC offset is 4 hours", () => {
  assert.equal(ARMENIA_UTC_OFFSET_HOURS, 4);
});
