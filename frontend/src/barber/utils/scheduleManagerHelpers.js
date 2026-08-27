import { defaultPersonalSchedule } from "@/shared/data/schedule";
import { cn } from "@/shared/lib/utils";
import {
  getArmeniaTodayKey,
  getNext7ArmeniaDays,
  parseDateKey,
} from "@/shared/utils/dates";
import { getDayScheduleFromDefaultSchedule } from "@/shared/data/schedule";
import { timeToMinutes } from "@/shared/utils/time";
import { normalizeDefaultScheduleDraft } from "@/barber/utils/scheduleHelpers";

export const timeInputClass = (hasError) =>
  cn(
    "h-12 w-full rounded-2xl border border-purple-100 bg-white px-3 py-2 text-sm font-normal tabular-nums text-neutral-900 shadow-sm transition",
    "focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100",
    "disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 disabled:opacity-60",
    hasError &&
      "border-red-400 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-200"
  );

export const isCurrentOrFutureDateKey = (dateKey, todayKey) =>
  Boolean(parseDateKey(dateKey)) && dateKey >= todayKey;

export const filterCurrentScheduleOverrides = (scheduleOverrides = {}, todayKey) =>
  Object.fromEntries(
    Object.entries(scheduleOverrides || {}).filter(([dateKey]) =>
      isCurrentOrFutureDateKey(dateKey, todayKey)
    )
  );

export const filterCurrentNonWorkingDays = (nonWorkingDays = [], todayKey) =>
  Array.from(
    new Set(
      (Array.isArray(nonWorkingDays) ? nonWorkingDays : []).filter((dateKey) =>
        isCurrentOrFutureDateKey(dateKey, todayKey)
      )
    )
  );

export const getNormalizedDateOverride = ({
  selectedDateKey,
  scheduleOverrides,
  nonWorkingDays,
  defaultDaySchedule,
}) => {
  const override = scheduleOverrides?.[selectedDateKey];

  if (override) {
    return {
      isWorking: Boolean(override.isWorking),
      startTime: override.startTime || "",
      endTime: override.endTime || "",
      breakStart: override.breakStart || "",
      breakEnd: override.breakEnd || "",
    };
  }

  return {
    isWorking: !nonWorkingDays.includes(selectedDateKey) && defaultDaySchedule.working,
    startTime: defaultDaySchedule.from,
    endTime: defaultDaySchedule.to,
    breakStart: defaultDaySchedule.breakFrom,
    breakEnd: defaultDaySchedule.breakTo,
  };
};

export const getDateStatusMap = ({
  dateOptions,
  scheduleOverrides,
  nonWorkingDays,
  todayKey,
  selectedDateKey,
}) => {
  const map = {};

  dateOptions.forEach(({ value }) => {
    const inOverride = Boolean(scheduleOverrides[value]);
    const isDayOff =
      nonWorkingDays.includes(value) ||
      (inOverride && scheduleOverrides[value].isWorking === false);

    map[value] = {
      isDefault: !inOverride && !isDayOff,
      isCustom: inOverride && scheduleOverrides[value].isWorking !== false,
      isDayOff,
      isPast: value < todayKey,
      isSelected: value === selectedDateKey,
    };
  });

  return map;
};

export const hasUnsavedDateChanges = (activeDraft, normalizedOverride) =>
  ["isWorking", "startTime", "endTime", "breakStart", "breakEnd"].some(
    (field) =>
      String(activeDraft[field] || "") !== String(normalizedOverride[field] || "")
  );

export const getScheduleManagerFieldErrors = (validationMessage) => {
  const errs = {
    startTime: "",
    endTime: "",
    breakStart: "",
    breakEnd: "",
    general: "",
  };

  if (!validationMessage) {
    return errs;
  }

  if (
    validationMessage.includes("Work start") &&
    validationMessage.includes("End time")
  ) {
    errs.startTime = validationMessage;
    errs.endTime = validationMessage;
  } else if (validationMessage.includes("End time")) {
    errs.endTime = validationMessage;
  } else if (validationMessage.includes("Break end must be later")) {
    errs.breakEnd = validationMessage;
  } else if (
    validationMessage.includes("Break start") &&
    validationMessage.includes("Break end")
  ) {
    errs.breakStart = validationMessage;
    errs.breakEnd = validationMessage;
  } else if (validationMessage.includes("Break time must be inside")) {
    errs.breakStart = validationMessage;
    errs.breakEnd = validationMessage;
  } else if (validationMessage.includes("Break")) {
    errs.breakStart = validationMessage;
    errs.breakEnd = validationMessage;
  } else {
    errs.general = validationMessage;
  }

  return errs;
};

