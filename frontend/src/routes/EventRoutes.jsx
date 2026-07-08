/* eslint-disable react-refresh/only-export-components */

import { lazy } from "react";
import { Route } from "react-router-dom";

import ProtectedRoute from "../shared/components/ProtectedRoute";

const EventsPage = lazy(() => import("../pages/EventsPage"));
const CertificatePage = lazy(() => import("../pages/CertificatePage"));
const MyEventsPage = lazy(() => import("../barber/pages/MyEventsPage"));

export const eventRoutes = (
  <>
    <Route
      path="/events"
      element={
        <ProtectedRoute>
          <EventsPage />
        </ProtectedRoute>
      }
    />
    <Route path="/certificates/:certificateId" element={<CertificatePage />} />
    <Route
      path="/my-events"
      element={
        <ProtectedRoute>
          <MyEventsPage />
        </ProtectedRoute>
      }
    />
  </>
);