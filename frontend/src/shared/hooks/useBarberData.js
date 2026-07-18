import { useEffect, useMemo, useState } from "react";

import api from "../api/axios";
import initialSchedule, { defaultPersonalSchedule } from "../data/schedule";
import { setServices } from "../../store/slices/servicesSlice";
import { setSchedule } from "../../store/slices/scheduleSlice";

const personalScheduleDayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const normalizePersonalWeeklySchedule = (weeklySchedule) => {
  const source =
    weeklySchedule && typeof weeklySchedule === "object" ? weeklySchedule : {};

  return Object.fromEntries(
    personalScheduleDayKeys.map((dayKey) => [
      dayKey,
      source[dayKey] || initialSchedule[dayKey],
    ])
  );
};

export function useBarberData({
  currentUser,
  currentUserId,
  currentUserRole,
  dispatch,
  bookings,
  services,
  schedule,
  setDataError,
}) {
  const [isDataLoading, setIsDataLoading] = useState(false);

  const barberBookings = useMemo(
    () =>
      bookings.filter(
        (booking) => String(booking.barberId) === String(currentUserId)
      ),
    [bookings, currentUserId]
  );

  const barberServices = useMemo(
    () =>
      services.filter(
        (service) => String(service.barberId) === String(currentUserId)
      ),
    [currentUserId, services]
  );

  const barberScheduleEntry = useMemo(
    () =>
      schedule[currentUserId] || {
        weeklySchedule: initialSchedule,
        dateSchedules: {},
        scheduleOverrides: {},
        defaultSchedule: currentUser?.defaultSchedule || defaultPersonalSchedule,
        nonWorkingDays: [],
      },
    [currentUser?.defaultSchedule, currentUserId, schedule]
  );

  const barberSchedule = useMemo(
    () => barberScheduleEntry.weeklySchedule || initialSchedule,
    [barberScheduleEntry]
  );

  const barberDateSchedules = useMemo(
    () => barberScheduleEntry.dateSchedules || {},
    [barberScheduleEntry]
  );

  const barberScheduleOverrides = useMemo(
    () => barberScheduleEntry.scheduleOverrides || {},
    [barberScheduleEntry]
  );

  const barberDefaultSchedule = useMemo(
    () =>
      barberScheduleEntry.defaultSchedule ||
      currentUser?.defaultSchedule ||
      defaultPersonalSchedule,
    [barberScheduleEntry, currentUser?.defaultSchedule]
  );

  const barberNonWorkingDays = useMemo(
    () => barberScheduleEntry.nonWorkingDays || [],
    [barberScheduleEntry]
  );

  useEffect(() => {
    if (!currentUserId) return;

    let isMounted = true;

    async function fetchUserData() {
      setIsDataLoading(true);
      setDataError("");

      try {
        if (currentUserRole === "barber") {
          const servicesResponse = await api.get(`/services/${currentUserId}`);

          if (!isMounted) return;

          dispatch(
            setServices({
              barberId: currentUserId,
              services: servicesResponse.data,
            })
          );
        }
      } catch (requestError) {
        if (isMounted) {
          setDataError(
            requestError.response?.data?.message ||
            "Could not load services. Please refresh and try again."
          );
        }
      }

      try {
        if (currentUserRole === "barber") {
          const scheduleResponse = await api.get(`/schedules/${currentUserId}/personal`);

          if (!isMounted) return;

          const scheduleData =
            scheduleResponse.data?.schedule || scheduleResponse.data || {};

          dispatch(
            setSchedule({
              barberId: currentUserId,
              weeklySchedule: normalizePersonalWeeklySchedule(
                scheduleData.weeklySchedule
              ),
              dateSchedules: scheduleData.dateSchedules || {},
              scheduleOverrides: scheduleData.scheduleOverrides || {},
              defaultSchedule:
                scheduleData.defaultSchedule || defaultPersonalSchedule,
              nonWorkingDays: scheduleData.nonWorkingDays || [],
            })
          );
        }
      } catch (requestError) {
        if (isMounted) {
          setDataError(
            requestError.response?.data?.message ||
            "Could not load schedule. Please refresh and try again."
          );
        }
      }

      if (isMounted) {
        setIsDataLoading(false);
      }
    }

    fetchUserData();

    return () => {
      isMounted = false;
    };
  }, [currentUserId, currentUserRole, dispatch, setDataError]);

  return {
    barberBookings,
    barberServices,
    barberScheduleEntry,
    barberSchedule,
    barberDateSchedules,
    barberScheduleOverrides,
    barberDefaultSchedule,
    barberNonWorkingDays,
    isDataLoading,
  };
}
