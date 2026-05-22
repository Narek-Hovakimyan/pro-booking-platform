import assert from "node:assert/strict";
import { test } from "node:test";

import { getScheduleForDate } from "./bookingUtils.js";
import { normalizeAutoClosedWeeklySchedule } from "./scheduleUtils.js";

const dateKey = "2099-06-01";
const dayKey = "mon";
const defaultSchedule = {
  startTime: "10:00",
  endTime: "20:00",
  hasBreak: true,
  breakStart: "14:00",
  breakEnd: "15:00",
};
const oldAutoClosedWeeklySchedule = {
  sun: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  mon: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  tue: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  wed: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  thu: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  fri: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  sat: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
};

test("explicit non-working weekly day does not fall back to default schedule", () => {
  const schedule = {
    weeklySchedule: {
      [dayKey]: {
        working: false,
        from: "",
        to: "",
        breakFrom: "",
        breakTo: "",
      },
    },
    scheduleOverrides: {},
  };

  assert.deepEqual(getScheduleForDate(schedule, dateKey, dayKey, defaultSchedule), {
    working: false,
    from: "",
    to: "",
    breakFrom: "",
    breakTo: "",
  });
});

test("missing weekly day falls back to default schedule", () => {
  const schedule = {
    weeklySchedule: {},
    scheduleOverrides: {},
  };

  assert.deepEqual(getScheduleForDate(schedule, dateKey, dayKey, defaultSchedule), {
    working: true,
    from: "10:00",
    to: "20:00",
    breakFrom: "14:00",
    breakTo: "15:00",
  });
});

test("cleaned old all-days closed weekly schedule falls back to default schedule", () => {
  const schedule = {
    weeklySchedule: normalizeAutoClosedWeeklySchedule(oldAutoClosedWeeklySchedule),
    scheduleOverrides: {},
  };

  assert.deepEqual(getScheduleForDate(schedule, dateKey, "sat", defaultSchedule), {
    working: true,
    from: "10:00",
    to: "20:00",
    breakFrom: "14:00",
    breakTo: "15:00",
  });
});

test("invalid empty weekly day falls back to default schedule", () => {
  const schedule = {
    weeklySchedule: {
      [dayKey]: {
        working: true,
        from: "",
        to: "",
        breakFrom: "",
        breakTo: "",
      },
    },
    scheduleOverrides: {},
  };

  assert.deepEqual(getScheduleForDate(schedule, dateKey, dayKey, defaultSchedule), {
    working: true,
    from: "10:00",
    to: "20:00",
    breakFrom: "14:00",
    breakTo: "15:00",
  });
});

test("working weekly day with valid hours overrides default schedule", () => {
  const schedule = {
    weeklySchedule: {
      [dayKey]: {
        working: true,
        from: "12:00",
        to: "18:00",
        breakFrom: "",
        breakTo: "",
      },
    },
    scheduleOverrides: {},
  };

  assert.deepEqual(getScheduleForDate(schedule, dateKey, dayKey, defaultSchedule), {
    working: true,
    from: "12:00",
    to: "18:00",
    breakFrom: "",
    breakTo: "",
  });
});

test("date schedule override beats weekly schedule", () => {
  const schedule = {
    weeklySchedule: {
      [dayKey]: {
        working: true,
        from: "12:00",
        to: "18:00",
        breakFrom: "",
        breakTo: "",
      },
    },
    scheduleOverrides: {
      [dateKey]: {
        isWorking: true,
        startTime: "09:00",
        endTime: "11:00",
        breakStart: "",
        breakEnd: "",
      },
    },
  };

  assert.deepEqual(getScheduleForDate(schedule, dateKey, dayKey, defaultSchedule), {
    working: true,
    from: "09:00",
    to: "11:00",
    breakFrom: "",
    breakTo: "",
  });
});
