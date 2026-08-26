import { useState } from "react";
import { useDispatch } from "react-redux";

import api from "@/shared/api/axios";
import {
  fetchBarberBookings,
  cancelBooking,
  updateBooking,
} from "@/store/slices/bookingsSlice";
import { addNotification } from "@/store/slices/notificationsSlice";
import { addReview } from "@/store/slices/reviewsSlice";
import { canBookAgain, canCancelBooking, canDelayBooking, getBookingBarberId, getBookingId, getBookingSalonId, getEntityId } from "@/client/utils/bookingStatusUtils";
import { getSalonIdForBooking } from "@/client/utils/bookingReviewUtils";

export default function useClientBookingActions({
  navigate,
  refreshBookings,
  setError,
  getBarberForBooking,
  getSalonForBooking,
  addSalonReview,
}) {
  const dispatch = useDispatch();
  const [selectedBookingForDetails, setSelectedBookingForDetails] = useState(null);
  const [showBookingDetailsModal, setShowBookingDetailsModal] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState(null);
  const [delayingBooking, setDelayingBooking] = useState(null);
  const [reschedulingBooking, setReschedulingBooking] = useState(null);
  const [reviewingBooking, setReviewingBooking] = useState(null);
  const [reviewingSalonBooking, setReviewingSalonBooking] = useState(null);
  const [isCancelSubmitting, setIsCancelSubmitting] = useState(false);
  const [isDelaySubmitting, setIsDelaySubmitting] = useState(false);
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [delayError, setDelayError] = useState("");
  const [reviewError, setReviewError] = useState("");

  const openBookingDetailsModal = (booking) => {
    setSelectedBookingForDetails(booking);
    setShowBookingDetailsModal(true);
  };
  const closeBookingDetailsModal = () => {
    setSelectedBookingForDetails(null);
    setShowBookingDetailsModal(false);
  };
  const messageBarber = (barberId) => {
    if (barberId) navigate(`/messages/${barberId}`);
  };
  const openBarberProfile = (booking) => {
    const barber = getBarberForBooking(booking);
    const barberId = getBookingBarberId(booking) || getEntityId(barber);
    if (!barberId) return;
    navigate(`/specialists/${barberId}/profile`, { state: { barber: barber && typeof barber === "object" ? barber : null } });
  };
  const startBookAgain = (booking) => {
    const barber = booking.barber || null;
    const service = booking.service || null;
    const barberId = getBookingBarberId(booking) || getEntityId(barber);
    const serviceId = booking.serviceId || getEntityId(service);
    const salon = getSalonForBooking(booking);
    const salonId = getBookingSalonId(booking);
    if (!barberId || !serviceId) {
      setError("Cannot re-book because barber/service data is missing");
      return;
    }
    setError("");
    navigate(salonId ? `/booking/${barberId}?salonId=${encodeURIComponent(salonId)}` : `/booking/${barberId}`, {
      state: { rebook: true, barber: typeof barber === "object" ? barber : null, barberId, service: typeof service === "object" ? service : null, serviceId, selectedSalonId: salonId || undefined, salon: typeof salon === "object" ? salon : null },
    });
  };
  const openCancelBookingModal = (booking) => { setCancellingBooking(booking); setCancelError(""); setError(""); setShowBookingDetailsModal(false); };
  const openDelayBookingModal = (booking) => { setDelayingBooking(booking); setDelayError(""); setError(""); setShowBookingDetailsModal(false); };

  const cancelClientBooking = async ({ cancelReason }) => {
    if (!cancellingBooking || isCancelSubmitting) return;
    setCancelError(""); setIsCancelSubmitting(true);
    try {
      const { data } = await api.put(`/bookings/${getBookingId(cancellingBooking)}`, { status: "cancelled", cancelReason });
      const barberId = getBookingBarberId(cancellingBooking);
      dispatch(cancelBooking(data));
      await Promise.all([refreshBookings({ silent: true, throwOnError: true, enrich: false }), barberId ? dispatch(fetchBarberBookings(barberId)) : Promise.resolve()]);
      setCancellingBooking(null);
    } catch (requestError) {
      setCancelError(requestError.response?.data?.message || "Could not cancel booking. Please try again.");
    } finally { setIsCancelSubmitting(false); }
  };
  const delayClientBooking = async ({ delayMinutes }) => {
    if (!delayingBooking || isDelaySubmitting) return;
    setDelayError(""); setIsDelaySubmitting(true);
    try {
      const { data } = await api.patch(`/bookings/${getBookingId(delayingBooking)}/delay`, { delayMinutes });
      const barberId = getBookingBarberId(delayingBooking);
      dispatch(updateBooking(data));
      await Promise.all([refreshBookings({ silent: true, throwOnError: true, enrich: false }), barberId ? dispatch(fetchBarberBookings(barberId)) : Promise.resolve()]);
      dispatch(addNotification({ message: `Booking delayed to ${data.time}`, type: "success" }));
      setDelayingBooking(null);
    } catch (requestError) {
      setDelayError(requestError.response?.data?.message || "Could not delay booking. Please try again.");
    } finally { setIsDelaySubmitting(false); }
  };
  const createReview = async (reviewData) => {
    if (!reviewingBooking) return;
    setReviewError(""); setIsReviewSubmitting(true);
    try {
      const { data } = await api.post("/reviews", { barberId: reviewingBooking.barberId, bookingId: reviewingBooking.id, ...reviewData });
      dispatch(addReview(data)); dispatch(updateBooking({ ...reviewingBooking, reviewed: true }));
      dispatch(addNotification({ message: "Review submitted successfully", type: "success" })); setReviewingBooking(null);
    } catch (requestError) { setReviewError(requestError.response?.data?.message || "Could not save review. Please try again."); }
    finally { setIsReviewSubmitting(false); }
  };
  const createSalonReview = async (reviewData) => {
    if (!reviewingSalonBooking) return;
    const salon = getSalonForBooking(reviewingSalonBooking);
    const salonId = getSalonIdForBooking(reviewingSalonBooking);
    if (!salonId) { setReviewError("This booking is not connected to an approved salon."); return; }
    setReviewError(""); setIsReviewSubmitting(true);
    try {
      const { data } = await api.post("/salon-reviews", { salonId, bookingId: reviewingSalonBooking.id, ...reviewData });
      addSalonReview(data);
      dispatch(addNotification({ message: `Thank you for reviewing ${salon?.name || "Salon"}`, type: "success" })); setReviewingSalonBooking(null);
    } catch (requestError) { setReviewError(requestError.response?.data?.message || "Could not save salon review. Please try again."); }
    finally { setIsReviewSubmitting(false); }
  };

  return {
    selectedBookingForDetails, showBookingDetailsModal, cancellingBooking, delayingBooking,
    reschedulingBooking, setReschedulingBooking, reviewingBooking, reviewingSalonBooking,
    isCancelSubmitting, isDelaySubmitting, isReviewSubmitting, cancelError, delayError, reviewError,
    canChangeBooking: canCancelBooking, canDelayClientBooking: canDelayBooking,
    isBookAgainEligible: canBookAgain, openBookingDetailsModal, closeBookingDetailsModal,
    messageBarber, openBarberProfile, startBookAgain, openCancelBookingModal, openDelayBookingModal,
    cancelClientBooking, delayClientBooking, createReview, createSalonReview,
    setCancellingBooking, setDelayingBooking, setReviewingBooking, setReviewingSalonBooking,
    setReviewError: (value) => setReviewError(value),
  };
}
