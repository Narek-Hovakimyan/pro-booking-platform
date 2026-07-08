import { Suspense, lazy, useCallback, useEffect, useState } from "react";

import { useDispatch, useSelector } from "react-redux";
import { Navigate, Route, Routes } from "react-router-dom";

import Header from "./shared/components/Header";
import Notifications from "./shared/components/Notifications";
import ProtectedRoute from "./shared/components/ProtectedRoute";
import SubscriptionGuard from "./shared/components/SubscriptionGuard";

import api from "./shared/api/axios";
import { getFriendlyApiError } from "./shared/api/errors";
import { getMySubscription } from "./shared/api/subscriptions";
import { connectSocket, disconnectSocket } from "./shared/lib/socket";
import {
  setNonWorkingDays,
  setSchedule,
  updateScheduleField,
} from "./store/slices/scheduleSlice";
import {
  clearSubscription,
  loadSubscriptionFailure,
  loadSubscriptionStart,
  loadSubscriptionSuccess,
} from "./store/slices/subscriptionSlice";
import { useBookingFlow } from "./shared/hooks/useBookingFlow";
import { useBarberData } from "./shared/hooks/useBarberData";
import { useServiceManagement } from "./shared/hooks/useServiceManagement";
import { getDayKeyFromDate, parseDateKey } from "./shared/utils/dates";

const AdminPage = lazy(() => import("./barber/pages/AdminPage"));
const HomePage = lazy(() => import("./client/pages/HomePage"));

import { clientDiscoveryRoutes } from "./routes/ClientDiscoveryRoutes";
import { accountRoutes } from "./routes/AccountRoutes";
import { getBookingRoutes } from "./routes/BookingRoutes";
import { getBarberAdminRoutes } from "./routes/BarberAdminRoutes";
import { publicRoutes } from "./routes/PublicRoutes";
import { eventRoutes } from "./routes/EventRoutes";
import { platformRoutes } from "./routes/PlatformRoutes";

export default function App() {
  const dispatch = useDispatch();
  const services = useSelector((state) => state.services);
  const schedule = useSelector((state) => state.schedule);
  const bookings = useSelector((state) => state.bookings);
  const { currentUser, token } = useSelector((state) => state.auth);
  const currentUserId = currentUser?.id;
  const currentUserRole = currentUser?.role;
  const [dataError, setDataError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const {
    step,
    setStep,
    selectedServiceId,
    setSelectedServiceId,
    selectedDayKey,
    setSelectedDayKey,
    selectedTime,
    setSelectedTime,
    setClient,
    bookingClient,
    startBooking,
    resetBooking,
  } = useBookingFlow({ currentUser, currentUserRole });

  const {
    barberBookings,
    barberServices,
    barberScheduleEntry,
    barberSchedule,
    barberDateSchedules,
    barberScheduleOverrides,
    barberDefaultSchedule,
    barberNonWorkingDays,
    isDataLoading,
  } = useBarberData({
    currentUser,
    currentUserId,
    currentUserRole,
    dispatch,
    bookings,
    services,
    schedule,
    setDataError,
  });

  const [newService, setNewService] = useState({
    name: "",
    price: "",
    duration: "",
  });

  const { addService, updateService, deleteService } = useServiceManagement({
    currentUserId,
    dispatch,
    newService,
    setNewService,
    setDataError,
    setIsSaving,
  });

  useEffect(() => {
    if (!currentUserId || !token || currentUserRole !== "barber") {
      dispatch(clearSubscription());
      return undefined;
    }

    let isMounted = true;

    async function loadSubscription() {
      dispatch(loadSubscriptionStart());

      try {
        const data = await getMySubscription();
        if (isMounted) dispatch(loadSubscriptionSuccess(data));
      } catch (requestError) {
        if (isMounted) {
          dispatch(
            loadSubscriptionFailure(
              requestError.response?.data?.message ||
                "Could not load subscription status."
            )
          );
        }
      }
    }

    loadSubscription();

    return () => {
      isMounted = false;
    };
  }, [currentUserId, currentUserRole, dispatch, token]);

  useEffect(() => {
    if (!currentUserId || !token) {
      disconnectSocket();
      return undefined;
    }

    connectSocket(currentUserId, token);

    return () => {
      disconnectSocket();
    };
  }, [currentUserId, token]);

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
  ]);

  const renderAdminPage = useCallback(
    (section, { requireSubscription = false } = {}) => {
      const content = (
        <AdminPage
          bookings={barberBookings}
          services={barberServices}
          removeService={deleteService}
          addService={addService}
          updateService={updateService}
          schedule={barberScheduleEntry}
          updateSchedule={updateSchedule}
          updateScheduleOverride={updateScheduleOverride}
          updateNonWorkingDay={updateNonWorkingDay}
          isLoading={isDataLoading}
          isSaving={isSaving}
          error={dataError}
          section={section}
        />
      );

      return (
      <ProtectedRoute role="barber">
        {requireSubscription ? (
          <SubscriptionGuard>{content}</SubscriptionGuard>
        ) : (
          content
        )}
      </ProtectedRoute>
      );
    },
    [
      barberBookings,
      barberServices,
      deleteService,
      addService,
      updateService,
      barberScheduleEntry,
      updateSchedule,
      updateScheduleOverride,
      updateNonWorkingDay,
      isDataLoading,
      isSaving,
      dataError,
    ]
  );

  return (
    <div className="min-h-screen overflow-x-hidden px-3 py-4 text-neutral-900 sm:px-5 sm:py-6">
      <Notifications />

      <div className="mx-auto w-full max-w-6xl space-y-5 sm:space-y-7">
        <Header />

        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            <Route
              path="/"
              element={
                currentUserRole === "barber" ? (
                  <Navigate to="/admin" replace />
                ) : (
                  <HomePage startBooking={startBooking} />
                )
              }
            />
            {publicRoutes}
            {clientDiscoveryRoutes}
            {getBookingRoutes({
              bookingFlow: {
                step,
                setStep,
                selectedServiceId,
                setSelectedServiceId,
                selectedDayKey,
                setSelectedDayKey,
                selectedTime,
                setSelectedTime,
                bookingClient,
                setClient,
                resetBooking,
              },
              services,
              bookings,
              schedule,
              currentUser,
            })}
            {accountRoutes}
            {getBarberAdminRoutes({ renderAdminPage })}
            {eventRoutes}
            {platformRoutes}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}