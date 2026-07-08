/* eslint-disable react-refresh/only-export-components */

import { lazy } from "react";
import { Navigate, Route } from "react-router-dom";

import ProtectedRoute from "../shared/components/ProtectedRoute";

const PlatformDashboardPage = lazy(() =>
  import("../platform/pages/PlatformDashboardPage")
);
const PlatformBillingPage = lazy(() =>
  import("../platform/pages/PlatformBillingPage")
);
const PlatformSalonBillingDetailPage = lazy(() =>
  import("../platform/pages/PlatformSalonBillingDetailPage")
);
const PlatformIndividualBillingPage = lazy(() =>
  import("../platform/pages/PlatformIndividualBillingPage")
);

export const platformRoutes = (
  <>
    <Route
      path="/admin/platform"
      element={<Navigate to="/admin/platform/dashboard" replace />}
    />
    <Route
      path="/admin/platform/dashboard"
      element={
        <ProtectedRoute requiredPlatformRole="superuser">
          <PlatformDashboardPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/platform/billing"
      element={<Navigate to="/admin/platform/billing/salons" replace />}
    />
    <Route
      path="/admin/platform/billing/salons"
      element={
        <ProtectedRoute requiredPlatformRole="superuser">
          <PlatformBillingPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/platform/billing/salons/:salonId"
      element={
        <ProtectedRoute requiredPlatformRole="superuser">
          <PlatformSalonBillingDetailPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/platform/billing/individuals"
      element={
        <ProtectedRoute requiredPlatformRole="superuser">
          <PlatformIndividualBillingPage />
        </ProtectedRoute>
      }
    />
  </>
);
