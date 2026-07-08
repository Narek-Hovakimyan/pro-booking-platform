/* eslint-disable react-refresh/only-export-components */

import { lazy } from "react";
import { Route } from "react-router-dom";

import ProtectedRoute from "../shared/components/ProtectedRoute";

const MyBookingsPage = lazy(() => import("../client/pages/MyBookingsPage"));
const MyWaitlistPage = lazy(() => import("../client/pages/MyWaitlistPage"));
const FavoritesPage = lazy(() => import("../client/pages/FavoritesPage"));
const ClientProfilePage = lazy(() => import("../client/pages/ClientProfilePage"));
const MessagesPage = lazy(() => import("../pages/MessagesPage"));
const NotificationsPage = lazy(() => import("../pages/NotificationsPage"));
const JobsPage = lazy(() => import("../pages/JobsPage"));
const MyJobApplicationsPage = lazy(() => import("../pages/MyJobApplicationsPage"));

export const accountRoutes = (
  <>
    <Route
      path="/my-bookings"
      element={
        <ProtectedRoute role="client">
          <MyBookingsPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/my-waitlist"
      element={
        <ProtectedRoute role="client">
          <MyWaitlistPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/favorites"
      element={
        <ProtectedRoute role="client">
          <FavoritesPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/profile"
      element={
        <ProtectedRoute role="client">
          <ClientProfilePage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/messages"
      element={
        <ProtectedRoute>
          <MessagesPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/messages/:userId"
      element={
        <ProtectedRoute>
          <MessagesPage />
        </ProtectedRoute>
      }
    />
    <Route
      path="/notifications"
      element={
        <ProtectedRoute>
          <NotificationsPage />
        </ProtectedRoute>
      }
    />
    <Route path="/jobs" element={<JobsPage />} />
    <Route
      path="/jobs/applications"
      element={
        <ProtectedRoute role="barber">
          <MyJobApplicationsPage />
        </ProtectedRoute>
      }
    />
  </>
);