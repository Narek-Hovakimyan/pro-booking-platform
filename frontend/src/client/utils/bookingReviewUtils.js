import {
  getBookingId,
  getBookingSalonId,
} from "@/client/utils/bookingStatusUtils";

export const hasBookingReview = (reviews = [], bookingId) =>
  reviews.some((review) => String(review.bookingId) === String(bookingId));

export const isBookingReviewed = (booking, reviews = []) =>
  Boolean(booking?.reviewed || hasBookingReview(reviews, getBookingId(booking)));

export const getSalonIdForBooking = (booking) =>
  String(getBookingSalonId(booking));

export const hasSalonReviewForBooking = (salonReviews = [], booking) => {
  const salonId = getSalonIdForBooking(booking);

  return salonReviews.some(
    (review) =>
      String(review?.bookingId) === String(booking?.id) &&
      (!salonId || String(review?.salonId) === String(salonId))
  );
};

export const canReviewSalonBooking = (booking) =>
  booking?.status === "completed" && Boolean(getSalonIdForBooking(booking));

