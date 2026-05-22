import assert from "node:assert/strict";
import { mock, test } from "node:test";

import {
  getTodayKey,
  normalizeAutoClosedWeeklySchedule,
  sanitizeDateSchedules,
  sanitizeScheduleOverrides,
  sanitizeWeeklySchedule,
} from "./scheduleUtils.js";

const oldAutoClosedWeeklySchedule = {
  sun: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  mon: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  tue: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  wed: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  thu: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  fri: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  sat: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
};

test("sanitizeWeeklySchedule keeps missing weekly days absent", () => {
  assert.deepEqual(sanitizeWeeklySchedule({}), {});
});

test("getTodayKey uses Armenia date instead of server-local UTC date", () => {
  mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-05-21T20:30:00.000Z"),
  });

  try {
    assert.equal(getTodayKey(), "2026-05-22");
  } finally {
    mock.timers.reset();
  }
});

test("schedule date sanitizers filter dates using Armenia today", () => {
  mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-05-21T20:30:00.000Z"),
  });

  try {
    assert.deepEqual(
      sanitizeDateSchedules({
        "2026-05-21": { working: true, from: "09:00", to: "13:00" },
        "2026-05-22": { working: true, from: "10:00", to: "14:00" },
      }),
      {
        "2026-05-22": {
          working: true,
          from: "10:00",
          to: "14:00",
          breakFrom: "",
          breakTo: "",
        },
      }
    );

    assert.deepEqual(
      sanitizeScheduleOverrides({
        "2026-05-21": {
          isWorking: true,
          startTime: "09:00",
          endTime: "13:00",
        },
        "2026-05-22": {
          isWorking: true,
          startTime: "10:00",
          endTime: "14:00",
        },
      }),
      {
        "2026-05-22": {
          isWorking: true,
          startTime: "10:00",
          endTime: "14:00",
          breakStart: "",
          breakEnd: "",
        },
      }
    );
  } finally {
    mock.timers.reset();
  }
});

test("sanitizeWeeklySchedule preserves explicit weekly day off", () => {
  assert.deepEqual(
    sanitizeWeeklySchedule({
      sat: { working: false },
    }),
    {
      sat: {
        working: false,
        from: "",
        to: "",
        breakFrom: "",
        breakTo: "",
      },
    }
  );
});

test("sanitizeWeeklySchedule preserves valid working weekly day", () => {
  assert.deepEqual(
    sanitizeWeeklySchedule({
      sat: {
        working: true,
        from: "09:00",
        to: "13:00",
        breakFrom: "",
        breakTo: "",
      },
    }),
    {
      sat: {
        working: true,
        from: "09:00",
        to: "13:00",
        breakFrom: "",
        breakTo: "",
      },
    }
  );
});

test("sanitizeWeeklySchedule omits invalid working day without hours", () => {
  assert.deepEqual(
    sanitizeWeeklySchedule({
      sat: { working: true },
    }),
    {}
  );
});

test("normalizeAutoClosedWeeklySchedule clears old all-days closed sanitizer output", () => {
  assert.deepEqual(
    normalizeAutoClosedWeeklySchedule(oldAutoClosedWeeklySchedule),
    {}
  );
});

test("normalizeAutoClosedWeeklySchedule preserves a single explicit weekly day off", () => {
  const weeklySchedule = {
    sat: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
  };

  assert.deepEqual(normalizeAutoClosedWeeklySchedule(weeklySchedule), weeklySchedule);
});

test("normalizeAutoClosedWeeklySchedule preserves valid weekly working day", () => {
  const weeklySchedule = {
    ...oldAutoClosedWeeklySchedule,
    sat: { working: true, from: "09:00", to: "13:00", breakFrom: "", breakTo: "" },
  };

  assert.deepEqual(normalizeAutoClosedWeeklySchedule(weeklySchedule), weeklySchedule);
});
