import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeSalonDefaultSchedule } from "./salonScheduleUtils.js";

test("normalizes valid salon default schedule without break", () => {
  assert.deepEqual(
    normalizeSalonDefaultSchedule({
      startTime: "09:00",
      endTime: "18:00",
      hasBreak: false,
      breakStart: "13:00",
      breakEnd: "14:00",
    }),
    {
      startTime: "09:00",
      endTime: "18:00",
      hasBreak: false,
      breakStart: "",
      breakEnd: "",
    }
  );
});

test("normalizes valid salon default schedule with break", () => {
  assert.deepEqual(
    normalizeSalonDefaultSchedule({
      startTime: "10:30",
      endTime: "18:00",
      hasBreak: true,
      breakStart: "14:00",
      breakEnd: "15:00",
    }),
    {
      startTime: "10:30",
      endTime: "18:00",
      hasBreak: true,
      breakStart: "14:00",
      breakEnd: "15:00",
    }
  );
});

test("rejects invalid salon default start or end format", () => {
  assert.throws(
    () =>
      normalizeSalonDefaultSchedule({
        startTime: "9:00",
        endTime: "18:00",
        hasBreak: false,
      }),
    /Times must use HH:mm format/
  );
});

test("rejects salon default end time before or equal start time", () => {
  for (const endTime of ["09:00", "08:59"]) {
    assert.throws(
      () =>
        normalizeSalonDefaultSchedule({
          startTime: "09:00",
          endTime,
          hasBreak: false,
        }),
      /End time must be later than start time/
    );
  }
});

test("rejects invalid salon default break format", () => {
  assert.throws(
    () =>
      normalizeSalonDefaultSchedule({
        startTime: "09:00",
        endTime: "18:00",
        hasBreak: true,
        breakStart: "1:00",
        breakEnd: "14:00",
      }),
    /Break times must use HH:mm format/
  );
});

test("rejects salon default break end before or equal break start", () => {
  for (const breakEnd of ["13:00", "12:59"]) {
    assert.throws(
      () =>
        normalizeSalonDefaultSchedule({
          startTime: "09:00",
          endTime: "18:00",
          hasBreak: true,
          breakStart: "13:00",
          breakEnd,
        }),
      /Break end must be later than break start/
    );
  }
});

test("rejects salon default break outside working hours", () => {
  assert.throws(
    () =>
      normalizeSalonDefaultSchedule({
        startTime: "09:00",
        endTime: "18:00",
        hasBreak: true,
        breakStart: "08:59",
        breakEnd: "10:00",
      }),
    /Break time must be inside working hours/
  );

  assert.throws(
    () =>
      normalizeSalonDefaultSchedule({
        startTime: "09:00",
        endTime: "18:00",
        hasBreak: true,
        breakStart: "17:00",
        breakEnd: "18:01",
      }),
    /Break time must be inside working hours/
  );
});
