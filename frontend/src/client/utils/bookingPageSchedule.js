import {
  defaultPersonalSchedule,
  getDayScheduleFromDefaultSchedule,
  isWeeklyDayExplicit,
} from "@/shared/data/schedule";
import { timeToMinutes } from "@/shared/utils/time";

export const getEntityId = (entity) =>
  typeof entity === "string" ? entity : entity?.id || entity?._id || "";

export const getSalonEntryId = (salonEntry) => {
  if (!salonEntry) return "";
  if (typeof salonEntry === "string") return salonEntry;

  const explicitSalonId = getEntityId(salonEntry.salonId);
  if (explicitSalonId) return explicitSalonId;

  const nestedSalonId = getEntityId(salonEntry.salon);
  return nestedSalonId || getEntityId(salonEntry);
};

export const getApprovedSalonEntries = (barber) =>
  (Array.isArray(barber?.approvedSalons) && barber.approvedSalons.length > 0
    ? barber.approvedSalons
    : Array.isArray(barber?.salons)
      ? barber.salons
      : []
  ).filter(
    (salonEntry) =>
      salonEntry &&
      (salonEntry.status === "approved" || salonEntry.status === undefined)
  );

export const getSingleApprovedSalonId = (barber) => {
  const uniqueSalonIds = Array.from(
    new Set(getApprovedSalonEntries(barber).map(getSalonEntryId).filter(Boolean))
  );

  return uniqueSalonIds.length === 1 ? uniqueSalonIds[0] : "";
};

export const getStateSelectedSalonId = (state) =>
  state?.selectedSalonId || getEntityId(state?.salon) || null;

export const resolveBookingSalonId = ({
  querySelectedSalonId,
  stateSelectedSalonId,
  selectedSalonId,
  barber,
}) =>
  querySelectedSalonId ||
  stateSelectedSalonId ||
  selectedSalonId ||
  getSingleApprovedSalonId(barber) ||
  null;

export const getBookingScheduleEntry = ({
  schedule,
  barberId,
  barberDefaultSchedule,
}) =>
  schedule?.[barberId] || {
    weeklySchedule: {},
    dateSchedules: {},
    defaultSchedule: barberDefaultSchedule || defaultPersonalSchedule,
    nonWorkingDays: [],
  };

export const getScheduleOverrides = (scheduleEntry) =>
  scheduleEntry.scheduleOverrides || {};

export const getWeeklySchedule = (scheduleEntry) =>
  scheduleEntry.weeklySchedule || {};

export const getDefaultSchedule = (scheduleEntry, barberDefaultSchedule) =>
  scheduleEntry.defaultSchedule ||
  barberDefaultSchedule ||
  defaultPersonalSchedule;

const isMeaningfulWeeklyDay = (daySchedule) =>
  Boolean(daySchedule?.working) &&
  timeToMinutes(daySchedule.from) !== null &&
  timeToMinutes(daySchedule.to) !== null;

const getExplicitWeeklyDayOff = (daySchedule) =>
  daySchedule?.working === false
    ? {
        working: false,
        from: daySchedule.from || "",
        to: daySchedule.to || "",
        breakFrom: daySchedule.breakFrom || "",
        breakTo: daySchedule.breakTo || "",
      }
    : null;

export const getEffectiveDaySchedule = ({
  selectedOverride,
  selectedDateDayKey,
  weeklySchedule,
  scheduleEntry,
  defaultSchedule,
}) => {
  if (selectedOverride) {
    return {
      working: Boolean(selectedOverride.isWorking),
      from: selectedOverride.startTime || "",
      to: selectedOverride.endTime || "",
      breakFrom: selectedOverride.breakStart || "",
      breakTo: selectedOverride.breakEnd || "",
    };
  }

  const weeklyDaySchedule = selectedDateDayKey
    ? weeklySchedule[selectedDateDayKey]
    : null;
  const explicitWeeklyDayOff = getExplicitWeeklyDayOff(weeklyDaySchedule);
  const explicitWeeklyDay = isWeeklyDayExplicit(
    scheduleEntry,
    selectedDateDayKey
  );

  if (explicitWeeklyDay && explicitWeeklyDayOff) return explicitWeeklyDayOff;

  return explicitWeeklyDay && isMeaningfulWeeklyDay(weeklyDaySchedule)
    ? weeklyDaySchedule
    : getDayScheduleFromDefaultSchedule(defaultSchedule);
};
