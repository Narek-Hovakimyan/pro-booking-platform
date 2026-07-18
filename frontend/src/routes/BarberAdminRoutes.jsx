/* eslint-disable react-refresh/only-export-components */

import { lazy } from "react";
import { Route } from "react-router-dom";

import ProtectedRoute from "../shared/components/ProtectedRoute";
import BarberOnboardingGuard from "../shared/components/BarberOnboardingGuard";
import SubscriptionGuard from "../shared/components/SubscriptionGuard";

const BarberCalendarPage = lazy(() => import("../barber/pages/BarberCalendarPage"));
const BarberCalendarDayPage = lazy(() => import("../barber/pages/BarberCalendarDayPage"));
const BarberOnboardingPage = lazy(() => import("../barber/pages/BarberOnboardingPage"));
const BarberProfilePage = lazy(() => import("../barber/pages/BarberProfilePage"));
const BillingPage = lazy(() => import("../barber/pages/BillingPage"));
const ClientsPage = lazy(() => import("../barber/pages/ClientsPage"));
const RevenuePage = lazy(() => import("../barber/pages/RevenuePage"));
const SalonBillingPage = lazy(() => import("../barber/pages/SalonBillingPage"));
const SalonDashboardPage = lazy(() => import("../barber/pages/SalonDashboardPage"));
const SalonCalendarPage = lazy(() => import("../barber/pages/SalonCalendarPage"));
const SalonReportsPage = lazy(() => import("../barber/pages/SalonReportsPage"));

const guardBarberOnboarding = (element) => (
  <ProtectedRoute role="barber">
    <BarberOnboardingGuard>{element}</BarberOnboardingGuard>
  </ProtectedRoute>
);

export function getBarberAdminRoutes({ renderAdminPage }) {
  return (
    <>
      <Route
        path="/onboarding"
        element={guardBarberOnboarding(<BarberOnboardingPage />)}
      />
      <Route
        path="/admin"
        element={guardBarberOnboarding(renderAdminPage("dashboard"))}
      />
      <Route
        path="/admin/services"
        element={guardBarberOnboarding(renderAdminPage("services", { requireSubscription: true }))}
      />
      <Route
        path="/admin/schedule"
        element={guardBarberOnboarding(renderAdminPage("schedule", { requireSubscription: true }))}
      />
      <Route
        path="/admin/settings"
        element={guardBarberOnboarding(renderAdminPage("settings"))}
      />
      <Route
        path="/admin/settings/salon"
        element={guardBarberOnboarding(renderAdminPage("settings-salon"))}
      />
      <Route
        path="/admin/settings/default-schedule"
        element={guardBarberOnboarding(renderAdminPage("settings-default-schedule"))}
      />
      <Route
        path="/admin/settings/certifications"
        element={guardBarberOnboarding(renderAdminPage("settings-certifications"))}
      />
      <Route
        path="/admin/settings/deposit"
        element={guardBarberOnboarding(renderAdminPage("settings-deposit"))}
      />
      <Route
        path="/admin/bookings"
        element={guardBarberOnboarding(renderAdminPage("bookings", { requireSubscription: true }))}
      />
      <Route
        path="/admin/clients"
        element={guardBarberOnboarding(
          <SubscriptionGuard>
            <ClientsPage />
          </SubscriptionGuard>
        )}
      />
      <Route
        path="/admin/portfolio"
        element={guardBarberOnboarding(renderAdminPage("portfolio", { requireSubscription: true }))}
      />
      <Route
        path="/admin/waitlist"
        element={guardBarberOnboarding(renderAdminPage("waitlist", { requireSubscription: true }))}
      />
      <Route
        path="/admin/jobs"
        element={guardBarberOnboarding(renderAdminPage("jobs"))}
      />
      <Route
        path="/admin/vouchers"
        element={guardBarberOnboarding(renderAdminPage("vouchers", { requireSubscription: true }))}
      />
      <Route
        path="/admin/salon/promotions"
        element={guardBarberOnboarding(renderAdminPage("salon-promotions"))}
      />
      <Route
        path="/admin/calendar"
        element={guardBarberOnboarding(
          <SubscriptionGuard>
            <BarberCalendarPage />
          </SubscriptionGuard>
        )}
      />
      <Route
        path="/admin/calendar/day/:date"
        element={guardBarberOnboarding(
          <SubscriptionGuard>
            <BarberCalendarDayPage />
          </SubscriptionGuard>
        )}
      />
      <Route
        path="/admin/profile"
        element={guardBarberOnboarding(<BarberProfilePage />)}
      />
      <Route
        path="/admin/revenue"
        element={guardBarberOnboarding(
          <SubscriptionGuard>
            <RevenuePage />
          </SubscriptionGuard>
        )}
      />
      <Route
        path="/admin/billing"
        element={guardBarberOnboarding(<BillingPage />)}
      />
      <Route
        path="/admin/salon/billing"
        element={guardBarberOnboarding(<SalonBillingPage />)}
      />
      <Route
        path="/admin/salon/dashboard"
        element={guardBarberOnboarding(<SalonDashboardPage />)}
      />
      <Route
        path="/admin/salon/calendar"
        element={guardBarberOnboarding(<SalonCalendarPage />)}
      />
      <Route
        path="/admin/salon/reports"
        element={guardBarberOnboarding(<SalonReportsPage />)}
      />
    </>
  );
}
