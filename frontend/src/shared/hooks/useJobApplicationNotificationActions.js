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

    async function loadManagedJobApplications() {
      try {
        const { data } = await api.get("/salon-jobs/applications/managed");

        if (isMounted) {
          setManagedJobApplications(Array.isArray(data) ? data : []);
        }
      } catch (requestError) {
        if (!isMounted) return;

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
  }, [currentUser?.role, currentUserId, jobActionableNotificationCount, setError]);

  /* ── applicationById lookup map ── */
  const jobApplicationById = useMemo(() => {
    const nextMap = new Map();

    managedJobApplications.forEach((application) => {
      const applicationId = getJobApplicationId(application);
      if (applicationId) {
        nextMap.set(applicationId, application);
      }
    });

    return nextMap;
  }, [managedJobApplications]);

  /* ── Accept / Reject handler ── */
  const handleJobAction = useCallback(
    async (notification, application, action) => {
      if (activeAction) return;

      const applicationId =
        getJobApplicationId(application) ||
        getNotificationJobApplicationId(notification);
      if (!applicationId) return;

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
        }

        await loadNotifications();
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            "Could not update job application. Please try again.",
        );
      } finally {
        setActiveAction(null);
      }
    },
    [activeAction, markOneRead, loadNotifications, setActiveAction, setError],
  );

  return { jobApplicationById, handleJobAction };
}
