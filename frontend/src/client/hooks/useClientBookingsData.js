import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import api from "@/shared/api/axios";
import { getSocket } from "@/shared/lib/socket";
import {
  fetchClientBookings,
} from "@/store/slices/bookingsSlice";
import { setReviews } from "@/store/slices/reviewsSlice";
import { setBarbers } from "@/store/slices/usersSlice";
import {
  activeBookingSections,
  getBookingBarberId,
  getBookingDateTime,
  getBookingId,
  getBookingSalonId,
  getEntityId,
  historyBookingSections,
  isActiveBooking,
  isHistoryBooking,
  sortBookingsAscending,
  sortBookingsDescending,
  upcomingStatuses,
} from "@/client/utils/bookingStatusUtils";

export default function useClientBookingsData() {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?.id;
  const bookings = useSelector((state) => state.bookings);
  const reviews = useSelector((state) => state.reviews);
  const users = useSelector((state) => state.users);
  const [salonReviews, setSalonReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const mountedRef = useRef(false);
  const loadRef = useRef(0);

  const myBookings = useMemo(
    () => bookings.filter((booking) => String(booking.clientId) === String(currentUserId)),
    [bookings, currentUserId]
  );
  const activeBookings = useMemo(
    () => myBookings.filter((booking) => isActiveBooking(booking)).sort(sortBookingsAscending),
    [myBookings]
  );
  const historyBookings = useMemo(
    () => myBookings.filter((booking) => isHistoryBooking(booking)).sort(sortBookingsDescending),
    [myBookings]
  );
  const groupedHistoryBookings = useMemo(
    () => historyBookingSections.map((section) => ({
      ...section,
      bookings: historyBookings
        .filter((booking) => new Set(section.statuses).has(booking?.status))
        .sort(sortBookingsDescending),
    })),
    [historyBookings]
  );
  const nextBooking = useMemo(() => {
    const now = new Date();
    return [...myBookings]
      .filter((booking) => upcomingStatuses.has(booking?.status))
      .filter((booking) => {
        const bookingDateTime = getBookingDateTime(booking);
        return bookingDateTime ? bookingDateTime >= now : false;
      })
      .sort(sortBookingsAscending)[0] || null;
  }, [myBookings]);
  const visibleActiveBookings = useMemo(() => {
    const nextId = getBookingId(nextBooking);
    if (!nextId) return activeBookings;
    return activeBookings.filter((booking) => String(getBookingId(booking)) !== String(nextId));
  }, [activeBookings, nextBooking]);
  const groupedActiveBookings = useMemo(
    () => activeBookingSections.map((section) => ({
      ...section,
      bookings: visibleActiveBookings
        .filter((booking) => new Set(section.statuses).has(booking?.status))
        .sort(sortBookingsAscending),
    })),
    [visibleActiveBookings]
  );

  const refreshBookings = useCallback(async ({ showLoading = false, silent = false, throwOnError = false, enrich = true } = {}) => {
    if (!currentUserId) return [];
    const loadId = ++loadRef.current;
    if (showLoading) setIsLoading(true);
    if (!silent) setError("");
    if (enrich) setSalonReviews([]);
    try {
      const data = await dispatch(fetchClientBookings(currentUserId));
      if (!mountedRef.current || loadId !== loadRef.current) return data;
      if (!enrich) return data;
      const barberIds = Array.from(new Set(data.map(getBookingBarberId).filter(Boolean)));
      const reviewResponses = await Promise.all(barberIds.map((id) => api.get(`/reviews/${id}`)));
      if (!mountedRef.current || loadId !== loadRef.current) return data;
      reviewResponses.forEach((response, index) => {
        dispatch(setReviews({ barberId: barberIds[index], reviews: response.data }));
      });
      const salonIds = Array.from(new Set(data.map(getBookingSalonId).filter(Boolean)));
      const [barbersResult, salonReviewsResult] = await Promise.allSettled([
        api.get("/users/barbers"),
        Promise.all(salonIds.map((salonId) => api.get(`/salon-reviews/salon/${salonId}`))),
      ]);
      if (!mountedRef.current || loadId !== loadRef.current) return data;
      if (barbersResult.status === "fulfilled") dispatch(setBarbers(barbersResult.value.data));
      setSalonReviews(
        salonReviewsResult.status === "fulfilled"
          ? salonReviewsResult.value.flatMap((response) => response.data?.reviews || response.data || [])
          : []
      );
      return data;
    } catch (requestError) {
      if (mountedRef.current && !silent && loadId === loadRef.current) {
        setError(requestError.response?.data?.message || "Could not load bookings. Please try again.");
      }
      if (throwOnError) throw requestError;
      return [];
    } finally {
      if (mountedRef.current && loadId === loadRef.current) setIsLoading(false);
    }
  }, [currentUserId, dispatch]);

  useEffect(() => {
    mountedRef.current = true;
    const loadId = setTimeout(() => { refreshBookings({ showLoading: true }); }, 0);
    return () => { mountedRef.current = false; clearTimeout(loadId); };
  }, [refreshBookings]);

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    const socket = getSocket();
    if (!socket) return undefined;
    const handleBookingUpdated = (data) => {
      const clientId = data.booking.clientId || data.booking.client?._id;
      if (String(clientId) === String(currentUser.id)) refreshBookings({ silent: true });
    };
    socket.on("bookingUpdated", handleBookingUpdated);
    return () => socket.off("bookingUpdated", handleBookingUpdated);
  }, [currentUser?.id, refreshBookings]);

  const getBarberForBooking = useCallback((booking) => {
    const barberId = getBookingBarberId(booking);
    if (booking?.barber && typeof booking.barber === "object") return booking.barber;
    return users.find((user) => String(user.id || user._id) === String(barberId));
  }, [users]);
  const getSalonForBooking = useCallback((booking) => {
    if (booking?.salon && typeof booking.salon === "object") return booking.salon;
    const salonId = getBookingSalonId(booking);
    const barber = getBarberForBooking(booking);
    const salons = [...(barber?.approvedSalons || []), ...(barber?.salons || []), barber?.primarySalon,
      barber?.salonStatus === "approved" ? barber?.salon : null].filter(Boolean);
    if (salonId) return salons.find((salon) => String(getEntityId(salon) || getEntityId(salon?.salon)) === String(salonId)) || { _id: salonId };
    return barber?.salonStatus === "approved" ? barber.salon : null;
  }, [getBarberForBooking]);
  const addSalonReview = useCallback((review) => {
    setSalonReviews((current) => current.some((item) => String(item?.bookingId) === String(review?.bookingId) && String(item?.salonId) === String(review?.salonId)) ? current : [review, ...current]);
  }, []);

  return {
    currentUser, bookings, reviews, users, salonReviews, isLoading, error, setError,
    myBookings, activeBookings, historyBookings, groupedActiveBookings, groupedHistoryBookings,
    nextBooking, visibleActiveBookings, refreshBookings, addSalonReview,
    getBarberForBooking, getSalonForBooking,
  };
}