export const getScheduleSaveRequestPayload = ({
  currentUserId,
  effectiveSchedule,
  updates,
  scheduleOverrides,
  nonWorkingDays,
  currentDefaultSchedule,
}) => {
  const explicitWeeklyDays = Object.hasOwn(updates, "explicitWeeklyDays")
    ? updates.explicitWeeklyDays
    : effectiveSchedule.explicitWeeklyDays;

  return {
    barberId: currentUserId,
    weeklySchedule: effectiveSchedule.weeklySchedule || {},
    ...(Array.isArray(explicitWeeklyDays) ? { explicitWeeklyDays } : {}),
    dateSchedules: effectiveSchedule.dateSchedules || {},
    scheduleOverrides: updates.scheduleOverrides || scheduleOverrides,
    nonWorkingDays: updates.nonWorkingDays || nonWorkingDays,
    defaultSchedule: updates.defaultSchedule || currentDefaultSchedule,
  };
};

export const getSelectedDateScheduleSavePlan = ({
  activeDraft,
  selectedDateKey,
  scheduleOverrides,
  nonWorkingDays,
  isNonWorkingDay,
}) => {
  if (!activeDraft.isWorking) {
    return {
      confirmMessage: isNonWorkingDay ? "" : "Mark this day as non-working?",
      updates: {
        scheduleOverrides: {
          ...scheduleOverrides,
          [selectedDateKey]: { isWorking: false },
        },
        nonWorkingDays: Array.from(
          new Set([...nonWorkingDays, selectedDateKey])
        ),
      },
    };
  }

  const startMinutes = timeToMinutes(activeDraft.startTime);
  const endMinutes = timeToMinutes(activeDraft.endTime);
  const breakStartFilled = Boolean(activeDraft.breakStart);
  const breakEndFilled = Boolean(activeDraft.breakEnd);
  const breakStartMinutes = timeToMinutes(activeDraft.breakStart);
  const breakEndMinutes = timeToMinutes(activeDraft.breakEnd);

  if (startMinutes === null || endMinutes === null) {
    return {
      error: "Work start and work end are required in HH:mm format.",
    };
  }

  if (endMinutes <= startMinutes) {
    return {
      error: "End time must be later than start time.",
    };
  }

  if (breakStartFilled !== breakEndFilled) {
    return {
      error: "Break start and break end must both be filled or both empty.",
    };
  }

  if (breakStartFilled && (breakStartMinutes === null || breakEndMinutes === null)) {
    return {
      error: "Break time must use HH:mm format.",
    };
  }

  if (breakStartFilled && breakEndMinutes <= breakStartMinutes) {
    return {
      error: "Break end must be later than break start.",
    };
  }

  if (
    breakStartFilled &&
    (breakStartMinutes < startMinutes || breakEndMinutes > endMinutes)
  ) {
    return {
      error: "Break time must be inside working hours.",
    };
  }

  return {
    updates: {
      scheduleOverrides: {
        ...scheduleOverrides,
        [selectedDateKey]: {
          isWorking: true,
          startTime: activeDraft.startTime,
          endTime: activeDraft.endTime,
          breakStart: activeDraft.breakStart || "",
          breakEnd: activeDraft.breakEnd || "",
        },
      },
      nonWorkingDays: nonWorkingDays.filter((day) => day !== selectedDateKey),
    },
  };
};

export const getDefaultDateOverrideDraft = (
  selectedDateKey,
  normalizedOverride
) => ({
  dateKey: selectedDateKey,
  ...normalizedOverride,
});

export const getResetDateOverrideDraft = ({
  selectedDateKey,
  defaultDaySchedule,
}) => ({
  dateKey: selectedDateKey,
  isWorking: defaultDaySchedule.working,
  startTime: defaultDaySchedule.from,
  endTime: defaultDaySchedule.to,
  breakStart: defaultDaySchedule.breakFrom,
  breakEnd: defaultDaySchedule.breakTo,
});

