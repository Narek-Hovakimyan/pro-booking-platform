import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import RejectBookingModal from "@/barber/components/RejectBookingModal";
import NotificationsEmptyState from "@/client/components/notifications/NotificationsEmptyState";
import NotificationsHeader from "@/client/components/notifications/NotificationsHeader";
import NotificationsList from "@/client/components/notifications/NotificationsList";
import NotificationsStatus from "@/client/components/notifications/NotificationsStatus";
import api from "@/shared/api/axios";
import { Container } from "@/shared/components/ui/Container";
import { useEventRegistrationNotificationActions } from "@/shared/hooks/useEventRegistrationNotificationActions";
import { useJobApplicationNotificationActions } from "@/shared/hooks/useJobApplicationNotificationActions";
import {
  getBookingId,
  getIdString,
  getNotificationBookingId,
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

  // ---- Extracted hooks ----

  const { eventRegistrationById, handleEventAction } =
    useEventRegistrationNotificationActions({
      currentUser,
      currentUserId,
      notifications,
      activeAction,
      setActiveAction,
      setError,
      markOneRead,
      loadNotifications,
    });

  const { jobApplicationById, handleJobAction } =
    useJobApplicationNotificationActions({
      currentUser,
      currentUserId,
      notifications,
      activeAction,
      setActiveAction,
      setError,
      markOneRead,
      loadNotifications,
    });

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
    <Container className="pb-12" size="tight">
      <div className="space-y-5 sm:space-y-6">
        <NotificationsHeader
          hasNotifications={notifications.length > 0}
          onClearAll={clearAll}
          onMarkAllRead={markAllRead}
          unreadCount={unreadCount}
        />

        <NotificationsStatus
          error={error}
          initialLoading={initialLoading}
          onRetry={() => loadNotifications({ showLoading: true })}
          refreshing={refreshing}
        />

        {!initialLoading && notifications.length === 0 && !isLoading && (
          <NotificationsEmptyState />
        )}

        {!initialLoading && notifications.length > 0 && (
          <NotificationsList
            activeAction={activeAction}
            bookingById={bookingById}
            currentUser={currentUser}
            eventRegistrationById={eventRegistrationById}
            groupedNotifications={groupedNotifications}
            jobApplicationById={jobApplicationById}
            onBookingAction={handleBookingAction}
            onDelete={deleteOne}
            onEventAction={handleEventAction}
            onJobAction={handleJobAction}
            onMarkRead={markOneRead}
            onView={handleView}
          />
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
    </Container>
  );
}
