import { useEffect, useState } from "react";

import api from "@/shared/api/axios";
import { formatTimeInput, timeToMinutes } from "@/shared/utils/time";

const DEFAULT_SCHEDULE = {
  startTime: "09:00",
  endTime: "18:00",
  hasBreak: false,
  breakStart: "",
  breakEnd: "",
  weeklySchedule: {},
};

const getDefaultScheduleDraft = (defaultSchedule = {}) => ({
  startTime: defaultSchedule.startTime || DEFAULT_SCHEDULE.startTime,
  endTime: defaultSchedule.endTime || DEFAULT_SCHEDULE.endTime,
  hasBreak: Boolean(defaultSchedule.hasBreak),
  breakStart: defaultSchedule.breakStart || "",
  breakEnd: defaultSchedule.breakEnd || "",
});

const validateWorkingDay = (daySchedule, label) => {
  if (daySchedule?.working !== true) return "";

  const startMinutes = timeToMinutes(daySchedule.from);
  const endMinutes = timeToMinutes(daySchedule.to);
  const breakStartFilled = Boolean(daySchedule.breakFrom);
  const breakEndFilled = Boolean(daySchedule.breakTo);
  const breakStartMinutes = timeToMinutes(daySchedule.breakFrom);
  const breakEndMinutes = timeToMinutes(daySchedule.breakTo);

  if (startMinutes === null || endMinutes === null) {
    return `${label} work start and work end must use HH:mm format.`;
  }

  if (endMinutes <= startMinutes) {
    return `${label} work end must be later than work start.`;
  }

  if (breakStartFilled !== breakEndFilled) {
    return `${label} break start and break end must both be filled or both empty.`;
  }

  if (breakStartFilled && (breakStartMinutes === null || breakEndMinutes === null)) {
    return `${label} break time must use HH:mm format.`;
  }

  if (breakStartFilled && breakEndMinutes <= breakStartMinutes) {
    return `${label} break end must be later than break start.`;
  }

  if (
    breakStartFilled &&
    (breakStartMinutes < startMinutes || breakEndMinutes > endMinutes)
  ) {
    return `${label} break time must be inside working hours.`;
  }

  return "";
};

