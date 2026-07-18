import assert from "node:assert/strict";
import { test } from "node:test";

import { getTodayFirstAvailableSlot } from "./barberCardAvailability.js";

const dateKey = "2099-06-01";
const now = new Date(`${dateKey}T08:00:00+04:00`);
const salon = {
  _id: "salon-a",
  id: "salon-a",
  name: "Salon A",
  status: "approved",
  defaultSchedule: {
    startTime: "09:00",
    endTime: "12:00",
    hasBreak: false,
  },
};
const service = {
  _id: "service-a",
  barberId: "barber-a",
  active: true,
  duration: 20,
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

const makeSalon = ({
  startTime = "10:00",
  endTime = "12:00",
  hasBreak = false,
  breakStart = "",
  breakEnd = "",
  id = "salon-a",
  name = "Salon A",
} = {}) => ({
  ...salon,
  _id: id,
  id,
  name,
  defaultSchedule: {
    startTime,
    endTime,
    hasBreak,
    breakStart,
    breakEnd,
  },
});

const makeService = (duration) => ({
  ...service,
  duration,
});

const getAvailability = (bookings = [], overrides = {}) =>
  getTodayFirstAvailableSlot({
    salons: [salon],
    services: [service],
    bookings,
    now,
    ...overrides,
  });

test("pending, accepted, and confirmed bookings block first card availability slot", () => {
  for (const status of ["pending", "accepted", "confirmed"]) {
    const result = getAvailability([
      {
        status,
        bookingDate: dateKey,
        time: "09:00",
        duration: 20,
      },
    ]);

    assert.equal(result.status, "ready");
    assert.equal(result.firstAvailableSlot.time, "09:20");
  }
});

test("non-blocking booking statuses do not block first card availability slot", () => {
  for (const status of [
    "no_show",
    "late_cancelled",
    "rejected",
    "cancelled",
    "completed",
    "expired",
  ]) {
    const result = getAvailability([
      {
        status,
        bookingDate: dateKey,
        time: "09:00",
        duration: 20,
      },
    ]);

    assert.equal(result.status, "ready");
    assert.equal(result.firstAvailableSlot.time, "09:00");
  }
});

test("30-minute booking blocks 10-minute slots until the half-open end", () => {
  const bookings = [
    {
      status: "accepted",
      bookingDate: dateKey,
      time: "10:00",
      duration: 30,
    },
  ];
  const result = getAvailability(bookings, {
    salons: [makeSalon({ startTime: "10:10" })],
    services: [makeService(30)],
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot.time, "10:30");
});

test("40-minute booking blocks 10:10, 10:20, and 10:30 on 10-minute grid", () => {
  const bookings = [
    {
      status: "accepted",
      bookingDate: dateKey,
      time: "10:00",
      duration: 40,
    },
  ];
  const result = getAvailability(bookings, {
    salons: [makeSalon({ startTime: "10:10" })],
    services: [makeService(40)],
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot.time, "10:40");
});

test("45-minute booking blocks 10-minute slots through 10:40", () => {
  const bookings = [
    {
      status: "accepted",
      bookingDate: dateKey,
      time: "10:00",
      duration: 45,
    },
  ];
  const result = getAvailability(bookings, {
    salons: [makeSalon({ startTime: "10:10" })],
    services: [makeService(45)],
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot.time, "10:50");
});

test("booking ending exactly at a new slot start does not block that slot", () => {
  const result = getAvailability([
    {
      status: "accepted",
      bookingDate: dateKey,
      time: "10:00",
      duration: 30,
    },
  ], {
    salons: [makeSalon({ startTime: "10:30" })],
    services: [makeService(20)],
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot.time, "10:30");
});

test("break edges allow exact end/start and block one-minute overlap", () => {
  const breakSalon = makeSalon({
    startTime: "10:10",
    endTime: "12:00",
    hasBreak: true,
    breakStart: "10:30",
    breakEnd: "10:40",
  });

  const endingAtBreakStart = getAvailability([], {
    salons: [breakSalon],
    services: [makeService(20)],
  });
  const startingAtBreakEnd = getAvailability([], {
    salons: [makeSalon({
      startTime: "10:40",
      endTime: "12:00",
      hasBreak: true,
      breakStart: "10:30",
      breakEnd: "10:40",
    })],
    services: [makeService(20)],
  });
  const overlappingBreakByOneMinute = getAvailability([], {
    salons: [breakSalon],
    services: [makeService(21)],
  });

  assert.equal(endingAtBreakStart.firstAvailableSlot.time, "10:10");
  assert.equal(startingAtBreakEnd.firstAvailableSlot.time, "10:40");
  assert.equal(overlappingBreakByOneMinute.firstAvailableSlot.time, "10:40");
});

test("card availability reports no services without checking slots", () => {
  const result = getAvailability([], {
    services: [{ ...service, active: false }],
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot, null);
  assert.equal(result.reason, "no-services");
});

test("card availability reports unavailable when no approved salon schedule can be used", () => {
  const result = getTodayFirstAvailableSlot({
    salons: [],
    services: [service],
    bookings: [],
    now,
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.firstAvailableSlot, null);
  assert.equal(result.reason, "schedule-unavailable");
});

test("weekly non-working day closes card availability without falling back to default", () => {
  const result = getAvailability([], {
    schedulesBySalonId: new Map([
      [
        "salon-a",
        {
          weeklySchedule: {
            mon: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
          },
          defaultSchedule: {
            startTime: "09:00",
            endTime: "12:00",
            hasBreak: false,
          },
        },
      ],
    ]),
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot, null);
  assert.equal(result.reason, "no-availability-today");
});

test("weekly working hours override default card availability hours", () => {
  const result = getAvailability([], {
    schedulesBySalonId: new Map([
      [
        "salon-a",
        {
          weeklySchedule: {
            mon: { working: true, from: "10:00", to: "12:00", breakFrom: "", breakTo: "" },
          },
          defaultSchedule: {
            startTime: "09:00",
            endTime: "12:00",
            hasBreak: false,
          },
        },
      ],
    ]),
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot.time, "10:00");
});

test("date override beats weekly card availability schedule", () => {
  const result = getAvailability([], {
    schedulesBySalonId: new Map([
      [
        "salon-a",
        {
          weeklySchedule: {
            mon: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
          },
          scheduleOverrides: {
            [dateKey]: {
              isWorking: true,
              startTime: "10:00",
              endTime: "12:00",
              breakStart: "",
              breakEnd: "",
            },
          },
        },
      ],
    ]),
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot.time, "10:00");
});

test("non-working day closes card availability", () => {
  const result = getAvailability([], {
    schedulesBySalonId: new Map([
      [
        "salon-a",
        {
          weeklySchedule: {
            mon: { working: true, from: "09:00", to: "12:00", breakFrom: "", breakTo: "" },
          },
          nonWorkingDays: [dateKey],
        },
      ],
    ]),
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot, null);
  assert.equal(result.reason, "no-availability-today");
});

test("missing weekly day falls back to default card availability hours", () => {
  const result = getAvailability([], {
    salons: [
      {
        _id: "salon-a",
        id: "salon-a",
        name: "Salon A",
        status: "approved",
      },
    ],
    schedulesBySalonId: new Map([
      [
        "salon-a",
        {
          weeklySchedule: {},
          defaultSchedule: {
            startTime: "10:00",
            endTime: "12:00",
            hasBreak: false,
          },
        },
      ],
    ]),
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot.time, "10:00");
});

test("old auto-closed weekly schedule falls back to default card availability hours", () => {
  const result = getTodayFirstAvailableSlot({
    salons: [
      {
        ...salon,
        defaultSchedule: {
          startTime: "10:00",
          endTime: "12:00",
          hasBreak: false,
        },
      },
    ],
    services: [service],
    bookings: [],
    now,
    schedulesBySalonId: new Map([
      [
        "salon-a",
        {
          weeklySchedule: oldAutoClosedWeeklySchedule,
          defaultSchedule: {
            startTime: "10:00",
            endTime: "12:00",
            hasBreak: false,
          },
        },
      ],
    ]),
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot.time, "10:00");
});

test("multi-salon card availability does not inherit fallback weekly closure", () => {
  const salonB = {
    _id: "salon-b",
    id: "salon-b",
    name: "Salon B",
    status: "approved",
  };
  const result = getTodayFirstAvailableSlot({
    salons: [salonB],
    services: [service],
    bookings: [],
    now,
    fallbackSchedule: {
      weeklySchedule: {
        mon: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
      },
      defaultSchedule: {
        startTime: "10:00",
        endTime: "12:00",
        hasBreak: false,
      },
    },
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot.time, "10:00");
  assert.equal(result.firstAvailableSlot.salonId, "salon-b");
});

test("multi-salon card availability respects evaluated salon weekly closure", () => {
  const salonB = {
    _id: "salon-b",
    id: "salon-b",
    name: "Salon B",
    status: "approved",
  };
  const result = getTodayFirstAvailableSlot({
    salons: [salonB],
    services: [service],
    bookings: [],
    now,
    fallbackSchedule: {
      defaultSchedule: {
        startTime: "10:00",
        endTime: "12:00",
        hasBreak: false,
      },
    },
    schedulesBySalonId: new Map([
      [
        "salon-b",
        {
          weeklySchedule: {
            mon: { working: false, from: "", to: "", breakFrom: "", breakTo: "" },
          },
        },
      ],
    ]),
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot, null);
  assert.equal(result.reason, "no-availability-today");
});

// ─── Multi-salon tests ───

test("multi‑salon: picks earliest time across all approved salons", () => {
  const salon1 = makeSalon({
    startTime: "10:00",
    endTime: "17:00",
    id: "salon-1",
    name: "Salon 1",
  });
  const salon2 = makeSalon({
    startTime: "09:00",
    endTime: "15:00",
    id: "salon-2",
    name: "Salon 2",
  });

  // Salon 1 starts at 10:00 → first slot 10:00
  // Salon 2 starts at 09:00 → first slot 09:00
  const result = getTodayFirstAvailableSlot({
    salons: [salon1, salon2],
    services: [service],
    bookings: [],
    now,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot.time, "09:00");
  assert.equal(result.firstAvailableSlot.salonId, "salon-2");
  assert.equal(result.firstAvailableSlot.salonName, "Salon 2");
});

test("multi‑salon: picks earliest time regardless of salon order (later salon has earlier time)", () => {
  const salon1 = makeSalon({
    startTime: "14:00",
    endTime: "17:00",
    id: "salon-1",
    name: "Salon 1",
  });
  const salon2 = makeSalon({
    startTime: "09:00",
    endTime: "12:00",
    id: "salon-2",
    name: "Salon 2",
  });

  const result = getTodayFirstAvailableSlot({
    salons: [salon1, salon2], // salon 1 appears first but has later time
    services: [service],
    bookings: [],
    now,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot.time, "09:00");
  assert.equal(result.firstAvailableSlot.salonId, "salon-2");
  assert.equal(result.firstAvailableSlot.salonName, "Salon 2");
});

test("multi‑salon: when two salons have same first time, preserves salon order", () => {
  const salon1 = makeSalon({
    startTime: "10:00",
    endTime: "17:00",
    id: "salon-1",
    name: "Salon 1",
  });
  const salon2 = makeSalon({
    startTime: "10:00",
    endTime: "17:00",
    id: "salon-2",
    name: "Salon 2",
  });

  // Both salons have first slot 10:00 → should pick salon 1 (first in array)
  const result = getTodayFirstAvailableSlot({
    salons: [salon1, salon2],
    services: [service],
    bookings: [],
    now,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot.time, "10:00");
  assert.equal(result.firstAvailableSlot.salonId, "salon-1");
});

test("multi‑salon: when first salon has no availability, falls back to next salon", () => {
  const salonNoAvail = makeSalon({
    startTime: "09:00",
    endTime: "09:30",  // too short for 20-min service at 09:00 (slot 09:00-09:20) and 09:10 (slot 09:10-09:30) → actually 09:00 fits in 09:00-09:30
    id: "salon-none",
    name: "No Avail Salon",
  });
  const salonWithAvail = makeSalon({
    startTime: "10:00",
    endTime: "12:00",
    id: "salon-ok",
    name: "Avail Salon",
  });

  // Salon "no avail" has start/end too short: 09:00-09:30 means 09:00 slot ends at 09:20 (OK), 09:10 slot ends at 09:30 (OK)
  // Actually both fit. Let me make it so it's either closed or doesn't match.

  // Use a truly unavailable salon — make the endTime impossible for 20min
  const salonClosed = makeSalon({
    startTime: "09:00",
    endTime: "09:15", // too short for any 20-min slot
    id: "salon-closed",
    name: "Closed Salon",
  });

  const result = getTodayFirstAvailableSlot({
    salons: [salonClosed, salonWithAvail],
    services: [makeService(20)],
    bookings: [],
    now,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot.time, "10:00");
  assert.equal(result.firstAvailableSlot.salonId, "salon-ok");
  assert.equal(result.firstAvailableSlot.salonName, "Avail Salon");
});

test("multi‑salon: no availability in any salon returns no-availability-today", () => {
  const salon1 = makeSalon({
    startTime: "09:00",
    endTime: "09:00", // zero duration — no slots
    id: "salon-bad1",
    name: "Bad Salon 1",
  });
  const salon2 = makeSalon({
    startTime: "09:00",
    endTime: "09:00", // zero duration — no slots
    id: "salon-bad2",
    name: "Bad Salon 2",
  });

  const result = getTodayFirstAvailableSlot({
    salons: [salon1, salon2],
    services: [service],
    bookings: [],
    now,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot, null);
  assert.equal(result.reason, "no-availability-today");
});

test("exact contexts use override hours and breaks without fallback", () => {
  const result = getTodayFirstAvailableSlot({
    contexts: [
      {
        salonId: "salon-a",
        salonName: "Salon A",
        schedule: {
          weeklySchedule: {},
          scheduleOverrides: {
            [dateKey]: {
              isWorking: true,
              startTime: "10:10",
              endTime: "12:00",
              breakStart: "10:30",
              breakEnd: "10:40",
            },
          },
          nonWorkingDays: [],
        },
      },
    ],
    services: [makeService(21)],
    bookings: [],
    now,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot.time, "10:40");
  assert.equal(result.firstAvailableSlot.salonId, "salon-a");
});

test("exact contexts honor non-working days and return no availability today", () => {
  const result = getTodayFirstAvailableSlot({
    contexts: [
      {
        salonId: null,
        salonName: "",
        schedule: {
          weeklySchedule: {
            mon: { working: true, from: "09:00", to: "12:00", breakFrom: "", breakTo: "" },
          },
          nonWorkingDays: [dateKey],
        },
      },
    ],
    services: [service],
    bookings: [],
    now,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.firstAvailableSlot, null);
  assert.equal(result.reason, "no-availability-today");
});

test("exact contexts ignore default-only schedules and cross-context fallback", () => {
  const result = getTodayFirstAvailableSlot({
    contexts: [
      {
        salonId: "salon-a",
        salonName: "Salon A",
        schedule: {
          weeklySchedule: {},
          defaultSchedule: {
            startTime: "09:00",
            endTime: "18:00",
            hasBreak: false,
          },
        },
      },
    ],
    services: [service],
    bookings: [],
    now,
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.firstAvailableSlot, null);
  assert.equal(result.reason, "schedule-unavailable");
});
