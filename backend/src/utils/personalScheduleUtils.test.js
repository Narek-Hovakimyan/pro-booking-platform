import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCanonicalPersonalSchedule,
  getPersonalScheduleRequestWeeklySchedule,
  PersonalScheduleValidationError,
  validatePersonalWeeklySchedule,
} from "./personalScheduleUtils.js";

const validWeeklySchedule = () => createCanonicalPersonalSchedule().weeklySchedule;

const assertInvalid = (value) => {
  assert.throws(
    () => validatePersonalWeeklySchedule(value),
    PersonalScheduleValidationError
  );
};

test("canonical personal schedule default is exact and freshly allocated", () => {
  const first = createCanonicalPersonalSchedule();
  const second = createCanonicalPersonalSchedule();

  assert.deepEqual(Object.keys(first.weeklySchedule), [
    "sun", "mon", "tue", "wed", "thu", "fri", "sat",
  ]);
  assert.deepEqual(first.weeklySchedule.sun, {
    working: false, from: "", to: "", breakFrom: "", breakTo: "",
  });
  assert.deepEqual(first.weeklySchedule.mon, {
    working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "",
  });
  assert.deepEqual(first.weeklySchedule.sat, first.weeklySchedule.sun);
  assert.deepEqual(first.defaultSchedule, {
    startTime: "09:00", endTime: "18:00", hasBreak: false, breakStart: "", breakEnd: "",
  });
  assert.deepEqual(first.nonWorkingDays, []);
  assert.notEqual(first.weeklySchedule, second.weeklySchedule);
  assert.notEqual(first.weeklySchedule.mon, second.weeklySchedule.mon);
  assert.notEqual(first.nonWorkingDays, second.nonWorkingDays);
});

test("personal weekly validation returns a fresh canonical seven-day schedule", () => {
  const input = validWeeklySchedule();
  input.mon.breakFrom = "12:00";
  input.mon.breakTo = "13:00";
  input.sun.from = "hidden";
  const result = validatePersonalWeeklySchedule(input);

  assert.deepEqual(result.mon, {
    working: true, from: "09:00", to: "18:00", breakFrom: "12:00", breakTo: "13:00",
  });
  assert.deepEqual(result.sun, {
    working: false, from: "", to: "", breakFrom: "", breakTo: "",
  });
  assert.notEqual(result, input);
  assert.deepEqual(input.sun.from, "hidden");
});

test("personal weekly validation rejects invalid shapes and time ranges", () => {
  const missingDay = validWeeklySchedule();
  delete missingDay.mon;
  assertInvalid(missingDay);

  const unknownDay = validWeeklySchedule();
  unknownDay.monday = unknownDay.mon;
  assertInvalid(unknownDay);

  const inherited = Object.create({ mon: validWeeklySchedule().mon });
  Object.assign(inherited, validWeeklySchedule());
  delete inherited.mon;
  assertInvalid(inherited);

  const invalidWorking = validWeeklySchedule();
  invalidWorking.mon.working = "true";
  assertInvalid(invalidWorking);

  for (const [from, to] of [["9:00", "18:00"], ["09:00", "09:00"], ["18:00", "09:00"]]) {
    const invalidTime = validWeeklySchedule();
    invalidTime.mon.from = from;
    invalidTime.mon.to = to;
    assertInvalid(invalidTime);
  }
});

test("personal weekly validation rejects invalid breaks, all-days-off, and unknown fields", () => {
  const incompleteBreak = validWeeklySchedule();
  incompleteBreak.mon.breakFrom = "12:00";
  assertInvalid(incompleteBreak);

  const outsideBreak = validWeeklySchedule();
  outsideBreak.mon.breakFrom = "08:00";
  outsideBreak.mon.breakTo = "10:00";
  assertInvalid(outsideBreak);

  const backwardsBreak = validWeeklySchedule();
  backwardsBreak.mon.breakFrom = "13:00";
  backwardsBreak.mon.breakTo = "12:00";
  assertInvalid(backwardsBreak);

  const allOff = validWeeklySchedule();
  for (const day of Object.values(allOff)) day.working = false;
  assertInvalid(allOff);

  const unknownDailyField = validWeeklySchedule();
  unknownDailyField.mon.extra = true;
  assertInvalid(unknownDailyField);

  assert.throws(
    () => getPersonalScheduleRequestWeeklySchedule({ weeklySchedule: validWeeklySchedule(), salonId: null }),
    PersonalScheduleValidationError
  );
});

test("personal schedule validation safely rejects hostile getters and alternate containers", () => {
  const hostile = validWeeklySchedule();
  Object.defineProperty(hostile.mon, "from", {
    enumerable: true,
    get() { throw new Error("hostile"); },
  });
  assertInvalid(hostile);
  assertInvalid([]);
  assertInvalid(new Map());
});