export default function useDefaultSalonScheduleSettings({
  currentUserId,
  salonStatusSalons,
}) {
  const [salonSchedules, setSalonSchedules] = useState({});
  const [savingSalonId, setSavingSalonId] = useState(null);
  const [savedSalonId, setSavedSalonId] = useState(null);
  const [errorSalonId, setErrorSalonId] = useState(null);
  const [salonScheduleErrors, setSalonScheduleErrors] = useState({});

  // Initialize salonSchedules from salonStatus data
  useEffect(() => {
    if (!salonStatusSalons) return;
    let cancelled = false;

    const schedules = {};
    (salonStatusSalons || []).forEach((entry) => {
      const salonId = entry?.id || entry?._id;
      if (salonId) {
        schedules[salonId] = {
          ...getDefaultScheduleDraft(entry.defaultSchedule),
          weeklySchedule: entry.weeklySchedule || {},
        };
      }
    });
    setSalonSchedules(schedules);

    if (!currentUserId) {
      return () => {
        cancelled = true;
      };
    }

    async function loadSavedSchedules() {
      const scheduleEntries = await Promise.all(
        Object.keys(schedules).map(async (salonId) => {
          try {
            const { data } = await api.get(`/schedules/${currentUserId}/${salonId}`);
            return [
              salonId,
              {
                ...getDefaultScheduleDraft(data.defaultSchedule),
                weeklySchedule: data.weeklySchedule || {},
              },
            ];
          } catch {
            return null;
          }
        })
      );

      if (cancelled) return;

      setSalonSchedules((currentSchedules) => {
        const nextSchedules = { ...currentSchedules };

        scheduleEntries.filter(Boolean).forEach(([salonId, schedule]) => {
          nextSchedules[salonId] = {
            ...nextSchedules[salonId],
            ...schedule,
          };
        });

        return nextSchedules;
      });
    }

    loadSavedSchedules();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, salonStatusSalons]);

  const updateSalonSchedule = (salonId, field, value) => {
    setErrorSalonId(null);
    setSavedSalonId(null);
    setSalonScheduleErrors((prev) => ({ ...prev, [salonId]: "" }));

    if (field === "startTime" || field === "endTime" || field === "breakStart" || field === "breakEnd") {
      const formatted = formatTimeInput(value, salonSchedules[salonId]?.[field] || "");
      setSalonSchedules((prev) => ({
        ...prev,
        [salonId]: {
          ...prev[salonId],
          [field]: formatted,
        },
      }));
    } else {
      setSalonSchedules((prev) => ({
        ...prev,
        [salonId]: {
          ...prev[salonId],
          [field]: value,
        },
      }));
    }
  };

  const updateWeeklyDaySchedule = (salonId, dayKey, updates) => {
    setErrorSalonId(null);
    setSavedSalonId(null);
    setSalonScheduleErrors((prev) => ({ ...prev, [salonId]: "" }));

    setSalonSchedules((prev) => {
      const currentSchedule = prev[salonId] || DEFAULT_SCHEDULE;
      const currentDay = currentSchedule.weeklySchedule?.[dayKey] || {};
      const formattedUpdates = { ...updates };

      for (const field of ["from", "to", "breakFrom", "breakTo"]) {
        if (Object.prototype.hasOwnProperty.call(formattedUpdates, field)) {
          formattedUpdates[field] = formatTimeInput(
            formattedUpdates[field],
            currentDay[field] || ""
          );
        }
      }

      return {
        ...prev,
        [salonId]: {
          ...currentSchedule,
          weeklySchedule: {
            ...(currentSchedule.weeklySchedule || {}),
            [dayKey]: {
              ...currentDay,
              ...formattedUpdates,
            },
          },
        },
      };
    });
  };

  const saveDefaultSchedule = async (salonId) => {
    if (!currentUserId || !salonId || savingSalonId) return;

    const schedule = salonSchedules[salonId];
    if (!schedule) return;

    const startMinutes = timeToMinutes(schedule.startTime);
    const endMinutes = timeToMinutes(schedule.endTime);
    const breakStartMinutes = timeToMinutes(schedule.breakStart);
    const breakEndMinutes = timeToMinutes(schedule.breakEnd);

    if (startMinutes === null || endMinutes === null) {
      setErrorSalonId(salonId);
      setSalonScheduleErrors((prev) => ({
        ...prev,
        [salonId]: "Default working hours must use HH:mm format.",
      }));
      return;
    }

    if (endMinutes <= startMinutes) {
      setErrorSalonId(salonId);
      setSalonScheduleErrors((prev) => ({
        ...prev,
        [salonId]: "Default end time must be later than start time.",
      }));
      return;
    }

    if (schedule.hasBreak) {
      if (breakStartMinutes === null || breakEndMinutes === null) {
        setErrorSalonId(salonId);
        setSalonScheduleErrors((prev) => ({
          ...prev,
          [salonId]: "Default break time must use HH:mm format.",
        }));
        return;
      }

      if (breakEndMinutes <= breakStartMinutes) {
        setErrorSalonId(salonId);
        setSalonScheduleErrors((prev) => ({
          ...prev,
          [salonId]: "Default break end must be later than break start.",
        }));
        return;
      }

      if (breakStartMinutes < startMinutes || breakEndMinutes > endMinutes) {
        setErrorSalonId(salonId);
        setSalonScheduleErrors((prev) => ({
          ...prev,
          [salonId]: "Default break time must be inside working hours.",
        }));
        return;
      }
    }

    for (const [dayKey, daySchedule] of Object.entries(schedule.weeklySchedule || {})) {
      const dayError = validateWorkingDay(daySchedule, dayKey.toUpperCase());

      if (dayError) {
        setErrorSalonId(salonId);
        setSalonScheduleErrors((prev) => ({
          ...prev,
          [salonId]: dayError,
        }));
        return;
      }
    }

    const nextDefaultSchedule = {
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      hasBreak: Boolean(schedule.hasBreak),
      breakStart: schedule.hasBreak ? schedule.breakStart : "",
      breakEnd: schedule.hasBreak ? schedule.breakEnd : "",
      weeklySchedule: schedule.weeklySchedule || {},
    };

    setSavingSalonId(salonId);
    setErrorSalonId(null);
    setSalonScheduleErrors((prev) => ({ ...prev, [salonId]: "" }));
    setSavedSalonId(null);

    try {
      const { data } = await api.patch(
        `/barbers/salons/${salonId}/default-schedule`,
        nextDefaultSchedule
      );
      setSalonSchedules((prev) => ({
        ...prev,
        [salonId]: {
          ...getDefaultScheduleDraft(data.defaultSchedule || nextDefaultSchedule),
          weeklySchedule: data.weeklySchedule || nextDefaultSchedule.weeklySchedule,
        },
      }));
      setSavedSalonId(salonId);
    } catch (requestError) {
      setErrorSalonId(salonId);
      setSalonScheduleErrors((prev) => ({
        ...prev,
        [salonId]:
          requestError.response?.data?.message ||
          "Could not save default schedule. Please try again.",
      }));
    } finally {
      setSavingSalonId(null);
    }
  };

  return {
    salonSchedules,
    savingSalonId,
    savedSalonId,
    errorSalonId,
    salonScheduleErrors,
    updateSalonSchedule,
    updateWeeklyDaySchedule,
    saveDefaultSchedule,
  };
}
