/* eslint-disable react-refresh/only-export-components */

import { lazy } from "react";
import { Route } from "react-router-dom";

import ProtectedRoute from "../shared/components/ProtectedRoute";

const BookingPage = lazy(() => import("../client/pages/BookingPage"));
const SuccessPage = lazy(() => import("../client/pages/SuccessPage"));

export function getBookingRoutes({
  bookingFlow,
  services,
  bookings,
  schedule,
  currentUser,
}) {
  return (
    <>
      <Route
        path="/booking/:barberId"
        element={
          <ProtectedRoute role="client">
            <BookingPage
              step={bookingFlow.step}
              setStep={bookingFlow.setStep}
              services={services}
              selectedServiceId={bookingFlow.selectedServiceId}
              setSelectedServiceId={bookingFlow.setSelectedServiceId}
              selectedDayKey={bookingFlow.selectedDayKey}
              setSelectedDayKey={bookingFlow.setSelectedDayKey}
              selectedTime={bookingFlow.selectedTime}
              setSelectedTime={bookingFlow.setSelectedTime}
              client={bookingFlow.bookingClient}
              currentUser={currentUser}
              bookings={bookings}
              schedule={schedule}
              setClient={bookingFlow.setClient}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/success"
        element={
          <ProtectedRoute role="client">
            <SuccessPage
              client={bookingFlow.bookingClient}
              resetBooking={bookingFlow.resetBooking}
            />
          </ProtectedRoute>
        }
      />
    </>
  );
}