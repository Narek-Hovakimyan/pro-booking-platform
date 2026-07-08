/* eslint-disable react-refresh/only-export-components */

import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";

import ProtectedRoute from "../shared/components/ProtectedRoute";

const BarbersPage = lazy(() => import("../client/pages/BarbersPage"));
const ClientBarberProfilePage = lazy(() => import("../client/pages/ClientBarberProfilePage"));
const SalonsPage = lazy(() => import("../client/pages/SalonsPage"));
const SalonProfilePage = lazy(() => import("../pages/SalonProfilePage"));
const SalonPublicBookingPage = lazy(() => import("../pages/SalonPublicBookingPage"));

export const clientDiscoveryRoutes = (
  <>
    <Route
      path="/barbers"
      element={
        <ProtectedRoute role="client">
          <BarbersPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/specialists"
      element={
        <ProtectedRoute role="client">
          <BarbersPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/barbers/:barberId/profile"
      element={
        <ProtectedRoute role="client">
          <ClientBarberProfilePage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/specialists/:barberId/profile"
      element={
        <ProtectedRoute role="client">
          <ClientBarberProfilePage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/salons"
      element={
        <ProtectedRoute role="client">
          <SalonsPage />
        </ProtectedRoute>
      }
    />
    <Route path="/salons/:salonId" element={<SalonProfilePage />} />
    <Route path="/salons/:salonId/book" element={<SalonPublicBookingPage />} />
    <Route
      path="/booking"
      element={
        <ProtectedRoute role="client">
          <Navigate to="/barbers" replace />
        </ProtectedRoute>
      }
    />
  </>
);