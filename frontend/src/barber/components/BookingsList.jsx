import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { Card, CardContent } from "@/shared/components/ui/card";
import BookingsHeaderFilters from "@/barber/components/bookings/BookingsHeaderFilters";
import BookingSections from "@/barber/components/bookings/BookingSections";
import ManualBookingModal from "@/barber/components/bookings/ManualBookingModal";
import RejectBookingModal from "@/barber/components/RejectBookingModal";
import { getSocket } from "@/shared/lib/socket";
import {
  addBooking,
  fetchBarberBookings,
  updateBooking,
} from "@/store/slices/bookingsSlice";
import api from "@/shared/api/axios";
import {
  formatDateKey,
  formatDateLabel,
  getDayKeyFromDate,
  getNext7Days,
  parseDateKey,
} from "@/shared/utils/dates";

const getInitialManualBooking = (dateKey) => ({
  clientName: "",
  clientPhone: "",
  serviceId: "",
  bookingDate: dateKey,
  time: "",
});

const bookingSections = [
  {
    key: "pending",
    title: "Pending",
    emptyText: "No pending bookings",
    shouldAlwaysShow: true,
    statuses: ["pending"],
  },
  {
    key: "accepted",
    title: "Accepted",
    emptyText: "No accepted bookings",
    shouldAlwaysShow: true,
    statuses: ["accepted"],
  },
  {
    key: "completed",
    title: "Completed",
    emptyText: "No completed bookings",
    statuses: ["completed"],
  },
  {
    key: "closed",
    title: "Closed",
    emptyText: "No closed bookings",
    statuses: ["rejected", "cancelled", "expired", "no_show", "late_cancelled"],
  },
];

const getBookingId = (booking) => booking?.id || booking?._id || "";

const getClientName = (booking) =>
  booking?.client?.name || booking?.clientName || "Client";

const getServiceName = (booking) =>
  booking?.service?.name || booking?.serviceName || "Service";

const getBookingTime = (booking) => booking?.time || "";

const getBookingStatus = (booking) => booking?.status || "pending";

const getBookingDuration = (booking) => {
  const duration = Number(booking?.duration || 0);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
};

