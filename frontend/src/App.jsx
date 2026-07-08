import { Suspense, lazy, useCallback, useEffect, useState } from "react";

import { useDispatch, useSelector } from "react-redux";
import { Navigate, Route, Routes } from "react-router-dom";

import Header from "./shared/components/Header";
import Notifications from "./shared/components/Notifications";
import ProtectedRoute from "./shared/components/ProtectedRoute";
import SubscriptionGuard from "./shared/components/SubscriptionGuard";

import { getMySubscription } from "./shared/api/subscriptions";
import { connectSocket, disconnectSocket } from "./shared/lib/socket";
import {
  clearSubscription,
  loadSubscriptionFailure,
  loadSubscriptionStart,
  loadSubscriptionSuccess,
} from "./store/slices/subscriptionSlice";
import { useBookingFlow } from "./shared/hooks/useBookingFlow";
import { useBarberData } from "./shared/hooks/useBarberData";
import { useServiceManagement } from "./shared/hooks/useServiceManagement";
import { useScheduleManagement } from "./shared/hooks/useScheduleManagement";

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

  const { updateSchedule, updateNonWorkingDay, updateScheduleOverride } =
    useScheduleManagement({
      currentUserId,
      dispatch,
      barberSchedule,
      barberDateSchedules,
      barberScheduleOverrides,
      barberDefaultSchedule,
      barberNonWorkingDays,
      setDataError,
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