export const getFallbackDefaultSchedule = () => defaultPersonalSchedule;

export const getScheduleManagerViewState = ({
  schedule,
  activePerSalonSchedule,
  selectedDate,
  draftOverride,
  validationState,
  breakToggleState,
  activeSalonId,
  isLoading,
  isLoadingSalons,
  isPerSalonLoading,
  perSalonError,
  error,
}) => {
  const effectiveSchedule = activePerSalonSchedule || schedule;
  const currentDefaultSchedule = normalizeDefaultScheduleDraft(
    effectiveSchedule.defaultSchedule
  );
  const defaultDaySchedule = getDayScheduleFromDefaultSchedule(
    currentDefaultSchedule
  );
  const dateOptions = getNext7ArmeniaDays().map((option) => ({
    ...option,
    date: parseDateKey(option.value),
  }));
  const todayKey = getArmeniaTodayKey();
  const scheduleOverrides = filterCurrentScheduleOverrides(
    effectiveSchedule.scheduleOverrides || {},
    todayKey
  );
  const nonWorkingDays = filterCurrentNonWorkingDays(
    effectiveSchedule.nonWorkingDays || [],
    todayKey
  );
  const selectedDateObject = parseDateKey(selectedDate) || dateOptions[0].date;
  const selectedDateKey = selectedDateObject ? selectedDate : dateOptions[0].value;
  const normalizedOverride = getNormalizedDateOverride({
    selectedDateKey,
    scheduleOverrides,
    nonWorkingDays,
    defaultDaySchedule,
  });
  const activeDraft =
    draftOverride.dateKey === selectedDateKey
      ? draftOverride
      : getDefaultDateOverrideDraft(selectedDateKey, normalizedOverride);
  const validationError =
    validationState.dateKey === selectedDateKey ? validationState.message : "";
  const fieldErrors = getScheduleManagerFieldErrors(validationError);
  const hasUnsavedDateChangesValue = hasUnsavedDateChanges(
    activeDraft,
    normalizedOverride
  );
  const hasBreakTime = Boolean(activeDraft.breakStart || activeDraft.breakEnd);
  const isBreakEnabled =
    breakToggleState.dateKey === selectedDateKey
      ? breakToggleState.enabled || hasBreakTime
      : hasBreakTime;
  const sortedNonWorkingDays = [...nonWorkingDays].sort();
  const sortedOverrides = Object.entries(scheduleOverrides)
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([dateKey, override]) => ({ dateKey, override }));
  const isNonWorkingDay = nonWorkingDays.includes(selectedDateKey);
  const hasCustomHours = Boolean(scheduleOverrides[selectedDateKey]);
  const canMarkDayOff = isCurrentOrFutureDateKey(selectedDateKey, todayKey)
    ? !nonWorkingDays.includes(selectedDateKey)
    : false;
  const isSaving = Boolean(isPerSalonLoading && !isLoadingSalons && activeSalonId);
  const isWaitingForSelectedSalonSchedule = Boolean(
    activeSalonId && !activePerSalonSchedule && !perSalonError
  );
  const isLoadingEffective =
    isLoading ||
    isPerSalonLoading ||
    isLoadingSalons ||
    isWaitingForSelectedSalonSchedule;
  const displayError = error || perSalonError;
  const isScheduleEmpty = !effectiveSchedule || !effectiveSchedule.defaultSchedule;
  const dateStatusMap = getDateStatusMap({
    dateOptions,
    scheduleOverrides,
    nonWorkingDays,
    todayKey,
    selectedDateKey,
  });

  return {
    activeDraft,
    canMarkDayOff,
    currentDefaultSchedule,
    dateOptions,
    dateStatusMap,
    defaultDaySchedule,
    displayError,
    effectiveSchedule,
    fieldErrors,
    hasCustomHours,
    hasUnsavedDateChangesValue,
    isBreakEnabled,
    isLoadingEffective,
    isNonWorkingDay,
    isSaving,
    isScheduleEmpty,
    isWaitingForSelectedSalonSchedule,
    nonWorkingDays,
    normalizedOverride,
    scheduleOverrides,
    selectedDateKey,
    selectedDateObject,
    sortedNonWorkingDays,
    sortedOverrides,
    todayKey,
    validationError,
    hasBreakTime,
  };
};
