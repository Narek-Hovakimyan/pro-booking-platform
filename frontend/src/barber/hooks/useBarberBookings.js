import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import api from "@/shared/api/axios";
import { getSocket } from "@/shared/lib/socket";
import { addBooking, fetchBarberBookings, updateBooking } from "@/store/slices/bookingsSlice";
import { getDayKeyFromDate, parseDateKey } from "@/shared/utils/dates";

const getInitialManualBooking = (dateKey) => ({ clientName: "", clientPhone: "", serviceId: "", bookingDate: dateKey, time: "" });
const getBookingId = (booking) => booking?.id || booking?._id || "";
const getBookingDuration = (booking) => {
  const duration = Number(booking?.duration || 0);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
};
const getPrimarySalonId = (entry) => {
  if (!entry) return "";
  if (typeof entry.salon === "string") return entry.salon;
  if (entry.salon && typeof entry.salon === "object") return entry.salon.id || entry.salon._id || "";
  if ("salon" in entry || "status" in entry || "isPrimary" in entry) return "";
  return entry.id || entry._id || "";
};

export default function useBarberBookings({ services = [], selectedDate, setSelectedDate, manageLifecycle = true }) {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const notifications = useSelector((state) => state.notifications);
  const currentUserId = currentUser?.id;
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddingBooking, setIsAddingBooking] = useState(false);
  const [rejectingBooking, setRejectingBooking] = useState(null);
  const [isRejectingBooking, setIsRejectingBooking] = useState(false);
  const [rejectionError, setRejectionError] = useState("");
  const [rescheduleAction, setRescheduleAction] = useState(null);
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [manualBooking, setManualBooking] = useState(() => getInitialManualBooking(selectedDate));
  const [highlightedBookingIds, setHighlightedBookingIds] = useState(() => new Set());
  const previousBookingIdsRef = useRef(null);
  const highlightTimeoutsRef = useRef(new Map());
  const approvedSalons = currentUser?.salons?.filter((salon) => salon.status === "approved") || [];
  const primarySalon = approvedSalons.find((salon) => salon.isPrimary) || approvedSalons[0] || null;
  const activeServices = services.filter((service) => String(service.barberId) === String(currentUserId) && service.active);

  const clearHighlightTimeout = (bookingId) => {
    const timeoutId = highlightTimeoutsRef.current.get(bookingId);
    if (timeoutId) { clearTimeout(timeoutId); highlightTimeoutsRef.current.delete(bookingId); }
  };
  const highlightNewBookings = useCallback((incomingBookings = []) => {
    const incomingIds = new Set(incomingBookings.map((booking) => String(getBookingId(booking))).filter(Boolean));
    if (!previousBookingIdsRef.current) { previousBookingIdsRef.current = incomingIds; return; }
    const newIds = incomingBookings.filter((booking) => booking?.bookingDate === selectedDate && !previousBookingIdsRef.current.has(String(getBookingId(booking)))).map(getBookingId).map(String).filter(Boolean);
    previousBookingIdsRef.current = incomingIds;
    if (!newIds.length) return;
    setHighlightedBookingIds((current) => new Set([...current, ...newIds]));
    newIds.forEach((bookingId) => {
      clearHighlightTimeout(bookingId);
      highlightTimeoutsRef.current.set(bookingId, setTimeout(() => {
        setHighlightedBookingIds((current) => { const next = new Set(current); next.delete(bookingId); return next; });
        highlightTimeoutsRef.current.delete(bookingId);
      }, 5000));
    });
  }, [selectedDate]);
  const fetchBookings = useCallback(async ({ showLoading = false, silent = false, clearError = !silent, shouldUpdate = () => true } = {}) => {
    if (!currentUserId) return;
    if (showLoading && shouldUpdate()) setIsInitialLoading(true);
    if (clearError && shouldUpdate()) setActionError("");
    try {
      const refreshed = await dispatch(fetchBarberBookings(currentUserId));
      if (shouldUpdate()) highlightNewBookings(refreshed || []);
      return refreshed;
    } catch (requestError) {
      if (shouldUpdate() && !silent) setActionError(requestError.response?.data?.message || "Could not load bookings. Please try again.");
      return [];
    } finally { if (shouldUpdate()) setIsInitialLoading(false); }
  }, [currentUserId, dispatch, highlightNewBookings]);
  useEffect(() => {
    if (!manageLifecycle || !currentUserId || !selectedDate) return undefined;
    let mounted = true;
    const immediateFetchId = setTimeout(() => fetchBookings({ clearError: false, shouldUpdate: () => mounted }), 0);
    return () => { mounted = false; clearTimeout(immediateFetchId); };
  }, [currentUserId, fetchBookings, manageLifecycle, notifications.length, selectedDate]);
  useEffect(() => {
    if (!manageLifecycle || !currentUserId) return undefined;
    const socket = getSocket();
    if (!socket) return undefined;
    const handleBookingUpdated = (data) => {
      const barberId = data.booking.barberId || data.booking.barber?._id;
      if (String(barberId) === String(currentUserId)) fetchBookings({ silent: true });
    };
    socket.on("bookingUpdated", handleBookingUpdated);
    return () => socket.off("bookingUpdated", handleBookingUpdated);
  }, [currentUserId, fetchBookings, manageLifecycle]);
  useEffect(() => () => {
    highlightTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    highlightTimeoutsRef.current.clear();
  }, []);

  const isEligibleForNoShowLateCancel = (booking) => {
    if (booking?.status !== "accepted" || !booking?.bookingDate || booking.noShowMarkedAt || booking.lateCancelledAt) return false;
    const end = new Date(`${booking.bookingDate}T${booking.time || "00:00"}:00`);
    if (Number.isNaN(end.getTime())) return false;
    end.setMinutes(end.getMinutes() + getBookingDuration(booking));
    return end <= new Date();
  };
  const markNoShowBooking = async (booking) => {
    if (!window.confirm("Mark this booking as no-show? This cannot be undone.")) return;
    setActionError(""); setSuccessMessage("");
    try { const { data } = await api.patch(`/bookings/${getBookingId(booking)}/no-show`); dispatch(updateBooking(data)); await fetchBookings({ silent: true }); setSuccessMessage("Booking marked as no-show"); }
    catch (error) { setActionError(error.response?.data?.message || "Could not mark no-show. Please try again."); }
  };
  const markLateCancelBooking = async (booking) => {
    if (!window.confirm("Mark this booking as late cancellation? This cannot be undone.")) return;
    setActionError(""); setSuccessMessage("");
    try { const { data } = await api.patch(`/bookings/${getBookingId(booking)}/late-cancel`); dispatch(updateBooking(data)); await fetchBookings({ silent: true }); setSuccessMessage("Booking marked as late cancellation"); }
    catch (error) { setActionError(error.response?.data?.message || "Could not mark late cancellation. Please try again."); }
  };
  const updateBookingStatus = async (booking, status) => {
    setActionError(""); setSuccessMessage("");
    try { const { data } = await api.put(`/bookings/${booking.id}`, { status }); dispatch(updateBooking(data)); await fetchBookings({ silent: true }); }
    catch (error) { setActionError(error.response?.data?.message || "Could not update booking. Please try again."); }
  };
  const openRejectBookingModal = (booking) => { setRejectingBooking(booking); setRejectionError(""); setActionError(""); setSuccessMessage(""); };
  const rejectBooking = async ({ rejectionReason }) => {
    if (!rejectingBooking || isRejectingBooking) return;
    setRejectionError(""); setIsRejectingBooking(true);
    try { const { data } = await api.put(`/bookings/${rejectingBooking.id}`, { status: "rejected", rejectionReason }); dispatch(updateBooking(data)); await fetchBookings({ silent: true }); setRejectingBooking(null); }
    catch (error) { setRejectionError(error.response?.data?.message || "Could not reject booking. Please try again."); }
    finally { setIsRejectingBooking(false); }
  };
  const respondToRescheduleRequest = async (booking, action) => {
    const bookingId = getBookingId(booking);
    if (!bookingId || rescheduleAction) return;
    setActionError(""); setSuccessMessage(""); setRescheduleAction({ bookingId: String(bookingId), action });
    try { const { data } = await api.patch(`/bookings/${bookingId}/reschedule-request/${action}`, {}); dispatch(updateBooking(data)); await fetchBookings({ silent: true }); setSuccessMessage(action === "accept" ? "Reschedule request accepted" : "Reschedule request rejected"); }
    catch (error) { setActionError(error?.response?.data?.message || error?.message || `Could not ${action} reschedule request. Please try again.`); }
    finally { setRescheduleAction(null); }
  };
  const openAddBookingModal = (prefill = {}) => { setManualBooking({ ...getInitialManualBooking(selectedDate), ...prefill }); setActionError(""); setSuccessMessage(""); setIsAddModalOpen(true); };
  const updateManualBooking = (field, value) => setManualBooking((current) => ({ ...current, [field]: value }));
  const createManualBooking = async (event) => {
    event.preventDefault();
    if (!currentUserId || isAddingBooking) return;
    const bookingDate = manualBooking.bookingDate; const parsedDate = parseDateKey(bookingDate); const clientName = manualBooking.clientName.trim(); const clientPhone = manualBooking.clientPhone.trim();
    setActionError(""); setSuccessMessage("");
    if (!clientName) return setActionError("Client name is required");
    if (!manualBooking.serviceId || !bookingDate || !manualBooking.time) return setActionError("Service, date, and time are required");
    if (!parsedDate) return setActionError("Date must be YYYY-MM-DD");
    setIsAddingBooking(true);
    try {
      const salonId = getPrimarySalonId(primarySalon) || undefined;
      const { data } = await api.post("/bookings", { barberId: currentUserId, serviceId: manualBooking.serviceId, bookingDate, dayKey: getDayKeyFromDate(parsedDate), time: manualBooking.time, clientName, clientPhone, phone: clientPhone, createdBy: "barber", salonId });
      dispatch(addBooking(data)); await fetchBookings({ silent: true }); setSelectedDate(bookingDate); setIsAddModalOpen(false); setManualBooking(getInitialManualBooking(bookingDate)); setSuccessMessage("Booking added successfully");
    } catch (error) { setActionError(error.response?.data?.message || "Could not add booking. Please try again."); }
    finally { setIsAddingBooking(false); }
  };

  return { currentUser, activeServices, highlightedBookingIds, isInitialLoading, isAddModalOpen, isAddingBooking, rejectingBooking, isRejectingBooking, rejectionError, rescheduleAction, actionError, successMessage, manualBooking, fetchBookings, isEligibleForNoShowLateCancel, markNoShowBooking, markLateCancelBooking, updateBookingStatus, openRejectBookingModal, rejectBooking, respondToRescheduleRequest, openAddBookingModal, updateManualBooking, createManualBooking, setIsAddModalOpen, setRejectingBooking };
}