export default function BookingsList({
  bookings,
  services = [],
  isLoading = false,
  error = "",
}) {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?.id;
  const notifications = useSelector((state) => state.notifications);
  const dateOptions = getNext7Days();
  const [selectedDate, setSelectedDate] = useState(dateOptions[0].value);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddingBooking, setIsAddingBooking] = useState(false);
  const [rejectingBooking, setRejectingBooking] = useState(null);
  const [isRejectingBooking, setIsRejectingBooking] = useState(false);
  const [rejectionError, setRejectionError] = useState("");
  const [rescheduleAction, setRescheduleAction] = useState(null);
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [highlightedBookingIds, setHighlightedBookingIds] = useState(() => new Set());
  const previousBookingIdsRef = useRef(null);
  const highlightTimeoutsRef = useRef(new Map());
  const approvedSalons =
    currentUser?.salons?.filter((s) => s.status === "approved") || [];
  const primarySalon =
    approvedSalons.find((s) => s.isPrimary) || approvedSalons[0] || null;
  const [manualBooking, setManualBooking] = useState(() =>
    getInitialManualBooking(dateOptions[0].value)
  );
  const selectedDateObject = parseDateKey(selectedDate);
  const selectedDateLabel = selectedDateObject
    ? formatDateLabel(selectedDateObject)
    : selectedDate;
  const activeServices = services.filter(
    (service) => String(service.barberId) === String(currentUser?.id) && service.active
  );
  const filteredBookings = bookings.filter(
    (booking) => booking?.bookingDate === selectedDate
  );
  const groupedBookings = bookingSections.map((section) => {
    const sectionStatuses = new Set(section.statuses);
    const sectionBookings = filteredBookings
      .filter((booking) => sectionStatuses.has(getBookingStatus(booking)))
      .sort((a, b) => getBookingTime(a).localeCompare(getBookingTime(b)));

    return {
      ...section,
      bookings: sectionBookings,
    };
  });
  const notificationCount = notifications.length;

  const clearHighlightTimeout = (bookingId) => {
    const timeoutId = highlightTimeoutsRef.current.get(bookingId);

    if (!timeoutId) return;

    clearTimeout(timeoutId);
    highlightTimeoutsRef.current.delete(bookingId);
  };

  const highlightNewBookings = useCallback(
    (incomingBookings = []) => {
      const incomingIds = new Set(
        incomingBookings.map((booking) => String(getBookingId(booking))).filter(Boolean)
      );

      if (!previousBookingIdsRef.current) {
        previousBookingIdsRef.current = incomingIds;
        return;
      }

      const newSelectedDateIds = incomingBookings
        .filter(
          (booking) =>
            booking?.bookingDate === selectedDate &&
            !previousBookingIdsRef.current.has(String(getBookingId(booking)))
        )
        .map((booking) => String(getBookingId(booking)))
        .filter(Boolean);

      previousBookingIdsRef.current = incomingIds;

      if (newSelectedDateIds.length === 0) return;

      setHighlightedBookingIds((currentIds) => {
        const nextIds = new Set(currentIds);
        newSelectedDateIds.forEach((bookingId) => nextIds.add(bookingId));
        return nextIds;
      });

      newSelectedDateIds.forEach((bookingId) => {
        clearHighlightTimeout(bookingId);
        const timeoutId = setTimeout(() => {
          setHighlightedBookingIds((currentIds) => {
            const nextIds = new Set(currentIds);
            nextIds.delete(bookingId);
            return nextIds;
          });
          highlightTimeoutsRef.current.delete(bookingId);
        }, 5000);

        highlightTimeoutsRef.current.set(bookingId, timeoutId);
      });
    },
    [selectedDate]
  );

  const fetchBookings = useCallback(
    async ({
      showLoading = false,
      silent = false,
      clearError = !silent,
      shouldUpdate = () => true,
    } = {}) => {
      if (!currentUserId) return;

      if (showLoading && shouldUpdate()) {
        setIsInitialLoading(true);
      }
      if (clearError && shouldUpdate()) {
        setActionError("");
      }

      try {
        const refreshedBookings = await dispatch(fetchBarberBookings(currentUserId));

        if (shouldUpdate()) {
          highlightNewBookings(refreshedBookings || []);
        }
      } catch (requestError) {
        if (shouldUpdate() && !silent) {
          setActionError(
            requestError.response?.data?.message ||
              "Could not load bookings. Please try again."
          );
        }
      } finally {
        if (shouldUpdate()) {
          setIsInitialLoading(false);
        }
      }
    },
    [currentUserId, dispatch, highlightNewBookings]
  );

  useEffect(() => {
    if (!currentUserId || !selectedDate) return undefined;

    let isMounted = true;
    const shouldUpdate = () => isMounted;

    const immediateFetchId = setTimeout(() => {
      fetchBookings({ clearError: false, shouldUpdate });
    }, 0);

    return () => {
      isMounted = false;
      clearTimeout(immediateFetchId);
    };
  }, [currentUserId, fetchBookings, notificationCount, selectedDate]);

  // Socket listener for real-time booking updates
  useEffect(() => {
    if (!currentUserId) return;

    const socket = getSocket();
    if (!socket) return;

    const handleBookingUpdated = (data) => {
      const bookingBarberId = data.booking.barberId || data.booking.barber?._id;
      if (String(bookingBarberId) === String(currentUserId)) {
        fetchBookings({ silent: true });
      }
    };

    socket.on("bookingUpdated", handleBookingUpdated);

    return () => {
      socket.off("bookingUpdated", handleBookingUpdated);
    };
  }, [currentUserId, fetchBookings]);

  useEffect(
    () => () => {
      highlightTimeoutsRef.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      highlightTimeoutsRef.current.clear();
    },
    []
  );

  const isBookingPast = (booking) => {
    if (!booking?.bookingDate) return false;
    const now = new Date();
    const bookingEnd = new Date(`${booking.bookingDate}T${booking.time || "00:00"}:00`);

    if (Number.isNaN(bookingEnd.getTime())) return false;

    bookingEnd.setMinutes(bookingEnd.getMinutes() + getBookingDuration(booking));
    return bookingEnd <= now;
  };

  const isEligibleForNoShowLateCancel = (booking) => {
    return (
      booking?.status === "accepted" &&
      isBookingPast(booking) &&
      !booking.noShowMarkedAt &&
      !booking.lateCancelledAt
    );
  };

  const markNoShowBooking = async (booking) => {
    if (!window.confirm("Mark this booking as no-show? This cannot be undone.")) return;
    setActionError("");
    setSuccessMessage("");

    try {
      const bookingId = getBookingId(booking);
      const { data } = await api.patch(`/bookings/${bookingId}/no-show`);
      dispatch(updateBooking(data));
      await fetchBookings({ silent: true });
      setSuccessMessage("Booking marked as no-show");
    } catch (requestError) {
      setActionError(
        requestError.response?.data?.message ||
          "Could not mark no-show. Please try again."
      );
    }
  };

  const markLateCancelBooking = async (booking) => {
    if (!window.confirm("Mark this booking as late cancellation? This cannot be undone.")) return;
    setActionError("");
    setSuccessMessage("");

    try {
      const bookingId = getBookingId(booking);
      const { data } = await api.patch(`/bookings/${bookingId}/late-cancel`);
      dispatch(updateBooking(data));
      await fetchBookings({ silent: true });
      setSuccessMessage("Booking marked as late cancellation");
    } catch (requestError) {
      setActionError(
        requestError.response?.data?.message ||
          "Could not mark late cancellation. Please try again."
      );
    }
  };

  const updateBookingStatus = async (booking, status) => {
    setActionError("");
    setSuccessMessage("");

    try {
      const { data } = await api.put(`/bookings/${booking.id}`, { status });
      dispatch(updateBooking(data));
      await fetchBookings({ silent: true });
    } catch (requestError) {
      setActionError(
        requestError.response?.data?.message ||
          "Could not update booking. Please try again."
      );
    }
  };

  const openRejectBookingModal = (booking) => {
    setRejectingBooking(booking);
    setRejectionError("");
    setActionError("");
    setSuccessMessage("");
  };

  const rejectBooking = async ({ rejectionReason }) => {
    if (!rejectingBooking || isRejectingBooking) return;

    setRejectionError("");
    setIsRejectingBooking(true);

    try {
      const { data } = await api.put(`/bookings/${rejectingBooking.id}`, {
        status: "rejected",
        rejectionReason,
      });
      dispatch(updateBooking(data));
      await fetchBookings({ silent: true });
      setRejectingBooking(null);
    } catch (requestError) {
      setRejectionError(
        requestError.response?.data?.message ||
          "Could not reject booking. Please try again."
      );
    } finally {
      setIsRejectingBooking(false);
    }
  };

  const respondToRescheduleRequest = async (booking, action) => {
    const bookingId = getBookingId(booking);
    if (!bookingId || rescheduleAction) return;

    setActionError("");
    setSuccessMessage("");
    setRescheduleAction({ bookingId: String(bookingId), action });

    try {
      const { data } = await api.patch(
        `/bookings/${bookingId}/reschedule-request/${action}`,
        {}
      );

      dispatch(updateBooking(data));
      await fetchBookings({ silent: true });
      setSuccessMessage(
        action === "accept"
          ? "Reschedule request accepted"
          : "Reschedule request rejected"
      );
    } catch (requestError) {
      setActionError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          `Could not ${action} reschedule request. Please try again.`
      );
    } finally {
      setRescheduleAction(null);
    }
  };

  const openAddBookingModal = () => {
    setManualBooking(getInitialManualBooking(selectedDate));
    setActionError("");
    setSuccessMessage("");
    setIsAddModalOpen(true);
  };

  const updateManualBooking = (field, value) => {
    setManualBooking((currentBooking) => ({
      ...currentBooking,
      [field]: value,
    }));
  };

  const createManualBooking = async (event) => {
    event.preventDefault();

    if (!currentUser?.id || isAddingBooking) return;

    const bookingDate = manualBooking.bookingDate;
    const parsedDate = parseDateKey(bookingDate);
    const clientName = manualBooking.clientName.trim();
    const clientPhone = manualBooking.clientPhone.trim();

    setActionError("");
    setSuccessMessage("");

    if (!clientName) {
      setActionError("Client name is required");
      return;
    }

    if (!manualBooking.serviceId || !bookingDate || !manualBooking.time) {
      setActionError("Service, date, and time are required");
      return;
    }

    if (!parsedDate) {
      setActionError("Date must be YYYY-MM-DD");
      return;
    }

    setIsAddingBooking(true);

    try {
      const salonId = primarySalon?.id || primarySalon?._id;

      const { data } = await api.post("/bookings", {
        barberId: currentUser.id,
        serviceId: manualBooking.serviceId,
        bookingDate,
        dayKey: getDayKeyFromDate(parsedDate),
        time: manualBooking.time,
        clientName,
        clientPhone,
        phone: clientPhone,
        createdBy: "barber",
        salonId,
      });

      dispatch(addBooking(data));
      await fetchBookings({ silent: true });
      setSelectedDate(bookingDate);
      setIsAddModalOpen(false);
      setManualBooking(getInitialManualBooking(bookingDate));
      setSuccessMessage("Booking added successfully");
    } catch (requestError) {
      setActionError(
        requestError.response?.data?.message ||
          "Could not add booking. Please try again."
      );
    } finally {
      setIsAddingBooking(false);
    }
  };

  const handleDateInputChange = (value) => {
    setSelectedDate(value || formatDateKey(new Date()));
  };

  return (
    <Card className="rounded-2xl sm:rounded-3xl lg:col-span-2">
      <CardContent className="space-y-5 p-4 sm:p-6">
        <BookingsHeaderFilters
          actionError={actionError}
          dateOptions={dateOptions}
          error={error}
          selectedDate={selectedDate}
          selectedDateLabel={selectedDateLabel}
          successMessage={successMessage}
          onAddBooking={openAddBookingModal}
          onDateInputChange={handleDateInputChange}
          onSelectDate={setSelectedDate}
        />

        <BookingSections
          filteredBookings={filteredBookings}
          getBookingId={getBookingId}
          getBookingStatus={getBookingStatus}
          getBookingTime={getBookingTime}
          getClientName={getClientName}
          getServiceName={getServiceName}
          groupedBookings={groupedBookings}
          highlightedBookingIds={highlightedBookingIds}
          isEligibleForNoShowLateCancel={isEligibleForNoShowLateCancel}
          isInitialLoading={isInitialLoading}
          isLoading={isLoading}
          onMarkLateCancelBooking={markLateCancelBooking}
          onMarkNoShowBooking={markNoShowBooking}
          onOpenRejectBookingModal={openRejectBookingModal}
          onAcceptRescheduleRequest={(booking) =>
            respondToRescheduleRequest(booking, "accept")
          }
          onRejectRescheduleRequest={(booking) =>
            respondToRescheduleRequest(booking, "reject")
          }
          rescheduleAction={rescheduleAction}
          onUpdateBookingStatus={updateBookingStatus}
        />

        {isAddModalOpen && (
          <ManualBookingModal
            activeServices={activeServices}
            isAddingBooking={isAddingBooking}
            manualBooking={manualBooking}
            onClose={() => setIsAddModalOpen(false)}
            onSubmit={createManualBooking}
            onUpdateManualBooking={updateManualBooking}
          />
        )}

        {rejectingBooking && (
          <RejectBookingModal
            booking={rejectingBooking}
            error={rejectionError}
            isSubmitting={isRejectingBooking}
            onClose={() => setRejectingBooking(null)}
            onSubmit={rejectBooking}
          />
        )}
      </CardContent>
    </Card>
  );
}
