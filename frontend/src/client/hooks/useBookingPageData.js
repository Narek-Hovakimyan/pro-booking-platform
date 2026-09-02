import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const mountedRef = useRef(false);
  const servicesRequestIdRef = useRef(0);
  const servicesContextKey = `${barberId || ""}:${activeSelectedSalonId || ""}`;
  const servicesContextRef = useRef(servicesContextKey);
  const servicesUrl = activeSelectedSalonId
    ? `/services/${barberId}?salonId=${activeSelectedSalonId}`
    : `/services/${barberId}`;

  useLayoutEffect(() => {
    if (servicesContextRef.current === servicesContextKey) return;

    servicesContextRef.current = servicesContextKey;
    servicesRequestIdRef.current += 1;
  }, [servicesContextKey]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      servicesRequestIdRef.current += 1;
    };
  }, []);

  const beginServicesRequest = useCallback(() => {
    const requestId = ++servicesRequestIdRef.current;
    const requestContextKey = servicesContextKey;
    const isCurrentRequest = () =>
      mountedRef.current &&
      servicesRequestIdRef.current === requestId &&
      servicesContextRef.current === requestContextKey;

    if (isCurrentRequest()) {
      setIsServicesLoading(true);
      setError("");
    }

    return isCurrentRequest;
  }, [servicesContextKey]);

  const applyServicesResponse = useCallback((isCurrentRequest, servicesResponse) => {
    if (!isCurrentRequest()) return servicesResponse.data;

    dispatch(setServices({ barberId, services: servicesResponse.data }));
    return servicesResponse.data;
  }, [barberId, dispatch]);

  const handleServicesFailure = useCallback(({
    clearSelectionOnFailure = false,
    isCurrentRequest,
    requestError,
    timeout,
  }) => {
    const message = isBarberUnavailableError(requestError)
      ? getFriendlyApiError(requestError)
      : requestError.response?.data?.message ||
        (timeout && (requestError?.code === "ECONNABORTED" || requestError?.code === "ETIMEDOUT")
          ? "Service refresh timed out. Please try again."
          : "Could not load services. Please try again.");
    if (isCurrentRequest()) {
      setError(message);
      if (clearSelectionOnFailure) {
        setSelectedServiceId(null);
        setSelectedTime("");
      }
    }
    throw new Error(message, { cause: requestError });
  }, [setSelectedServiceId, setSelectedTime]);

  const finishServicesRequest = useCallback((isCurrentRequest) => {
    if (isCurrentRequest()) setIsServicesLoading(false);
  }, []);

  const loadServices = useCallback(async ({
    clearSelectionOnFailure = false,
  } = {}) => {
    const isCurrentRequest = beginServicesRequest();

    try {
      const servicesResponse = await api.get(servicesUrl);
      return applyServicesResponse(isCurrentRequest, servicesResponse);
    } catch (requestError) {
      return handleServicesFailure({
        clearSelectionOnFailure,
        isCurrentRequest,
        requestError,
      });
    } finally {
      finishServicesRequest(isCurrentRequest);
    }
  }, [
    applyServicesResponse,
    beginServicesRequest,
    finishServicesRequest,
    handleServicesFailure,
    servicesUrl,
  ]);

  const refreshServices = useCallback(async () => {
    const isCurrentRequest = beginServicesRequest();

    try {
      const servicesResponse = await api.get(servicesUrl, {
        timeout: CLIENT_BOOKING_REQUEST_TIMEOUT_MS,
      });
      return applyServicesResponse(isCurrentRequest, servicesResponse);
    } catch (requestError) {
      return handleServicesFailure({
        isCurrentRequest,
        requestError,
        timeout: CLIENT_BOOKING_REQUEST_TIMEOUT_MS,
      });
    } finally {
      finishServicesRequest(isCurrentRequest);
    }
  }, [
    applyServicesResponse,
    beginServicesRequest,
    finishServicesRequest,
    handleServicesFailure,
    servicesUrl,
  ]);

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
      setIsScheduleBlocked(false);
      setError("");

      try {
        await loadServices({ clearSelectionOnFailure: true });
      } catch {
        // Service errors are handled by loadServices while this request is current.
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
  }, [
    activeSelectedSalonId,
    barberId,
    dispatch,
    loadServices,
    setSelectedDate,
    setSelectedDayKey,
    setSelectedServiceId,
    setSelectedTime,
  ]);

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
