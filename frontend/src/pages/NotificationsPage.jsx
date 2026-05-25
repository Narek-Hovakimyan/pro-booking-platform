import { Bell, CheckCheck, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import RejectBookingModal from "@/barber/components/RejectBookingModal";
import api from "@/shared/api/axios";
import { NotificationSkeleton } from "@/shared/components/LoadingSkeletons";
import NotificationGroup from "@/shared/components/NotificationGroup";
import EmptyState from "@/shared/components/common/EmptyState";
import { Button } from "@/shared/components/ui/button";
import {
  getBookingId,
  getEventRegistrationId,
  getIdString,
  getJobApplicationId,
  getNotificationBookingId,
  getNotificationEventId,
  getNotificationEventRegistrationId,
  getNotificationJobApplicationId,
} from "@/shared/utils/notificationActionHelpers";
import {
  getGroupLabel,
} from "@/shared/utils/notificationHelpers";
import {
  fetchBarberBookings,
  updateBooking,
} from "@/store/slices/bookingsSlice";

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const notificationsCacheByUserId = new Map();

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function NotificationsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currentUser } = useSelector((state) => state.auth);
  const bookings = useSelector((state) => state.bookings || []);
  const currentUserId = getIdString(currentUser?.id || currentUser?._id);
  const [notifications, setNotifications] = useState(
    () => notificationsCacheByUserId.get(String(currentUserId)) || [],
  );
  const [isLoading, setIsLoading] = useState(
    () => !notificationsCacheByUserId.has(String(currentUserId)),
  );
  const [error, setError] = useState("");
  const [activeAction, setActiveAction] = useState(null);
  const [rejectingAction, setRejectingAction] = useState(null);
  const [rejectionError, setRejectionError] = useState("");
  const [eventRegistrations, setEventRegistrations] = useState([]);
  const [managedJobApplications, setManagedJobApplications] = useState([]);

  const actionableNotificationCount = useMemo(
    () =>
      notifications.filter(
        (notification) =>
          (notification.type === "booking_created" ||
            notification.type === "booking_reschedule_requested") &&
          getNotificationBookingId(notification),
      ).length,
    [notifications],
  );

  const jobActionableNotificationCount = useMemo(
    () =>
      notifications.filter(
        (notification) =>
          notification.type === "salon_job_application_submitted" &&
          getNotificationJobApplicationId(notification),
      ).length,
    [notifications],
  );

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

  const bookingById = useMemo(() => {
    const nextMap = new Map();

    if (currentUser?.role !== "barber" || !currentUserId) return nextMap;

    bookings.forEach((booking) => {
      const bookingId = getBookingId(booking);
      const barberId = getIdString(booking?.barberId || booking?.barber);

      if (bookingId && barberId === currentUserId) {
        nextMap.set(bookingId, booking);
      }
    });

    return nextMap;
  }, [bookings, currentUser?.role, currentUserId]);

  const eventRegistrationById = useMemo(() => {
    const nextMap = new Map();

    eventRegistrations.forEach((registration) => {
      const registrationId = getEventRegistrationId(registration);

      if (registrationId) {
        nextMap.set(registrationId, registration);
      }
    });

    return nextMap;
  }, [eventRegistrations]);

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

  // ---- Fetch ----

  const loadNotifications = useCallback(
    async ({ showLoading = false } = {}) => {
      if (!currentUserId) return;

      if (showLoading) {
        setIsLoading(true);
      }
      setError("");

      try {
        const { data } = await api.get("/notifications");
        const nextNotifications = data.map((item) => ({
          ...item,
          id: item.id || item._id,
        }));

        notificationsCacheByUserId.set(String(currentUserId), nextNotifications);
        setNotifications(nextNotifications);
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            "Could not load notifications. Please try again.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [currentUserId],
  );

  useEffect(() => {
    if (!currentUserId) return undefined;

    let isMounted = true;
    let intervalId = null;

    async function safeLoad(options) {
      if (!isMounted) return;
      await loadNotifications(options);
    }

    safeLoad({ showLoading: true });
    intervalId = setInterval(() => safeLoad(), 15000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [currentUserId, loadNotifications]);

  useEffect(() => {
    if (
      currentUser?.role !== "barber" ||
      !currentUserId ||
      actionableNotificationCount === 0
    ) {
      return undefined;
    }

    let isMounted = true;

    dispatch(fetchBarberBookings(currentUserId)).catch((requestError) => {
      if (!isMounted) return;
      setError(
        requestError.response?.data?.message ||
          "Could not load bookings for notification actions.",
      );
    });

    return () => {
      isMounted = false;
    };
  }, [actionableNotificationCount, currentUser?.role, currentUserId, dispatch]);

  useEffect(() => {
    if (
      currentUser?.role !== "barber" ||
      !currentUserId ||
      eventActionableEventIds.length === 0
    ) {
      return undefined;
    }

    let isMounted = true;

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

        if (isMounted) {
          setEventRegistrations(nextRegistrations);
        }
      } catch (requestError) {
        if (!isMounted) return;

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
  }, [currentUser?.role, currentUserId, eventActionableEventIds]);

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
  }, [currentUser?.role, currentUserId, jobActionableNotificationCount]);

  // ---- Actions ----

  const markOneRead = useCallback(
    async (notificationId) => {
      setError("");

      try {
        const { data } = await api.put(`/notifications/${notificationId}/read`);
        const nextNotification = { ...data, id: data.id || data._id };

        setNotifications((current) =>
          current.map((n) =>
            n.id === notificationId ? nextNotification : n,
          ),
        );
        notificationsCacheByUserId.set(
          String(currentUserId),
          notifications.map((n) =>
            n.id === notificationId ? nextNotification : n,
          ),
        );
        window.dispatchEvent(new Event("notifications:updated"));
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            "Could not mark notification as read.",
        );
      }
    },
    [currentUserId, notifications],
  );

  const markAllRead = useCallback(async () => {
    setError("");

    try {
      await api.put("/notifications/read");
      setNotifications((current) =>
        current.map((n) => ({ ...n, isRead: true })),
      );
      notificationsCacheByUserId.set(
        String(currentUserId),
        notifications.map((n) => ({ ...n, isRead: true })),
      );
      window.dispatchEvent(new Event("notifications:updated"));
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not mark notifications as read.",
      );
    }
  }, [currentUserId, notifications]);

  const deleteOne = useCallback(
    async (notificationId) => {
      setError("");

      try {
        await api.delete(`/notifications/${notificationId}`);
        setNotifications((current) =>
          current.filter((n) => n.id !== notificationId),
        );
        notificationsCacheByUserId.set(
          String(currentUserId),
          notifications.filter((n) => n.id !== notificationId),
        );
        window.dispatchEvent(new Event("notifications:updated"));
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            "Could not delete notification.",
        );
      }
    },
    [currentUserId, notifications],
  );

  const clearAll = useCallback(async () => {
    setError("");

    try {
      await api.delete("/notifications/user/all");
      setNotifications([]);
      notificationsCacheByUserId.set(String(currentUserId), []);
      window.dispatchEvent(new Event("notifications:updated"));
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not clear notifications.",
      );
    }
  }, [currentUserId]);

  const refreshBarberBookings = useCallback(async () => {
    if (currentUser?.role !== "barber" || !currentUserId) return;
    await dispatch(fetchBarberBookings(currentUserId));
  }, [currentUser?.role, currentUserId, dispatch]);

  const finishBookingAction = useCallback(
    async (notification, updatedBooking) => {
      dispatch(updateBooking(updatedBooking));

      if (!notification.isRead) {
        await markOneRead(notification.id);
      }

      await refreshBarberBookings();
    },
    [dispatch, markOneRead, refreshBarberBookings],
  );

  const handleBookingAction = useCallback(
    async (notification, booking, action) => {
      if (activeAction) return;

      const bookingId = getBookingId(booking) || getNotificationBookingId(notification);
      if (!bookingId) return;

      if (action === "reject-booking") {
        setRejectingAction({ notification, booking });
        setRejectionError("");
        setError("");
        return;
      }

      setError("");
      setActiveAction({ notificationId: notification.id, action });

      try {
        let response;

        if (action === "accept-booking") {
          response = await api.put(`/bookings/${bookingId}`, { status: "accepted" });
        } else if (action === "accept-reschedule") {
          response = await api.patch(
            `/bookings/${bookingId}/reschedule-request/accept`,
            {},
          );
        } else if (action === "reject-reschedule") {
          response = await api.patch(
            `/bookings/${bookingId}/reschedule-request/reject`,
            {},
          );
        } else {
          return;
        }

        await finishBookingAction(notification, response.data);
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            "Could not update booking. Please try again.",
        );
      } finally {
        setActiveAction(null);
      }
    },
    [activeAction, finishBookingAction],
  );

  const rejectBookingFromNotification = useCallback(
    async ({ rejectionReason }) => {
      if (!rejectingAction || activeAction) return;

      const { notification, booking } = rejectingAction;
      const bookingId = getBookingId(booking) || getNotificationBookingId(notification);
      if (!bookingId) return;

      setRejectionError("");
      setActiveAction({ notificationId: notification.id, action: "reject-booking" });

      try {
        const { data } = await api.put(`/bookings/${bookingId}`, {
          status: "rejected",
          rejectionReason,
        });

        await finishBookingAction(notification, data);
        setRejectingAction(null);
      } catch (requestError) {
        setRejectionError(
          requestError.response?.data?.message ||
            "Could not reject booking. Please try again.",
        );
      } finally {
        setActiveAction(null);
      }
    },
    [activeAction, finishBookingAction, rejectingAction],
  );

  const handleEventAction = useCallback(
    async (notification, action) => {
      if (activeAction) return;

      const eventId = getNotificationEventId(notification);
      const eventRegistrationId = getNotificationEventRegistrationId(notification);
      if (!eventId || !eventRegistrationId) return;

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

        const nextRegistration =
          response.data?.registration ||
          {
            _id: eventRegistrationId,
            status:
              action === "approve-event-registration" ? "approved" : "rejected",
          };

        setEventRegistrations((currentRegistrations) =>
          currentRegistrations.map((registration) =>
            getEventRegistrationId(registration) === eventRegistrationId
              ? { ...registration, ...nextRegistration }
              : registration,
          ),
        );

        if (!notification.isRead) {
          await markOneRead(notification.id);
        }

        await loadNotifications();
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            "Could not process event registration. Please try again.",
        );
      } finally {
        setActiveAction(null);
      }
    },
    [activeAction, markOneRead, loadNotifications],
  );

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
    [activeAction, markOneRead, loadNotifications],
  );

  // ---- Navigation ----

  const handleView = useCallback(
    async (notification, destination) => {
      if (!notification.isRead) {
        await markOneRead(notification.id);
      }
      navigate(destination);
    },
    [markOneRead, navigate],
  );

  // ---- Derived state ----

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications],
  );

  const groupedNotifications = useMemo(() => {
    const groups = { Today: [], Yesterday: [], "This Week": [], Earlier: [] };

    for (const n of notifications) {
      const label = getGroupLabel(new Date(n.createdAt));
      groups[label].push(n);
    }

    return groups;
  }, [notifications]);

  const initialLoading = isLoading && notifications.length === 0;
  const refreshing = isLoading && notifications.length > 0;

  // ---- Render ----

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
            <Bell className="h-6 w-6" />
            Notifications
          </h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            Booking updates, messages, event invites, and system alerts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <Button
              className="text-xs sm:text-sm"
              onClick={markAllRead}
              variant="outline"
            >
              <CheckCheck className="mr-1.5 h-4 w-4" />
              Mark all read
            </Button>
          )}

          {notifications.length > 0 && (
            <Button
              className="text-xs sm:text-sm"
              onClick={clearAll}
              variant="ghost"
            >
              <Trash2 className="mr-1.5 h-4 w-4 text-neutral-400" />
              Clear all
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{error}</span>
          <Button
            aria-label="Retry loading notifications"
            className="shrink-0"
            onClick={() => loadNotifications({ showLoading: true })}
            size="icon"
            variant="ghost"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Refreshing indicator */}
      {refreshing && (
        <p className="rounded-xl bg-neutral-50 px-3 py-2 text-center text-sm text-neutral-500">
          Refreshing notifications…
        </p>
      )}

      {/* Loading */}
      {initialLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <NotificationSkeleton key={item} />
          ))}
        </div>
      ) : // Empty
      notifications.length === 0 ? (
        !isLoading && (
          <EmptyState
            description="Booking updates, messages, event invites, and system alerts will appear here."
            title={
              <span className="flex items-center justify-center gap-2">
                <Bell className="h-5 w-5 text-neutral-400" />
                No notifications yet
              </span>
            }
          />
        )
      ) : (
        // List with groups
        <div className="space-y-6">
          {groupedNotifications.Today.length > 0 && (
            <NotificationGroup
              currentUser={currentUser}
              activeAction={activeAction}
              bookingById={bookingById}
              eventRegistrationById={eventRegistrationById}
              jobApplicationById={jobApplicationById}
              notifications={groupedNotifications.Today}
              onBookingAction={handleBookingAction}
              onEventAction={handleEventAction}
              onJobAction={handleJobAction}
              onDelete={deleteOne}
              onMarkRead={markOneRead}
              onView={handleView}
              title="Today"
            />
          )}

          {groupedNotifications.Yesterday.length > 0 && (
            <NotificationGroup
              currentUser={currentUser}
              activeAction={activeAction}
              bookingById={bookingById}
              eventRegistrationById={eventRegistrationById}
              jobApplicationById={jobApplicationById}
              notifications={groupedNotifications.Yesterday}
              onBookingAction={handleBookingAction}
              onEventAction={handleEventAction}
              onJobAction={handleJobAction}
              onDelete={deleteOne}
              onMarkRead={markOneRead}
              onView={handleView}
              title="Yesterday"
            />
          )}

          {groupedNotifications["This Week"].length > 0 && (
            <NotificationGroup
              currentUser={currentUser}
              activeAction={activeAction}
              bookingById={bookingById}
              eventRegistrationById={eventRegistrationById}
              jobApplicationById={jobApplicationById}
              notifications={groupedNotifications["This Week"]}
              onBookingAction={handleBookingAction}
              onEventAction={handleEventAction}
              onJobAction={handleJobAction}
              onDelete={deleteOne}
              onMarkRead={markOneRead}
              onView={handleView}
              title="This Week"
            />
          )}

          {groupedNotifications.Earlier.length > 0 && (
            <NotificationGroup
              currentUser={currentUser}
              activeAction={activeAction}
              bookingById={bookingById}
              eventRegistrationById={eventRegistrationById}
              jobApplicationById={jobApplicationById}
              notifications={groupedNotifications.Earlier}
              onBookingAction={handleBookingAction}
              onEventAction={handleEventAction}
              onJobAction={handleJobAction}
              onDelete={deleteOne}
              onMarkRead={markOneRead}
              onView={handleView}
              title="Earlier"
            />
          )}
        </div>
      )}

      {rejectingAction && (
        <RejectBookingModal
          booking={{
            ...rejectingAction.booking,
            clientName:
              rejectingAction.booking?.client?.name ||
              rejectingAction.booking?.clientName,
          }}
          error={rejectionError}
          isSubmitting={
            activeAction?.notificationId === rejectingAction.notification.id &&
            activeAction?.action === "reject-booking"
          }
          onClose={() => {
            if (activeAction) return;
            setRejectingAction(null);
            setRejectionError("");
          }}
          onSubmit={rejectBookingFromNotification}
        />
      )}
    </div>
  );
}
