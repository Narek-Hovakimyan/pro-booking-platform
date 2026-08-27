import { useEffect, useMemo, useState } from "react";

import api from "../api/axios";
import { defaultPersonalSchedule } from "../data/schedule";
import { setServices } from "../../store/slices/servicesSlice";
import { setSchedule } from "../../store/slices/scheduleSlice";

const getSalonId = (entry) => {
  if (!entry) return null;
  if (typeof entry.salon === "object" && entry.salon) {
    return entry.salon.id || entry.salon._id || null;
  }
  return entry.salon || entry.salonId || null;
};

const isApprovedSalon = (entry) => {
  const status = entry?.status || entry?.salon?.status;
  const relationshipStatus =
    entry?.relationshipStatus || entry?.salon?.relationshipStatus;
  if (relationshipStatus && relationshipStatus !== "accepted") return false;
  return status === "approved" || (!status && relationshipStatus === "accepted");
};

/**
 * Return a salon only when the authenticated user already provides an
 * unambiguous context. A primary membership disambiguates multiple salons;
 * otherwise multiple approved memberships deliberately fall back to the
 * personal schedule endpoint rather than guessing.
 */
export const getUnambiguousSalonId = (user) => {
  const allSalonEntries = Array.isArray(user?.salons) ? user.salons : [];
  const approvedSalons = allSalonEntries.filter(
    (entry) => isApprovedSalon(entry) && getSalonId(entry)
  );
  const primarySalons = approvedSalons.filter((entry) => entry.isPrimary === true);

  if (primarySalons.length === 1) return String(getSalonId(primarySalons[0]));
  if (approvedSalons.length === 1) return String(getSalonId(approvedSalons[0]));

  if (approvedSalons.length === 0 && user?.salonStatus === "approved") {
    const legacySalonId = getSalonId(user);
    const canonicalEntryForLegacySalon = allSalonEntries.some(
      (entry) =>
        legacySalonId && String(getSalonId(entry)) === String(legacySalonId)
    );
    if (canonicalEntryForLegacySalon) return null;
    return legacySalonId ? String(legacySalonId) : null;
  }

  return null;
};

export const getLoadedWeeklySchedule = (weeklySchedule) =>
  weeklySchedule && typeof weeklySchedule === "object" && !Array.isArray(weeklySchedule)
    ? weeklySchedule
    : {};

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

  const salonContextId = useMemo(
    () => getUnambiguousSalonId(currentUser),
    [currentUser]
  );
  const salonContextDefaultSchedule = useMemo(() => {
    if (!salonContextId || !Array.isArray(currentUser?.salons)) return null;
    const contextEntry = currentUser.salons.find(
      (entry) => String(getSalonId(entry)) === String(salonContextId)
    );
    return contextEntry?.defaultSchedule || null;
  }, [currentUser, salonContextId]);

  const barberScheduleEntry = useMemo(
    () =>
      schedule[currentUserId] || {
        weeklySchedule: {},
        dateSchedules: {},
        scheduleOverrides: {},
        defaultSchedule:
          salonContextDefaultSchedule ||
          currentUser?.defaultSchedule ||
          defaultPersonalSchedule,
        nonWorkingDays: [],
      },
    [
      currentUser?.defaultSchedule,
      currentUserId,
      salonContextDefaultSchedule,
      schedule,
    ]
  );

  const barberSchedule = useMemo(
    () => barberScheduleEntry.weeklySchedule || {},
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
          const schedulePath = salonContextId
            ? `/schedules/${currentUserId}/${salonContextId}`
            : `/schedules/${currentUserId}/personal`;
          const scheduleResponse = await api.get(schedulePath);

          if (!isMounted) return;

          const scheduleData =
            scheduleResponse.data?.schedule || scheduleResponse.data || {};

          dispatch(
            setSchedule({
              barberId: currentUserId,
              weeklySchedule: getLoadedWeeklySchedule(scheduleData.weeklySchedule),
              explicitWeeklyDays: scheduleData.explicitWeeklyDays,
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
  }, [currentUserId, currentUserRole, dispatch, salonContextId, setDataError]);

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
