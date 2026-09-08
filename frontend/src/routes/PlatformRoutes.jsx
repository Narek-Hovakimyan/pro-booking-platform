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
const PlatformAuditPage = lazy(() =>
  import("../platform/pages/PlatformAuditPage")
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
        <ProtectedRoute requiredPlatformCapability="billing.read">
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
        <ProtectedRoute requiredPlatformCapability="billing.read">
          <PlatformBillingPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/platform/billing/salons/:salonId"
      element={
        <ProtectedRoute requiredPlatformCapability="billing.read">
          <PlatformSalonBillingDetailPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/platform/billing/individuals"
      element={
        <ProtectedRoute requiredPlatformCapability="billing.read">
          <PlatformIndividualBillingPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/admin/platform/audit"
      element={
        <ProtectedRoute requiredPlatformCapability="audit.read">
          <PlatformAuditPage />
        </ProtectedRoute>
      }
    />
  </>
);
