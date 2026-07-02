import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import BookingCard from "@/client/components/BookingCard";
import MyBookingsHeader from "@/client/components/bookings/MyBookingsHeader";
import MyBookingsModals from "@/client/components/bookings/MyBookingsModals";
import MyBookingsSections from "@/client/components/bookings/MyBookingsSections";
import NextBookingSection from "@/client/components/bookings/NextBookingSection";
import LoyaltyBanner from "@/client/components/LoyaltyBanner";
import { Card, CardContent } from "@/shared/components/ui/card";
import api from "@/shared/api/axios";
import { getSocket } from "@/shared/lib/socket";
import { Container } from "@/shared/components/ui/Container";
import {
  fetchBarberBookings,
  fetchClientBookings,
  cancelBooking,
  updateBooking,
} from "@/store/slices/bookingsSlice";
import { addNotification } from "@/store/slices/notificationsSlice";
import { addReview, setReviews } from "@/store/slices/reviewsSlice";
import { setBarbers } from "@/store/slices/usersSlice";
import {
  activeBookingSections,
  canBookAgain,
  canDelayBooking,
  canCancelBooking,
  getBookingBarberId,
  getBookingDate,
  getBookingDateTime,
  getBookingId,
  getBookingSalonId,
  getBookingTime,
  getEntityId,
  getUpcomingStatusClass,
  getUpcomingStatusLabel,
  historyBookingSections,
  isActiveBooking,
  isHistoryBooking,
  sortBookingsAscending,
  sortBookingsDescending,
  upcomingStatuses,
} from "@/client/utils/bookingStatusUtils";


import {
  canReviewSalonBooking,
  getSalonIdForBooking,
  hasSalonReviewForBooking,
  isBookingReviewed,
} from "@/client/utils/bookingReviewUtils";

