import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  getArmeniaDateKey,
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
  // This only does regex matching, not date validation.
  // "2026-13-01" lexicographically > any realistic horizon → returns true.
  assert.equal(isBeyondBookingHorizon("2026-13-01"), true);
});

test("exported MAX_BOOKING_HORIZON_DAYS is 180", () => {
  assert.equal(MAX_BOOKING_HORIZON_DAYS, 180);
});
