import { useEffect, useState } from "react";

import api from "@/shared/api/axios";
import { formatTimeInput, timeToMinutes } from "@/shared/utils/time";

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

    const schedules = {};
    (salonStatusSalons || []).forEach((entry) => {
      const salonId = entry?.id || entry?._id;
      if (salonId) {
        schedules[salonId] = {
          startTime: entry.defaultSchedule?.startTime || "09:00",
          endTime: entry.defaultSchedule?.endTime || "18:00",
          hasBreak: entry.defaultSchedule?.hasBreak || false,
          breakStart: entry.defaultSchedule?.breakStart || "",
          breakEnd: entry.defaultSchedule?.breakEnd || "",
        };
      }
    });
    setSalonSchedules(schedules);
  }, [salonStatusSalons]);

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

    const nextDefaultSchedule = {
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      hasBreak: Boolean(schedule.hasBreak),
      breakStart: schedule.hasBreak ? schedule.breakStart : "",
      breakEnd: schedule.hasBreak ? schedule.breakEnd : "",
    };

    setSavingSalonId(salonId);
    setErrorSalonId(null);
    setSalonScheduleErrors((prev) => ({ ...prev, [salonId]: "" }));
    setSavedSalonId(null);

    try {
      await api.patch(`/barbers/salons/${salonId}/default-schedule`, nextDefaultSchedule);
      setSalonSchedules((prev) => ({
        ...prev,
        [salonId]: { ...nextDefaultSchedule },
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
    saveDefaultSchedule,
  };
}
