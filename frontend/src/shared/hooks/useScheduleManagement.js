import { useCallback } from "react";

import api from "../api/axios";
import { getFriendlyApiError } from "../api/errors";
import { setNonWorkingDays, setSchedule, updateScheduleField } from "../../store/slices/scheduleSlice";
import { getDayKeyFromDate, parseDateKey } from "../utils/dates";

export function useScheduleManagement({
  currentUserId,
  dispatch,
  barberSchedule,
  barberDateSchedules,
  barberScheduleOverrides,
  barberDefaultSchedule,
  barberNonWorkingDays,
  setDataError,
}) {
  const updateSchedule = useCallback(async (scheduleKey, field, value) => {
    if (!currentUserId) return;

    const selectedDate = parseDateKey(scheduleKey);
    const fallbackDayKey = selectedDate ? getDayKeyFromDate(selectedDate) : scheduleKey;
    const fallbackSchedule = barberSchedule[fallbackDayKey] || {
      working: false,
      from: "",
      to: "",
      breakFrom: "",
      breakTo: "",
    };
    const nextDateSchedules = selectedDate
      ? {
        ...barberDateSchedules,
        [scheduleKey]: {
          ...fallbackSchedule,
          ...barberDateSchedules[scheduleKey],
          [field]: value,
        },
      }
      : barberDateSchedules;
    const nextSchedule = selectedDate
      ? barberSchedule
      : {
        ...barberSchedule,
        [scheduleKey]: {
          ...barberSchedule[scheduleKey],
          [field]: value,
        },
      };

    dispatch(
      updateScheduleField({
        barberId: currentUserId,
        dateKey: selectedDate ? scheduleKey : undefined,
        dayKey: selectedDate ? undefined : scheduleKey,
        field,
        value,
      })
    );
    setDataError("");

    try {
      const { data } = await api.put("/schedules", {
        barberId: currentUserId,
        weeklySchedule: nextSchedule,
        dateSchedules: nextDateSchedules,
        nonWorkingDays: barberNonWorkingDays,
      });

      dispatch(
        setSchedule({
          barberId: currentUserId,
          weeklySchedule: data.weeklySchedule,
          dateSchedules: data.dateSchedules || {},
          scheduleOverrides: data.scheduleOverrides || {},
          defaultSchedule: data.defaultSchedule || barberDefaultSchedule,
          nonWorkingDays: data.nonWorkingDays || [],
        })
      );
    } catch (requestError) {
      setDataError(
        getFriendlyApiError(
          requestError,
          "Could not save schedule. Please try again."
        )
      );
    }
  }, [
    barberDateSchedules,
    barberDefaultSchedule,
    barberNonWorkingDays,
    barberSchedule,
    currentUserId,
    dispatch,
    setDataError,
  ]);

  const updateNonWorkingDay = useCallback(async (dateKey, isNonWorking) => {
    if (!currentUserId) return;

    const nextNonWorkingDays = isNonWorking
      ? Array.from(new Set([...barberNonWorkingDays, dateKey]))
      : barberNonWorkingDays.filter((day) => day !== dateKey);
    const payload = {
      barberId: currentUserId,
      weeklySchedule: barberSchedule,
      dateSchedules: barberDateSchedules,
      scheduleOverrides: barberScheduleOverrides,
      nonWorkingDays: nextNonWorkingDays,
    };

    dispatch(
      setNonWorkingDays({
        barberId: currentUserId,
        nonWorkingDays: nextNonWorkingDays,
      })
    );
    setDataError("");

    try {
      const { data } = await api.put("/schedules", payload);

      dispatch(
        setSchedule({
          barberId: currentUserId,
          weeklySchedule: data.weeklySchedule,
          dateSchedules: data.dateSchedules || {},
          scheduleOverrides: data.scheduleOverrides || {},
          defaultSchedule: data.defaultSchedule || barberDefaultSchedule,
          nonWorkingDays: data.nonWorkingDays || [],
        })
      );
    } catch (requestError) {
      setDataError(
        getFriendlyApiError(
          requestError,
          "Could not save day off. Please try again."
        )
      );
    }
  }, [
    barberDateSchedules,
    barberDefaultSchedule,
    barberNonWorkingDays,
    barberSchedule,
    barberScheduleOverrides,
    currentUserId,
    dispatch,
    setDataError,
  ]);

  const updateScheduleOverride = useCallback(async (dateKey, override) => {
    if (!currentUserId) return;

    const nextOverrides = {
      ...barberScheduleOverrides,
      [dateKey]: override,
    };
    const nextNonWorkingDays = override.isWorking
      ? barberNonWorkingDays.filter((day) => day !== dateKey)
      : Array.from(new Set([...barberNonWorkingDays, dateKey]));

    setDataError("");

    try {
      const { data } = await api.put("/schedules", {
        barberId: currentUserId,
        weeklySchedule: barberSchedule,
        dateSchedules: barberDateSchedules,
        scheduleOverrides: nextOverrides,
        nonWorkingDays: nextNonWorkingDays,
      });

      dispatch(
        setSchedule({
          barberId: currentUserId,
          weeklySchedule: data.weeklySchedule,
          dateSchedules: data.dateSchedules || {},
          scheduleOverrides: data.scheduleOverrides || {},
          defaultSchedule: data.defaultSchedule || barberDefaultSchedule,
          nonWorkingDays: data.nonWorkingDays || [],
        })
      );
    } catch (requestError) {
      setDataError(
        getFriendlyApiError(
          requestError,
          "Could not save schedule. Please try again."
        )
      );
    }
  }, [
    barberDateSchedules,
    barberDefaultSchedule,
    barberNonWorkingDays,
    barberSchedule,
    barberScheduleOverrides,
    currentUserId,
    dispatch,
    setDataError,
  ]);

  return {
    updateSchedule,
    updateNonWorkingDay,
    updateScheduleOverride,
  };
}