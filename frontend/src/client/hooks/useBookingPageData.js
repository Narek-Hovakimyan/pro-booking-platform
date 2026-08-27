import { useCallback, useEffect, useState } from "react";
import { useDispatch } from "react-redux";

import api from "@/shared/api/axios";
import { getFriendlyApiError, isBarberUnavailableError } from "@/shared/api/errors";
import { CLIENT_BOOKING_REQUEST_TIMEOUT_MS } from "@/client/hooks/useClientBookingConfirmation";
import initialSchedule, { defaultPersonalSchedule } from "@/shared/data/schedule";
import { setBookings } from "@/store/slices/bookingsSlice";
import { setSchedule } from "@/store/slices/scheduleSlice";
import { setServices } from "@/store/slices/servicesSlice";
import { setBarbers } from "@/store/slices/usersSlice";

export default function useBookingPageData({
  activeSelectedSalonId,
  barberId,
  needsEnrichedBarber,
  setSelectedDate,
  setSelectedDayKey,
  setSelectedServiceId,
  setSelectedTime,
}) {
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(true);
  const [isServicesLoading, setIsServicesLoading] = useState(true);
  const [isBarberLoading, setIsBarberLoading] = useState(false);
  const [isScheduleBlocked, setIsScheduleBlocked] = useState(false);
  const [error, setError] = useState("");

  const refreshServices = useCallback(async () => {
    setIsServicesLoading(true);
    setError("");

    try {
      const servicesUrl = activeSelectedSalonId
        ? `/services/${barberId}?salonId=${activeSelectedSalonId}`
        : `/services/${barberId}`;
      const servicesResponse = await api.get(servicesUrl, {
        timeout: CLIENT_BOOKING_REQUEST_TIMEOUT_MS,
      });
      dispatch(setServices({ barberId, services: servicesResponse.data }));
      return servicesResponse.data;
    } catch (requestError) {
      const message = isBarberUnavailableError(requestError)
        ? getFriendlyApiError(requestError)
        : requestError.response?.data?.message ||
          (requestError?.code === "ECONNABORTED" || requestError?.code === "ETIMEDOUT"
            ? "Service refresh timed out. Please try again."
            : "Could not load services. Please try again.");
      setError(message);
      throw new Error(message, { cause: requestError });
    } finally {
      setIsServicesLoading(false);
    }
  }, [activeSelectedSalonId, barberId, dispatch, setError, setIsServicesLoading]);

  useEffect(() => {
    if (!needsEnrichedBarber) return undefined;

    let isMounted = true;

    async function fetchBarber() {
      setIsBarberLoading(true);

      try {
        const { data } = await api.get("/users/barbers");
        if (isMounted) dispatch(setBarbers(data));
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Cannot re-book because specialist/service data is missing"
          );
        }
      } finally {
        if (isMounted) setIsBarberLoading(false);
      }
    }

    fetchBarber();
    return () => { isMounted = false; };
  }, [barberId, dispatch, needsEnrichedBarber]);

  useEffect(() => {
    let isMounted = true;

    async function fetchBookingData() {
      setIsLoading(true);
      setIsServicesLoading(true);
      setIsScheduleBlocked(false);
      setError("");

      try {
        const servicesUrl = activeSelectedSalonId
          ? `/services/${barberId}?salonId=${activeSelectedSalonId}`
          : `/services/${barberId}`;
        const servicesResponse = await api.get(servicesUrl);
        if (!isMounted) return;
        dispatch(setServices({ barberId, services: servicesResponse.data }));
      } catch (requestError) {
        if (isMounted) {
          const message = isBarberUnavailableError(requestError)
            ? getFriendlyApiError(requestError)
            : requestError.response?.data?.message || "Could not load services. Please try again.";
          setError(message);
          setSelectedServiceId(null);
          setSelectedTime("");
        }
      } finally {
        if (isMounted) setIsServicesLoading(false);
      }

      try {
        const scheduleUrl = activeSelectedSalonId
          ? `/schedules/${barberId}/${activeSelectedSalonId}`
          : `/schedules/${barberId}`;
        const scheduleResponse = await api.get(scheduleUrl);
        if (!isMounted) return;
        dispatch(setSchedule({
          barberId,
          weeklySchedule: scheduleResponse.data?.weeklySchedule || initialSchedule,
          explicitWeeklyDays: scheduleResponse.data?.explicitWeeklyDays,
          dateSchedules: scheduleResponse.data?.dateSchedules || {},
          scheduleOverrides: scheduleResponse.data?.scheduleOverrides || {},
          defaultSchedule: scheduleResponse.data?.defaultSchedule || defaultPersonalSchedule,
          nonWorkingDays: scheduleResponse.data?.nonWorkingDays || [],
        }));
      } catch (requestError) {
        if (isMounted) {
          const message = isBarberUnavailableError(requestError)
            ? getFriendlyApiError(requestError)
            : requestError.response?.data?.message || "Could not load schedule. Please try again.";
          setIsScheduleBlocked(true);
          setSelectedDate("");
          setSelectedDayKey("");
          setSelectedTime("");
          setError(message);
        }
      }

      try {
        const bookingsResponse = await api.get(`/bookings/barber/${barberId}`);
        if (!isMounted) return;
        dispatch(setBookings({
          bookings: bookingsResponse.data,
          scope: { key: "barberId", value: barberId },
        }));
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.response?.data?.message || "Could not load booked times. Please try again.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchBookingData();
    return () => { isMounted = false; };
  }, [barberId, dispatch, activeSelectedSalonId, setSelectedDate, setSelectedDayKey, setSelectedServiceId, setSelectedTime]);

  return {
    error,
    isBarberLoading,
    isLoading,
    isScheduleBlocked,
    isServicesLoading,
    refreshServices,
    setError,
    setIsServicesLoading,
  };
}
