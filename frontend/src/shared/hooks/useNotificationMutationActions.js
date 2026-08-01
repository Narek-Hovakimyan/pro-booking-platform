import { useCallback, useRef, useState } from "react";

import api from "@/shared/api/axios";

export function useNotificationMutationActions({
  captureAccount,
  isCurrentAccount,
  setNotifications,
  setError,
  setIsLoading,
  invalidateLoadRequests,
}) {
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const clearAllInFlightRef = useRef(false);

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
    [captureAccount, isCurrentAccount, setError, setNotifications],
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
  }, [
    captureAccount,
    isClearingAll,
    isCurrentAccount,
    isMarkingAllRead,
    setError,
    setNotifications,
  ]);

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
    [captureAccount, isCurrentAccount, setError, setNotifications],
  );

  const clearAll = useCallback(async () => {
    const accountSnapshot = captureAccount();
    if (clearAllInFlightRef.current || !isCurrentAccount(accountSnapshot)) return;

    clearAllInFlightRef.current = true;
    invalidateLoadRequests();
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
  }, [
    captureAccount,
    invalidateLoadRequests,
    isCurrentAccount,
    setError,
    setIsLoading,
    setNotifications,
  ]);

  return {
    clearAll,
    deleteOne,
    isClearingAll,
    isMarkingAllRead,
    markAllRead,
    markOneRead,
  };
}
