/* eslint-disable react-refresh/only-export-components */

import { lazy } from "react";
import { Route } from "react-router-dom";

import ProtectedRoute from "../shared/components/ProtectedRoute";
import SubscriptionGuard from "../shared/components/SubscriptionGuard";

const BarberCalendarPage = lazy(() => import("../barber/pages/BarberCalendarPage"));
const BarberCalendarDayPage = lazy(() => import("../barber/pages/BarberCalendarDayPage"));
const BarberProfilePage = lazy(() => import("../barber/pages/BarberProfilePage"));
const BillingPage = lazy(() => import("../barber/pages/BillingPage"));
const ClientsPage = lazy(() => import("../barber/pages/ClientsPage"));
const RevenuePage = lazy(() => import("../barber/pages/RevenuePage"));
const SalonBillingPage = lazy(() => import("../barber/pages/SalonBillingPage"));
const SalonDashboardPage = lazy(() => import("../barber/pages/SalonDashboardPage"));
const SalonCalendarPage = lazy(() => import("../barber/pages/SalonCalendarPage"));
const SalonReportsPage = lazy(() => import("../barber/pages/SalonReportsPage"));

export function getBarberAdminRoutes({ renderAdminPage }) {
  return (
    <>
      <Route
        path="/admin"
        element={renderAdminPage("dashboard")}
      />
      <Route
        path="/admin/services"
        element={renderAdminPage("services", { requireSubscription: true })}
      />
      <Route
        path="/admin/schedule"
        element={renderAdminPage("schedule", { requireSubscription: true })}
      />
      <Route
        path="/admin/settings"
        element={renderAdminPage("settings")}
      />
      <Route
        path="/admin/settings/salon"
        element={renderAdminPage("settings-salon")}
      />
      <Route
        path="/admin/settings/default-schedule"
        element={renderAdminPage("settings-default-schedule")}
      />
      <Route
        path="/admin/settings/certifications"
        element={renderAdminPage("settings-certifications")}
      />
      <Route
        path="/admin/settings/deposit"
        element={renderAdminPage("settings-deposit")}
      />
      <Route
        path="/admin/bookings"
        element={renderAdminPage("bookings", { requireSubscription: true })}
      />
      <Route
        path="/admin/clients"
        element={
          <ProtectedRoute role="barber">
            <SubscriptionGuard>
              <ClientsPage />
            </SubscriptionGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/portfolio"
        element={renderAdminPage("portfolio", { requireSubscription: true })}
      />
      <Route
        path="/admin/waitlist"
        element={renderAdminPage("waitlist", { requireSubscription: true })}
      />
      <Route
        path="/admin/jobs"
        element={renderAdminPage("jobs")}
      />
      <Route
        path="/admin/vouchers"
        element={renderAdminPage("vouchers", { requireSubscription: true })}
      />
      <Route
        path="/admin/salon/promotions"
        element={renderAdminPage("salon-promotions")}
      />
      <Route
        path="/admin/calendar"
        element={
          <ProtectedRoute role="barber">
            <SubscriptionGuard>
              <BarberCalendarPage />
            </SubscriptionGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/calendar/day/:date"
        element={
          <ProtectedRoute role="barber">
            <SubscriptionGuard>
              <BarberCalendarDayPage />
            </SubscriptionGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/profile"
        element={
          <ProtectedRoute role="barber">
            <BarberProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/revenue"
        element={
          <ProtectedRoute role="barber">
            <SubscriptionGuard>
              <RevenuePage />
            </SubscriptionGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/billing"
        element={
          <ProtectedRoute role="barber">
            <BillingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/salon/billing"
        element={
          <ProtectedRoute role="barber">
            <SalonBillingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/salon/dashboard"
        element={
          <ProtectedRoute role="barber">
            <SalonDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/salon/calendar"
        element={
          <ProtectedRoute role="barber">
            <SalonCalendarPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/salon/reports"
        element={
          <ProtectedRoute role="barber">
            <SalonReportsPage />
          </ProtectedRoute>
        }
      />
    </>
  );
}