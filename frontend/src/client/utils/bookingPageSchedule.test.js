import { describe, expect, it } from "vitest";

import {
  getApprovedSalonEntries,
  getBookingScheduleEntry,
  getDefaultSchedule,
  getEffectiveDaySchedule,
  getSingleApprovedSalonId,
  getStateSelectedSalonId,
  resolveBookingSalonId,
} from "./bookingPageSchedule";

const defaultSchedule = {
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
};

describe("bookingPageSchedule", () => {
  it("gives a date override precedence over explicit weekly and default schedules", () => {
    expect(getEffectiveDaySchedule({
      selectedOverride: {
        isWorking: false,
        startTime: "11:00",
        endTime: "16:00",
        breakStart: "13:00",
        breakEnd: "13:30",
      },
      selectedDateDayKey: "mon",
      weeklySchedule: { mon: { working: true, from: "10:00", to: "19:00" } },
      scheduleEntry: { explicitWeeklyDays: ["mon"] },
      defaultSchedule,
    })).toEqual({
      working: false,
      from: "11:00",
      to: "16:00",
      breakFrom: "13:00",
      breakTo: "13:30",
    });
  });

  it("uses explicit weekly hours but inherits the default for non-explicit weekdays", () => {
    const weeklySchedule = { mon: { working: true, from: "10:00", to: "17:00" } };

    expect(getEffectiveDaySchedule({
      selectedDateDayKey: "mon",
      weeklySchedule,
      scheduleEntry: { explicitWeeklyDays: ["mon"] },
      defaultSchedule,
    })).toBe(weeklySchedule.mon);
    expect(getEffectiveDaySchedule({
      selectedDateDayKey: "tue",
      weeklySchedule,
      scheduleEntry: { explicitWeeklyDays: ["mon"] },
      defaultSchedule,
    })).toEqual({ working: true, from: "09:00", to: "18:00", breakFrom: "", breakTo: "" });
  });

  it("preserves an explicit closed weekday", () => {
    expect(getEffectiveDaySchedule({
      selectedDateDayKey: "sun",
      weeklySchedule: { sun: { working: false } },
      scheduleEntry: { explicitWeeklyDays: ["sun"] },
      defaultSchedule,
    })).toEqual({ working: false, from: "", to: "", breakFrom: "", breakTo: "" });
  });

  it("filters approved salons and leaves multi-salon selection ambiguous", () => {
    const barber = {
      approvedSalons: [
        { id: "approved", status: "approved" },
        { id: "pending", status: "pending" },
        { id: "legacy" },
      ],
    };

    expect(getApprovedSalonEntries(barber)).toEqual([
      { id: "approved", status: "approved" },
      { id: "legacy" },
    ]);
    expect(getSingleApprovedSalonId(barber)).toBe("");
    expect(resolveBookingSalonId({ barber })).toBeNull();
  });

  it("resolves salon context in query, state, selected, then single-approved order", () => {
    const barber = { approvedSalons: [{ salon: { _id: "derived" } }] };

    expect(getStateSelectedSalonId({ salon: { id: "state" } })).toBe("state");
    expect(resolveBookingSalonId({
      querySelectedSalonId: "query",
      stateSelectedSalonId: "state",
      selectedSalonId: "selected",
      barber,
    })).toBe("query");
    expect(resolveBookingSalonId({ barber })).toBe("derived");
  });

  it("shapes missing schedule entries from barber and global defaults", () => {
    const barberSchedule = { startTime: "12:00", endTime: "20:00", hasBreak: false };
    const entry = getBookingScheduleEntry({
      schedule: {},
      barberId: "barber-1",
      barberDefaultSchedule: barberSchedule,
    });

    expect(getDefaultSchedule(entry)).toBe(barberSchedule);
    expect(getEffectiveDaySchedule({
      selectedDateDayKey: "wed",
      weeklySchedule: {},
      scheduleEntry: entry,
      defaultSchedule: getDefaultSchedule(entry),
    })).toEqual({ working: true, from: "12:00", to: "20:00", breakFrom: "", breakTo: "" });
    expect(getDefaultSchedule({}, null)).toMatchObject({ startTime: "09:00", endTime: "18:00" });
  });
});