export default function MyBookingsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [selectedBookingForDetails, setSelectedBookingForDetails] = useState(null);
  const [showBookingDetailsModal, setShowBookingDetailsModal] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState(null);
  const [delayingBooking, setDelayingBooking] = useState(null);
  const [reschedulingBooking, setReschedulingBooking] = useState(null);
  const [reviewingBooking, setReviewingBooking] = useState(null);
  const [reviewingSalonBooking, setReviewingSalonBooking] = useState(null);
  const [salonReviews, setSalonReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelSubmitting, setIsCancelSubmitting] = useState(false);
  const [isDelaySubmitting, setIsDelaySubmitting] = useState(false);
  const [isReviewSubmitting, setIsReviewSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [delayError, setDelayError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const { currentUser } = useSelector((state) => state.auth);
  const bookings = useSelector((state) => state.bookings);
  const reviews = useSelector((state) => state.reviews);
  const users = useSelector((state) => state.users);
  const myBookings = useMemo(
    () =>
      bookings.filter(
        (booking) => String(booking.clientId) === String(currentUser?.id)
      ),
    [bookings, currentUser?.id]
  );
  const activeBookings = useMemo(
    () =>
      myBookings
        .filter((booking) => isActiveBooking(booking))
        .sort(sortBookingsAscending),
    [myBookings]
  );
  const historyBookings = useMemo(
    () =>
      myBookings
        .filter((booking) => isHistoryBooking(booking))
        .sort(sortBookingsDescending),
    [myBookings]
  );

  const groupedActiveBookings = useMemo(
    () =>
      activeBookingSections.map((section) => {
        const sectionStatuses = new Set(section.statuses);
        const sectionBookings = activeBookings
          .filter((booking) => sectionStatuses.has(booking?.status))
          .sort(sortBookingsAscending);

        return {
          ...section,
          bookings: sectionBookings,
        };
      }),
    [activeBookings]
  );
  const groupedHistoryBookings = useMemo(
    () =>
      historyBookingSections.map((section) => {
        const sectionStatuses = new Set(section.statuses);
        const sectionBookings = historyBookings
          .filter((booking) => sectionStatuses.has(booking?.status))
          .sort(sortBookingsDescending);

        return {
          ...section,
          bookings: sectionBookings,
        };
      }),
    [historyBookings]
  );
  const nextBooking = useMemo(
    () => {
      const now = new Date();

      return (
        [...myBookings]
          .filter((booking) => upcomingStatuses.has(booking?.status))
          .filter((booking) => {
            const bookingDateTime = getBookingDateTime(booking);
            return bookingDateTime ? bookingDateTime >= now : false;
          })
          .sort(sortBookingsAscending)[0] || null
      );
    },
    [myBookings]
  );
  const nextBookingBarberId = nextBooking ? getBookingBarberId(nextBooking) : "";
  const initialLoading = isLoading && myBookings.length === 0;

  useEffect(() => {
    if (!currentUser?.id) return;

    let isMounted = true;

    async function loadBookings({ showLoading = false, silent = false } = {}) {
      if (showLoading) {
        setIsLoading(true);
      }
      if (!silent) {
        setError("");
      }

      try {
        const data = await dispatch(fetchClientBookings(currentUser.id));

        const barberIds = Array.from(
          new Set(data.map((booking) => getBookingBarberId(booking)).filter(Boolean))
        );
        const reviewsResponses = await Promise.all(
          barberIds.map((barberId) => api.get(`/reviews/${barberId}`))
        );

        if (isMounted) {
          reviewsResponses.forEach((response, index) => {
            dispatch(
              setReviews({
                barberId: barberIds[index],
                reviews: response.data,
              })
            );
          });
        }

        try {
          const { data: barbersData } = await api.get("/users/barbers");

          if (isMounted) {
            dispatch(setBarbers(barbersData));
          }

          const salonIds = Array.from(
            new Set(data.map(getBookingSalonId).filter(Boolean))
          );
          const salonReviewResponses = await Promise.all(
            salonIds.map((salonId) => api.get(`/salon-reviews/salon/${salonId}`))
          );

          if (isMounted) {
            setSalonReviews(
              salonReviewResponses.flatMap((response) =>
                response.data?.reviews || response.data || []
              )
            );
          }
        } catch {
          // Barber names have safe fallbacks if the directory cannot be loaded.
        }
      } catch (requestError) {
        if (isMounted && !silent) {
          setError(
            requestError.response?.data?.message ||
              "Could not load bookings. Please try again."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadBookings({ showLoading: true });

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, dispatch]);

  // Socket listener for real-time booking updates
  useEffect(() => {
    if (!currentUser?.id) return;

    const socket = getSocket();
    if (!socket) return;

    const handleBookingUpdated = (data) => {
      const bookingClientId = data.booking.clientId || data.booking.client?._id;
      if (String(bookingClientId) === String(currentUser.id)) {
        dispatch(fetchClientBookings(currentUser.id));
      }
    };

    socket.on("bookingUpdated", handleBookingUpdated);

    return () => {
      socket.off("bookingUpdated", handleBookingUpdated);
    };
  }, [currentUser?.id, dispatch]);

  const getBarberForBooking = (booking) => {
    const bookingBarber = booking?.barber;
    const barberId = getBookingBarberId(booking);

    if (bookingBarber && typeof bookingBarber === "object") {
      return bookingBarber;
    }

    return users.find((user) => String(user.id || user._id) === String(barberId));
  };

  const getBarberName = (booking) => {
    const barber = getBarberForBooking(booking);

    return barber?.name || "Specialist";
  };

  const getServiceName = (booking) => {
    const service = booking?.service;

    return (
      (service && typeof service === "object" ? service.name : "") ||
      booking?.serviceName ||
      "Service"
    );
  };

  const getServicePrice = (booking) => {
    return booking?.finalPrice ?? booking?.price;
  };

  const getServiceDuration = (booking) => {
    const service = booking?.service;

    return service && typeof service === "object" && service.duration !== undefined
      ? service.duration
      : booking?.duration;
  };

  const formatPrice = (price) => {
    if (price === undefined || price === null || price === "") return "";

    return `${Number(price || 0).toLocaleString()} դրամ`;
  };

  const getSalonName = (booking) => {
    const salon = getSalonForBooking(booking);

    return salon?.name || "";
  };

  const getSalonForBooking = (booking) => {
    const bookingSalon = booking?.salon;
    const bookingSalonId = getBookingSalonId(booking);

    if (bookingSalon && typeof bookingSalon === "object") {
      return bookingSalon;
    }

    const barber = getBarberForBooking(booking);
    const barberSalons = [
      ...(barber?.approvedSalons || []),
      ...(barber?.salons || []),
      barber?.primarySalon,
      barber?.salonStatus === "approved" ? barber?.salon : null,
    ].filter(Boolean);

    if (bookingSalonId) {
      const matchingSalon = barberSalons.find(
        (salon) =>
          String(getEntityId(salon) || getEntityId(salon?.salon)) ===
          String(bookingSalonId)
      );

      return matchingSalon || { _id: bookingSalonId };
    }

    return barber?.salonStatus === "approved" ? barber?.salon : null;
  };

  const openBookingDetailsModal = (booking) => {
    setSelectedBookingForDetails(booking);
    setShowBookingDetailsModal(true);
  };

  const closeBookingDetailsModal = () => {
    setSelectedBookingForDetails(null);
    setShowBookingDetailsModal(false);
  };

  const messageBarber = (barberId) => {
    if (!barberId) return;

    navigate(`/messages/${barberId}`);
  };

  const openBarberProfile = (booking) => {
    const barber = getBarberForBooking(booking);
    const barberId = getBookingBarberId(booking) || getEntityId(barber);

    if (!barberId) return;

    navigate(`/specialists/${barberId}/profile`, {
      state: {
        barber: barber && typeof barber === "object" ? barber : null,
      },
    });
  };

  const renderBarberName = (booking) => {
    const barber = getBarberForBooking(booking);
    const barberId = getBookingBarberId(booking) || getEntityId(barber);
    const barberName = barber?.name || "Specialist";

    if (!barberId) return barberName;

    return (
      <button
        className="cursor-pointer font-semibold text-neutral-900 hover:underline"
        onClick={() => openBarberProfile(booking)}
        type="button"
      >
        {barberName}
      </button>
    );
  };

  const isReviewed = (booking) =>
    isBookingReviewed(booking, reviews);

  const canReviewSalon = (booking) =>
    canReviewSalonBooking(booking);

  const canChangeBooking = (booking) =>
    canCancelBooking(booking);

  const canDelayClientBooking = (booking) =>
    canDelayBooking(booking);

  const isBookAgainEligible = (booking) =>
    canBookAgain(booking);

  const startBookAgain = (booking) => {
    const barber = booking.barber || null;
    const service = booking.service || null;
    const barberId =
      getBookingBarberId(booking) || getEntityId(barber) || getEntityId(booking.barber);
    const serviceId =
      booking.serviceId || getEntityId(service) || getEntityId(booking.service);
    const salon = getSalonForBooking(booking);
    const salonId = getBookingSalonId(booking);

    if (!barberId || !serviceId) {
      setError("Cannot re-book because barber/service data is missing");
      return;
    }

    setError("");
    navigate(`/booking/${barberId}`, {
      state: {
        rebook: true,
        barber: typeof barber === "object" ? barber : null,
        barberId,
        service: typeof service === "object" ? service : null,
        serviceId,
        selectedSalonId: salonId || undefined,
        salon: typeof salon === "object" ? salon : null,
      },
    });
  };


  const openCancelBookingModal = (booking) => {
    setCancellingBooking(booking);
    setCancelError("");
    setError("");
    setShowBookingDetailsModal(false);
  };

  const openDelayBookingModal = (booking) => {
    setDelayingBooking(booking);
    setDelayError("");
    setError("");
    setShowBookingDetailsModal(false);
  };

  const cancelClientBooking = async ({ cancelReason }) => {
    if (!cancellingBooking || isCancelSubmitting) return;

    setCancelError("");
    setIsCancelSubmitting(true);

    try {
      const { data } = await api.put(`/bookings/${cancellingBooking.id}`, {
        status: "cancelled",
        cancelReason,
      });
      const cancellingBarberId = getBookingBarberId(cancellingBooking);

      dispatch(cancelBooking(data));
      await Promise.all([
        dispatch(fetchClientBookings(currentUser.id)),
        cancellingBarberId
          ? dispatch(fetchBarberBookings(cancellingBarberId))
          : Promise.resolve(),
      ]);
      setCancellingBooking(null);
    } catch (requestError) {
      setCancelError(
        requestError.response?.data?.message ||
          "Could not cancel booking. Please try again."
      );
    } finally {
      setIsCancelSubmitting(false);
    }
  };

  const delayClientBooking = async ({ delayMinutes }) => {
    if (!delayingBooking || isDelaySubmitting) return;

    setDelayError("");
    setIsDelaySubmitting(true);

    try {
      const { data } = await api.patch(`/bookings/${getBookingId(delayingBooking)}/delay`, {
        delayMinutes,
      });
      const delayingBarberId = getBookingBarberId(delayingBooking);

      dispatch(updateBooking(data));
      await Promise.all([
        dispatch(fetchClientBookings(currentUser.id)),
        delayingBarberId
          ? dispatch(fetchBarberBookings(delayingBarberId))
          : Promise.resolve(),
      ]);
      dispatch(
        addNotification({
          message: `Booking delayed to ${data.time}`,
          type: "success",
        })
      );
      setDelayingBooking(null);
    } catch (requestError) {
      setDelayError(
        requestError.response?.data?.message ||
          "Could not delay booking. Please try again."
      );
    } finally {
      setIsDelaySubmitting(false);
    }
  };

  const createReview = async (reviewData) => {
    if (!reviewingBooking) return;

    setReviewError("");
    setIsReviewSubmitting(true);

    try {
      const { data } = await api.post("/reviews", {
        barberId: reviewingBooking.barberId,
        bookingId: reviewingBooking.id,
        ...reviewData,
      });

      dispatch(addReview(data));
      dispatch(updateBooking({ ...reviewingBooking, reviewed: true }));
      dispatch(
        addNotification({
          message: "Review submitted successfully",
          type: "success",
        })
      );
      setReviewingBooking(null);
    } catch (requestError) {
      setReviewError(
        requestError.response?.data?.message ||
          "Could not save review. Please try again."
      );
    } finally {
      setIsReviewSubmitting(false);
    }
  };

  const createSalonReview = async (reviewData) => {
    if (!reviewingSalonBooking) return;

    const salon = getSalonForBooking(reviewingSalonBooking);
    const salonId = getSalonIdForBooking(reviewingSalonBooking);

    if (!salonId) {
      setReviewError("This booking is not connected to an approved salon.");
      return;
    }

    setReviewError("");
    setIsReviewSubmitting(true);

    try {
      const { data } = await api.post("/salon-reviews", {
        salonId,
        bookingId: reviewingSalonBooking.id,
        ...reviewData,
      });

      setSalonReviews((currentReviews) => {
        const alreadyReviewed = currentReviews.some(
          (review) =>
            String(review?.bookingId) === String(data?.bookingId) &&
            String(review?.salonId) === String(data?.salonId)
        );

        return alreadyReviewed ? currentReviews : [data, ...currentReviews];
      });
      dispatch(
        addNotification({
          message: `Thank you for reviewing ${salon?.name || "Salon"}`,
          type: "success",
        })
      );
      setReviewingSalonBooking(null);
    } catch (requestError) {
      setReviewError(
        requestError.response?.data?.message ||
          "Could not save salon review. Please try again."
      );
    } finally {
      setIsReviewSubmitting(false);
    }
  };

  const renderBookingCard = (booking, section) => {
    const bookingId = getBookingId(booking);
    const barberId = getBookingBarberId(booking);
    const serviceName = getServiceName(booking);

    return (
      <BookingCard
        barberId={barberId}
        barberName={renderBarberName(booking)}
        booking={booking}
        bookingDate={getBookingDate(booking)}
        bookingId={bookingId}
        bookingTime={getBookingTime(booking)}
        canCancel={canChangeBooking(booking)}
        canDelay={canDelayClientBooking(booking)}
        canReviewSalon={canReviewSalon(booking)}
        duration={getServiceDuration(booking)}
        isActive={section === "active"}
        isBookAgainEligible={isBookAgainEligible(booking)}
        isBarberReviewed={isReviewed(booking)}
        isSalonReviewed={hasSalonReviewForBooking(salonReviews, booking)}
        key={bookingId}
        onBookAgain={startBookAgain}

        onCancel={openCancelBookingModal}
        onDetails={openBookingDetailsModal}
        onDelay={openDelayBookingModal}
        onMessage={messageBarber}
        onReschedule={setReschedulingBooking}
        onReviewBarber={(nextBooking) => {
          setReviewError("");
          setReviewingBooking(nextBooking);
        }}
        onReviewSalon={(nextBooking) => {
          setReviewError("");
          setReviewingSalonBooking(nextBooking);
        }}
        price={formatPrice(getServicePrice(booking))}
        salonName={getSalonName(booking)}
        serviceName={serviceName}
      />
    );
  };

  return (
    <Container size="wide">
      <div className="space-y-6 sm:space-y-8">
      <MyBookingsHeader error={error} />
      <LoyaltyBanner />

      <Card className="rounded-2xl sm:rounded-3xl">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <NextBookingSection
            barberId={nextBookingBarberId}
            barberName={getBarberName(nextBooking)}
            bookingDate={getBookingDate(nextBooking)}
            bookingTime={getBookingTime(nextBooking)}
            canCancel={canChangeBooking(nextBooking)}
            canDelay={canDelayClientBooking(nextBooking)}
            nextBooking={nextBooking}
            salonName={getSalonName(nextBooking)}
            serviceName={getServiceName(nextBooking)}
            statusClass={getUpcomingStatusClass(nextBooking?.status)}
            statusLabel={getUpcomingStatusLabel(nextBooking?.status)}
            onCancel={() => openCancelBookingModal(nextBooking)}
            onDelay={() => openDelayBookingModal(nextBooking)}
            onFindBarber={() => navigate("/specialists")}
            onMessage={messageBarber}
            onViewDetails={() => openBookingDetailsModal(nextBooking)}
          />
        </CardContent>
      </Card>

      <MyBookingsSections
        activeBookings={activeBookings}
        groupedActiveBookings={groupedActiveBookings}
        groupedHistoryBookings={groupedHistoryBookings}
        historyBookings={historyBookings}
        initialLoading={initialLoading}
        renderBookingCard={renderBookingCard}
      />

      <MyBookingsModals
        cancelError={cancelError}
        cancellingBooking={cancellingBooking}
        closeBookingDetailsModal={closeBookingDetailsModal}
        createReview={createReview}
        createSalonReview={createSalonReview}
        delayError={delayError}
        delayingBooking={delayingBooking}
        getBarberForBooking={getBarberForBooking}
        getSalonName={getSalonName}
        isCancelSubmitting={isCancelSubmitting}
        isDelaySubmitting={isDelaySubmitting}
        isReviewSubmitting={isReviewSubmitting}
        messageBarber={messageBarber}
        openCancelBookingModal={openCancelBookingModal}
        reschedulingBooking={reschedulingBooking}
        reviewError={reviewError}
        reviewingBooking={reviewingBooking}
        reviewingSalonBooking={reviewingSalonBooking}
        selectedBookingForDetails={selectedBookingForDetails}
        showBookingDetailsModal={showBookingDetailsModal}
        onCloseCancel={() => setCancellingBooking(null)}
        onCloseDelay={() => setDelayingBooking(null)}
        onCloseReschedule={() => setReschedulingBooking(null)}
        onCloseReview={() => setReviewingBooking(null)}
        onCloseSalonReview={() => setReviewingSalonBooking(null)}
        onSubmitCancel={cancelClientBooking}
        onSubmitDelay={delayClientBooking}
      />
      </div>
    </Container>
  );
}
