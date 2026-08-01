import { useCallback, useEffect, useMemo, useState } from "react";

import api from "@/shared/api/axios";
import {
  getBookingId,
  getIdString,
  getNotificationBookingId,
} from "@/shared/utils/notificationActionHelpers";
import {
  fetchBarberBookings,
  updateBooking,
} from "@/store/slices/bookingsSlice";

export function useBookingNotificationActions({
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
}) {
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
    [activeAction, captureAccount, finishBookingAction, isCurrentAccount, setActiveAction, setError],
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
      setActiveAction,
    ],
  );

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
    setError,
  ]);

  return {
    bookingById,
    handleBookingAction,
    rejectionError,
    rejectBookingFromNotification,
    rejectingAction,
    setRejectingAction,
    setRejectionError,
  };
}
