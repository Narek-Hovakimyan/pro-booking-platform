import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import api from "@/shared/api/axios";
import { getSocket } from "@/shared/lib/socket";
import { useBookingNotificationActions } from "@/shared/hooks/useBookingNotificationActions";
import { useEventRegistrationNotificationActions } from "@/shared/hooks/useEventRegistrationNotificationActions";
import { useJobApplicationNotificationActions } from "@/shared/hooks/useJobApplicationNotificationActions";
import { useNotificationMutationActions } from "@/shared/hooks/useNotificationMutationActions";
import { getGroupLabel } from "@/shared/utils/notificationHelpers";

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
  const accountGenerationRef = useRef(0);
  const currentAccountIdRef = useRef(currentUserId);
  const isPageAliveRef = useRef(true);
  const isClearingAllRef = useRef(false);
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

  const invalidateLoadRequests = useCallback(() => {
    loadRequestIdRef.current += 1;
  }, []);

  const {
    clearAll,
    deleteOne,
    isClearingAll,
    isMarkingAllRead,
    markAllRead,
    markOneRead,
  } = useNotificationMutationActions({
    captureAccount,
    invalidateLoadRequests,
    isCurrentAccount,
    setError,
    setIsLoading,
    setNotifications,
  });

  useEffect(() => {
    isClearingAllRef.current = isClearingAll;
  }, [isClearingAll]);

  const loadNotifications = useCallback(
    async ({ showLoading = false, accountSnapshot = null } = {}) => {
      const snapshot = {
        ...(accountSnapshot || captureAccount()),
        requestId: loadRequestIdRef.current + 1,
      };
      if (
        !snapshot.userId ||
        !isCurrentAccount(snapshot) ||
        isClearingAllRef.current
      ) {
        return;
      }

      loadRequestIdRef.current = snapshot.requestId;
      if (showLoading) setIsLoading(true);
      setError("");

      try {
        const { data } = await api.get("/notifications");
        if (isClearingAllRef.current) return;
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
    let refreshInFlight = null;
    let refreshQueued = false;
    const accountSnapshot = captureAccount();

    function safeLoad(options = {}) {
      if (!isMounted || !isCurrentAccount(accountSnapshot)) return Promise.resolve();

      if (refreshInFlight) {
        refreshQueued = true;
        return refreshInFlight;
      }

      refreshInFlight = loadNotifications({ ...options, accountSnapshot }).finally(() => {
        refreshInFlight = null;
        if (refreshQueued && isMounted && isCurrentAccount(accountSnapshot)) {
          refreshQueued = false;
          safeLoad();
        } else {
          refreshQueued = false;
        }
      });

      return refreshInFlight;
    }

    safeLoad({ showLoading: true });
    intervalId = setInterval(() => safeLoad(), 15000);
    const socket = getSocket();
    const handleNotification = () => safeLoad();

    socket?.on("notification", handleNotification);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      socket?.off("notification", handleNotification);
    };
  }, [captureAccount, currentUserId, isCurrentAccount, loadNotifications]);

  const {
    bookingById,
    handleBookingAction,
    rejectionError,
    rejectBookingFromNotification,
    rejectingAction,
    setRejectingAction,
    setRejectionError,
  } = useBookingNotificationActions({
    activeAction,
    bookings,
    captureAccount,
    currentUser,
    currentUserId,
    dispatch,
    isCurrentAccount,
    markOneRead,
    notifications,
    setActiveAction,
    setError,
  });

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
