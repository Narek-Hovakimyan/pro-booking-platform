import { useCallback, useEffect, useMemo, useState } from "react";

import api from "@/shared/api/axios";
import {
  getJobApplicationId,
  getNotificationJobApplicationId,
} from "@/shared/utils/notificationActionHelpers";

/**
 * Custom hook that manages job application state, side-effects and actions
 * for notification action buttons (Accept / Reject).
 */
export function useJobApplicationNotificationActions({
  currentUser,
  currentUserId,
  notifications,
  activeAction,
  setActiveAction,
  setError,
  markOneRead,
  loadNotifications,
  captureAccount,
  isCurrentAccount,
}) {
  const [managedJobApplications, setManagedJobApplications] = useState([]);

  /* ── Count notifications with actionable job applications ── */
  const jobActionableNotificationCount = useMemo(
    () =>
      notifications.filter(
        (notification) =>
          notification.type === "salon_job_application_submitted" &&
          getNotificationJobApplicationId(notification),
      ).length,
    [notifications],
  );

  /* ── Fetch managed applications ── */
  useEffect(() => {
    if (
      currentUser?.role !== "barber" ||
      !currentUserId ||
      jobActionableNotificationCount === 0
    ) {
      return undefined;
    }

    let isMounted = true;
    const accountSnapshot = captureAccount();

    async function loadManagedJobApplications() {
      try {
        const { data } = await api.get("/salon-jobs/applications/managed");

        if (isMounted && isCurrentAccount(accountSnapshot)) {
          setManagedJobApplications(Array.isArray(data) ? data : []);
        }
      } catch (requestError) {
        if (!isMounted || !isCurrentAccount(accountSnapshot)) return;

        setManagedJobApplications([]);
        setError(
          requestError.response?.data?.message ||
            "Could not load job applications for notification actions.",
        );
      }
    }

    loadManagedJobApplications();

    return () => {
      isMounted = false;
    };
  }, [
    captureAccount,
    currentUser?.role,
    currentUserId,
    isCurrentAccount,
    jobActionableNotificationCount,
    setError,
  ]);

  /* ── applicationById lookup map ── */
  const jobApplicationById = useMemo(() => {
    const nextMap = new Map();

    if (
      currentUser?.role !== "barber" ||
      !currentUserId ||
      jobActionableNotificationCount === 0
    ) {
      return nextMap;
    }

    managedJobApplications.forEach((application) => {
      const applicationId = getJobApplicationId(application);
      if (applicationId) {
        nextMap.set(applicationId, application);
      }
    });

    return nextMap;
  }, [
    currentUser?.role,
    currentUserId,
    jobActionableNotificationCount,
    managedJobApplications,
  ]);

  /* ── Accept / Reject handler ── */
  const handleJobAction = useCallback(
    async (notification, application, action) => {
      if (activeAction) return;

      const applicationId =
        getJobApplicationId(application) ||
        getNotificationJobApplicationId(notification);
      if (!applicationId) return;
      const accountSnapshot = captureAccount();
      if (!isCurrentAccount(accountSnapshot)) return;

      const status =
        action === "accept-job-application"
          ? "accepted"
          : action === "reject-job-application"
            ? "rejected"
            : "";

      if (!status) return;

      setError("");
      setActiveAction({ notificationId: notification.id, action });

      try {
        const { data } = await api.patch(
          `/salon-jobs/applications/${applicationId}/status`,
          { status },
        );
        if (!isCurrentAccount(accountSnapshot)) return;
        const nextApplication = data || { ...application, status };

        setManagedJobApplications((currentApplications) =>
          currentApplications.map((currentApplication) =>
            getJobApplicationId(currentApplication) === applicationId
              ? nextApplication
              : currentApplication,
          ),
        );

        if (!notification.isRead) {
          await markOneRead(notification.id);
          if (!isCurrentAccount(accountSnapshot)) return;
        }

        await loadNotifications();
        if (!isCurrentAccount(accountSnapshot)) return;
      } catch (requestError) {
        if (!isCurrentAccount(accountSnapshot)) return;
        setError(
          requestError.response?.data?.message ||
            "Could not update job application. Please try again.",
        );
      } finally {
        if (isCurrentAccount(accountSnapshot)) {
          setActiveAction(null);
        }
      }
    },
    [
      activeAction,
      captureAccount,
      isCurrentAccount,
      markOneRead,
      loadNotifications,
      setActiveAction,
      setError,
    ],
  );

  return { jobApplicationById, handleJobAction };
}
