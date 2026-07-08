import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";

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
  addService as addServiceAction,
  removeService,
  setServices,
  updateService as updateServiceAction,
} from "./store/slices/servicesSlice";
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
import initialSchedule, { defaultPersonalSchedule } from "./shared/data/schedule";
import { getDayKeyFromDate, parseDateKey } from "./shared/utils/dates";

const AdminPage = lazy(() => import("./barber/pages/AdminPage"));
const BookingPage = lazy(() => import("./client/pages/BookingPage"));
const HomePage = lazy(() => import("./client/pages/HomePage"));
const SuccessPage = lazy(() => import("./client/pages/SuccessPage"));

import { clientDiscoveryRoutes } from "./routes/ClientDiscoveryRoutes";
import { accountRoutes } from "./routes/AccountRoutes";
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
  const [isDataLoading, setIsDataLoading] = useState(false);
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

  const [newService, setNewService] = useState({
    name: "",
    price: "",
    duration: "",
  });

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
          const scheduleResponse = await api.get(`/schedules/${currentUserId}`);

          if (!isMounted) return;

          dispatch(
            setSchedule({
              barberId: currentUserId,
              weeklySchedule:
                scheduleResponse.data?.weeklySchedule || initialSchedule,
              dateSchedules: scheduleResponse.data?.dateSchedules || {},
              scheduleOverrides: scheduleResponse.data?.scheduleOverrides || {},
              defaultSchedule:
                scheduleResponse.data?.defaultSchedule || defaultPersonalSchedule,
              nonWorkingDays: scheduleResponse.data?.nonWorkingDays || [],
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
  }, [currentUserId, currentUserRole, dispatch]);

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

  const addService = useCallback(async (serviceData) => {
    const name = serviceData?.name || newService.name;
    const price = serviceData?.price ?? newService.price;
    const duration = serviceData?.duration ?? newService.duration;
    const description = serviceData?.description || "";
    const category = serviceData?.category || "other";
    const tags = Array.isArray(serviceData?.tags) ? serviceData.tags : [];
    const type = serviceData?.type || "single";
    const packagePriceMode = serviceData?.packagePriceMode;
    const packageDurationMode = serviceData?.packageDurationMode;
    const isSumPrice = type === "package" && packagePriceMode === "sum";
    const isSumDuration = type === "package" && packageDurationMode === "sum";

    const serviceDuration = Number(duration);

    if (!currentUserId || !name) return;

    // Validate price: required for single services and manual-mode packages
    if (!isSumPrice && (!price || !Number.isFinite(Number(price)) || Number(price) < 0)) {
      return;
    }

    // Validate duration: required for single services and manual-mode packages
    if (!isSumDuration && (!Number.isFinite(serviceDuration) || serviceDuration <= 0)) {
      return;
    }

    setIsSaving(true);
    setDataError("");

    try {
      const payload = {
        barberId: currentUserId,
        name,
        description,
        category,
        tags,
        type,
        active: true,
      };

      // Only include price when not auto-calculated via sum mode
      if (!isSumPrice) {
        payload.price = Number(price);
      }

      // Only include duration when not auto-calculated via sum mode
      if (!isSumDuration) {
        payload.duration = serviceDuration;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          serviceData || {},
          "customCategoryId"
        )
      ) {
        payload.customCategoryId = serviceData.customCategoryId;
      }

      if (type === "package") {
        payload.includedServiceIds = serviceData.includedServiceIds;
        payload.packagePriceMode = serviceData.packagePriceMode;
        payload.packageDurationMode = serviceData.packageDurationMode;
      }

      const { data } = await api.post("/services", payload);

      dispatch(addServiceAction(data));

      setNewService({
        name: "",
        price: "",
        duration: "",
      });
    } catch (requestError) {
      setDataError(
        getFriendlyApiError(
          requestError,
          "Could not save service. Please try again."
        )
      );
    } finally {
      setIsSaving(false);
    }
  }, [currentUserId, dispatch, newService]);

  const updateService = useCallback(async (serviceId, serviceData) => {
    setIsSaving(true);
    setDataError("");

    try {
      const { data } = await api.put(`/services/${serviceId}`, serviceData);

      dispatch(updateServiceAction(data));
    } catch (requestError) {
      setDataError(
        getFriendlyApiError(
          requestError,
          "Could not update service. Please try again."
        )
      );
      throw requestError;
    } finally {
      setIsSaving(false);
    }
  }, [dispatch]);

  const deleteService = useCallback(async (serviceId) => {
    setIsSaving(true);
    setDataError("");

    try {
      await api.delete(`/services/${serviceId}`);
      dispatch(removeService(serviceId));
    } catch (requestError) {
      setDataError(
        getFriendlyApiError(
          requestError,
          "Could not delete service. Please try again."
        )
      );
    } finally {
      setIsSaving(false);
    }
  }, [dispatch]);

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
            <Route
              path="/booking/:barberId"
              element={
                <ProtectedRoute role="client">
                  <BookingPage
                    step={step}
                    setStep={setStep}
                    services={services}
                    selectedServiceId={selectedServiceId}
                    setSelectedServiceId={setSelectedServiceId}
                    selectedDayKey={selectedDayKey}
                    setSelectedDayKey={setSelectedDayKey}
                    selectedTime={selectedTime}
                    setSelectedTime={setSelectedTime}
                    client={bookingClient}
                    currentUser={currentUser}
                    bookings={bookings}
                    schedule={schedule}
                    setClient={setClient}
                  />
                </ProtectedRoute>
              }
            />
            <Route
              path="/success"
              element={
                <ProtectedRoute role="client">
                  <SuccessPage client={bookingClient} resetBooking={resetBooking} />
                </ProtectedRoute>
              }
            />
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