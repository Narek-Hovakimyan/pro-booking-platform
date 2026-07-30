import { useCallback, useEffect, useMemo, useState } from "react";

import api from "@/shared/api/axios";
import {
  getEventRegistrationId,
  getNotificationEventId,
  getNotificationEventRegistrationId,
} from "@/shared/utils/notificationActionHelpers";

/**
 * Custom hook that manages event registration state, side-effects and actions
 * for notification action buttons (Approve / Reject).
 */
export function useEventRegistrationNotificationActions({
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
  const [eventRegistrations, setEventRegistrations] = useState([]);

  /* ── Derive which events have actionable registration notifications ── */
  const eventActionableEventIds = useMemo(() => {
    const eventIds = new Set();

    notifications.forEach((notification) => {
      if (
        notification.type === "event_registration_request" &&
        getNotificationEventId(notification) &&
        getNotificationEventRegistrationId(notification)
      ) {
        eventIds.add(getNotificationEventId(notification));
      }
    });

    return [...eventIds];
  }, [notifications]);

  /* ── Fetch registrations for all actionable events ── */
  useEffect(() => {
    if (
      currentUser?.role !== "barber" ||
      !currentUserId ||
      eventActionableEventIds.length === 0
    ) {
      return undefined;
    }

    let isMounted = true;
    const accountSnapshot = captureAccount();

    async function loadEventRegistrations() {
      try {
        const responses = await Promise.all(
          eventActionableEventIds.map((eventId) =>
            api.get(`/events/${eventId}/registrations`)
          )
        );
        const nextRegistrations = responses.flatMap((response) =>
          Array.isArray(response.data) ? response.data : []
        );

        if (isMounted && isCurrentAccount(accountSnapshot)) {
          setEventRegistrations(nextRegistrations);
        }
      } catch (requestError) {
        if (!isMounted || !isCurrentAccount(accountSnapshot)) return;

        setEventRegistrations([]);
        setError(
          requestError.response?.data?.message ||
            "Could not load event registrations for notification actions.",
        );
      }
    }

    loadEventRegistrations();

    return () => {
      isMounted = false;
    };
  }, [
    captureAccount,
    currentUser?.role,
    currentUserId,
    eventActionableEventIds,
    isCurrentAccount,
    setError,
  ]);

  /* ── registrationById lookup map ── */
  const eventRegistrationById = useMemo(() => {
    const nextMap = new Map();

    if (
      currentUser?.role !== "barber" ||
      !currentUserId ||
      eventActionableEventIds.length === 0
    ) {
      return nextMap;
    }

    eventRegistrations.forEach((registration) => {
      const registrationId = getEventRegistrationId(registration);
      if (registrationId) {
        nextMap.set(registrationId, registration);
      }
    });

    return nextMap;
  }, [currentUser?.role, currentUserId, eventActionableEventIds.length, eventRegistrations]);

  /* ── Approve / Reject handler ── */
  const handleEventAction = useCallback(
    async (notification, action) => {
      if (activeAction) return;

      const eventId = getNotificationEventId(notification);
      const eventRegistrationId = getNotificationEventRegistrationId(notification);
      if (!eventId || !eventRegistrationId) return;
      const accountSnapshot = captureAccount();
      if (!isCurrentAccount(accountSnapshot)) return;

      setError("");
      setActiveAction({ notificationId: notification.id, action });

      try {
        let response;

        if (action === "approve-event-registration") {
          response = await api.patch(
            `/events/${eventId}/registrations/${eventRegistrationId}/approve`,
            {},
          );
        } else if (action === "reject-event-registration") {
          response = await api.patch(
            `/events/${eventId}/registrations/${eventRegistrationId}/reject`,
            {},
          );
        } else {
          return;
        }

        if (!isCurrentAccount(accountSnapshot)) return;

        const nextRegistration =
          response.data?.registration ||
          {
            _id: eventRegistrationId,
            status:
              action === "approve-event-registration" ? "approved" : "rejected",
          };

        if (!isCurrentAccount(accountSnapshot)) return;
        setEventRegistrations((currentRegistrations) =>
          currentRegistrations.map((registration) =>
            getEventRegistrationId(registration) === eventRegistrationId
              ? { ...registration, ...nextRegistration }
              : registration,
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
            "Could not process event registration. Please try again.",
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

  return { eventRegistrationById, handleEventAction };
}
