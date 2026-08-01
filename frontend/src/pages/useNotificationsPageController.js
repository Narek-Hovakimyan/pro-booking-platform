import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import api from "@/shared/api/axios";
import { useEventRegistrationNotificationActions } from "@/shared/hooks/useEventRegistrationNotificationActions";
import { useJobApplicationNotificationActions } from "@/shared/hooks/useJobApplicationNotificationActions";
import {
  getBookingId,
  getIdString,
  getNotificationBookingId,
} from "@/shared/utils/notificationActionHelpers";
import { getGroupLabel } from "@/shared/utils/notificationHelpers";
import {
  fetchBarberBookings,
  updateBooking,
} from "@/store/slices/bookingsSlice";

const notificationsCacheByUserId = new Map();

export function clearNotificationsCacheForTests() {
  notificationsCacheByUserId.clear();
}

export function getNotificationsCacheForTests(userId) {
  return notificationsCacheByUserId.get(String(userId)) || [];
}

export function useNotificationsPageController({ currentUser, currentUserId }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const bookings = useSelector((state) => state.bookings || []);
  const [notifications, setNotifications] = useState(
    () => notificationsCacheByUserId.get(String(currentUserId)) || [],
  );
  const [isLoading, setIsLoading] = useState(
    () => !notificationsCacheByUserId.has(String(currentUserId)),
  );
  const [error, setError] = useState("");
  const [activeAction, setActiveAction] = useState(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [rejectingAction, setRejectingAction] = useState(null);
  const [rejectionError, setRejectionError] = useState("");
  const accountGenerationRef = useRef(0);
  const clearAllInFlightRef = useRef(false);
  const currentAccountIdRef = useRef(currentUserId);
  const isPageAliveRef = useRef(true);
  const loadRequestIdRef = useRef(0);

  const captureAccount = useCallback(
    () => ({ generation: accountGenerationRef.current, userId: currentUserId }),
    [currentUserId],
  );

  const isCurrentAccount = useCallback(
    (snapshot) =>
      isPageAliveRef.current &&
      Boolean(snapshot?.userId) &&
      snapshot.userId === currentAccountIdRef.current &&
      snapshot.generation === accountGenerationRef.current,
    [],
  );

  const isCurrentLoadRequest = useCallback(
    (snapshot) =>
      isCurrentAccount(snapshot) && snapshot.requestId === loadRequestIdRef.current,
    [isCurrentAccount],
  );

  useEffect(() => {
    accountGenerationRef.current += 1;
    loadRequestIdRef.current = 0;
    currentAccountIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    isPageAliveRef.current = true;
    return () => {
      isPageAliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) return undefined;
    notificationsCacheByUserId.set(String(currentUserId), notifications);
    return undefined;
  }, [currentUserId, notifications]);

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

  const loadNotifications = useCallback(
    async ({ showLoading = false, accountSnapshot = null } = {}) => {
      const snapshot = {
        ...(accountSnapshot || captureAccount()),
        requestId: loadRequestIdRef.current + 1,
      };
      if (
        !snapshot.userId ||
        !isCurrentAccount(snapshot) ||
        clearAllInFlightRef.current
      ) {
        return;
      }

      loadRequestIdRef.current = snapshot.requestId;
      if (showLoading) setIsLoading(true);
      setError("");

      try {
        const { data } = await api.get("/notifications");
        if (clearAllInFlightRef.current) return;
        const nextNotifications = data.map((item) => ({
          ...item,
          id: item.id || item._id,
        }));

        if (!isCurrentLoadRequest(snapshot)) return;
        setNotifications(nextNotifications);
      } catch (requestError) {
        if (!isCurrentLoadRequest(snapshot)) return;
        setError(
          requestError.response?.data?.message ||
            "Could not load notifications. Please try again.",
        );
      } finally {
        if (isCurrentLoadRequest(snapshot)) {
          setIsLoading(false);
        }
      }
    },
    [captureAccount, isCurrentAccount, isCurrentLoadRequest],
  );

  useEffect(() => {
    if (!currentUserId) return undefined;

    let isMounted = true;
    let intervalId = null;
    const accountSnapshot = captureAccount();

    async function safeLoad(options) {
      if (!isMounted || !isCurrentAccount(accountSnapshot)) return;
      await loadNotifications({ ...options, accountSnapshot });
    }

    safeLoad({ showLoading: true });
    intervalId = setInterval(() => safeLoad(), 15000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [captureAccount, currentUserId, isCurrentAccount, loadNotifications]);

  useEffect(() => {
    if (
      currentUser?.role !== "barber" ||
      !currentUserId ||
      actionableNotificationCount === 0
    ) {
      return undefined;
    }

    let isMounted = true;
    const accountSnapshot = captureAccount();

    dispatch(fetchBarberBookings(currentUserId)).catch((requestError) => {
      if (!isMounted || !isCurrentAccount(accountSnapshot)) return;
      setError(
        requestError.response?.data?.message ||
          "Could not load bookings for notification actions.",
      );
    });

    return () => {
      isMounted = false;
    };
  }, [
    actionableNotificationCount,
    captureAccount,
    currentUser?.role,
    currentUserId,
    dispatch,
    isCurrentAccount,
  ]);

  const markOneRead = useCallback(
    async (notificationId) => {
      const accountSnapshot = captureAccount();
      if (!isCurrentAccount(accountSnapshot)) return;
      setError("");

      try {
        const { data } = await api.put(`/notifications/${notificationId}/read`);
        const nextNotification = { ...data, id: data.id || data._id };
        if (!isCurrentAccount(accountSnapshot)) return;

        setNotifications((current) =>
          current.map((notification) =>
            notification.id === notificationId ? nextNotification : notification,
          ),
        );
        window.dispatchEvent(new Event("notifications:updated"));
      } catch (requestError) {
        if (!isCurrentAccount(accountSnapshot)) return;
        setError(
          requestError.response?.data?.message ||
            "Could not mark notification as read.",
        );
      }
    },
    [captureAccount, isCurrentAccount],
  );

  const markAllRead = useCallback(async () => {
    const accountSnapshot = captureAccount();
    if (isMarkingAllRead || isClearingAll || !isCurrentAccount(accountSnapshot)) {
      return;
    }

    setIsMarkingAllRead(true);
    setError("");

    try {
      await api.put("/notifications/read");
      if (!isCurrentAccount(accountSnapshot)) return;

      setNotifications((current) =>
        current.map((notification) => ({ ...notification, isRead: true })),
      );
      window.dispatchEvent(new Event("notifications:updated"));
    } catch (requestError) {
      if (!isCurrentAccount(accountSnapshot)) return;
      setError(
        requestError.response?.data?.message ||
          "Could not mark notifications as read.",
      );
    } finally {
      if (isCurrentAccount(accountSnapshot)) {
        setIsMarkingAllRead(false);
      }
    }
  }, [captureAccount, isClearingAll, isCurrentAccount, isMarkingAllRead]);

  const deleteOne = useCallback(
    async (notificationId) => {
      const accountSnapshot = captureAccount();
      if (clearAllInFlightRef.current || !isCurrentAccount(accountSnapshot)) return;
      setError("");

      try {
        await api.delete(`/notifications/${notificationId}`);
        if (!isCurrentAccount(accountSnapshot)) return;

        setNotifications((current) =>
          current.filter((notification) => notification.id !== notificationId),
        );
        window.dispatchEvent(new Event("notifications:updated"));
      } catch (requestError) {
        if (!isCurrentAccount(accountSnapshot)) return;
        setError(
          requestError.response?.data?.message ||
            "Could not delete notification.",
        );
      }
    },
    [captureAccount, isCurrentAccount],
  );

  const clearAll = useCallback(async () => {
    const accountSnapshot = captureAccount();
    if (clearAllInFlightRef.current || !isCurrentAccount(accountSnapshot)) return;

    clearAllInFlightRef.current = true;
    loadRequestIdRef.current += 1;
    setIsLoading(false);
    setIsClearingAll(true);
    setError("");

    try {
      await api.delete("/notifications/user/all");
      if (!isCurrentAccount(accountSnapshot)) return;

      setNotifications([]);
      window.dispatchEvent(new Event("notifications:updated"));
    } catch (requestError) {
      if (!isCurrentAccount(accountSnapshot)) return;
      setError(
        requestError.response?.data?.message ||
          "Could not clear notifications.",
      );
    } finally {
      clearAllInFlightRef.current = false;
      if (isCurrentAccount(accountSnapshot)) {
        setIsClearingAll(false);
      }
    }
  }, [captureAccount, isCurrentAccount]);

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
      captureAccount,
      isCurrentAccount,
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
      captureAccount,
      isCurrentAccount,
    });

  const refreshBarberBookings = useCallback(async () => {
    if (currentUser?.role !== "barber" || !currentUserId) return;
    const accountSnapshot = captureAccount();
    if (!isCurrentAccount(accountSnapshot)) return;
    await dispatch(fetchBarberBookings(currentUserId));
    if (!isCurrentAccount(accountSnapshot)) return;
  }, [captureAccount, currentUser?.role, currentUserId, dispatch, isCurrentAccount]);

  const finishBookingAction = useCallback(
    async (notification, updatedBooking, accountSnapshot) => {
      if (!isCurrentAccount(accountSnapshot)) return false;

      dispatch(updateBooking(updatedBooking));
      if (!notification.isRead) {
        await markOneRead(notification.id);
        if (!isCurrentAccount(accountSnapshot)) return false;
      }

      await refreshBarberBookings();
      if (!isCurrentAccount(accountSnapshot)) return false;
      return true;
    },
    [dispatch, isCurrentAccount, markOneRead, refreshBarberBookings],
  );

  const handleBookingAction = useCallback(
    async (notification, booking, action) => {
      if (activeAction) return;
      const accountSnapshot = captureAccount();
      if (!isCurrentAccount(accountSnapshot)) return;

      const bookingId =
        getBookingId(booking) || getNotificationBookingId(notification);
      if (!bookingId) return;

      if (action === "reject-booking") {
        if (!isCurrentAccount(accountSnapshot)) return;
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

        if (!isCurrentAccount(accountSnapshot)) return;
        await finishBookingAction(notification, response.data, accountSnapshot);
      } catch (requestError) {
        if (!isCurrentAccount(accountSnapshot)) return;
        setError(
          requestError.response?.data?.message ||
            "Could not update booking. Please try again.",
        );
      } finally {
        if (isCurrentAccount(accountSnapshot)) {
          setActiveAction(null);
        }
      }
    },
    [activeAction, captureAccount, finishBookingAction, isCurrentAccount],
  );

  const rejectBookingFromNotification = useCallback(
    async ({ rejectionReason }) => {
      if (!rejectingAction || activeAction) return;
      const accountSnapshot = captureAccount();
      if (!isCurrentAccount(accountSnapshot)) return;

      const { notification, booking } = rejectingAction;
      const bookingId =
        getBookingId(booking) || getNotificationBookingId(notification);
      if (!bookingId) return;

      setRejectionError("");
      setActiveAction({ notificationId: notification.id, action: "reject-booking" });

      try {
        const { data } = await api.put(`/bookings/${bookingId}`, {
          status: "rejected",
          rejectionReason,
        });

        if (!isCurrentAccount(accountSnapshot)) return;
        const finished = await finishBookingAction(
          notification,
          data,
          accountSnapshot,
        );
        if (!finished) return;

        setRejectingAction(null);
      } catch (requestError) {
        if (!isCurrentAccount(accountSnapshot)) return;
        setRejectionError(
          requestError.response?.data?.message ||
            "Could not reject booking. Please try again.",
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
      finishBookingAction,
      isCurrentAccount,
      rejectingAction,
    ],
  );

  const handleView = useCallback(
    async (notification, destination) => {
      const accountSnapshot = captureAccount();
      if (!isCurrentAccount(accountSnapshot)) return;
      if (!notification.isRead) {
        await markOneRead(notification.id);
        if (!isCurrentAccount(accountSnapshot)) return;
      }
      navigate(destination);
    },
    [captureAccount, isCurrentAccount, markOneRead, navigate],
  );

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications],
  );

  const groupedNotifications = useMemo(() => {
    const groups = { Today: [], Yesterday: [], "This Week": [], Earlier: [] };
    for (const notification of notifications) {
      const label = getGroupLabel(new Date(notification.createdAt));
      groups[label].push(notification);
    }
    return groups;
  }, [notifications]);

  return {
    activeAction,
    bookingById,
    clearAll,
    currentUser,
    deleteOne,
    error,
    eventRegistrationById,
    groupedNotifications,
    handleBookingAction,
    handleEventAction,
    handleJobAction,
    handleView,
    initialLoading: isLoading && notifications.length === 0,
    isClearingAll,
    isLoading,
    isMarkingAllRead,
    jobApplicationById,
    loadNotifications,
    markAllRead,
    markOneRead,
    notifications,
    refreshing: isLoading && notifications.length > 0,
    rejectionError,
    rejectBookingFromNotification,
    rejectingAction,
    setRejectingAction,
    setRejectionError,
    unreadCount,
  };
}
