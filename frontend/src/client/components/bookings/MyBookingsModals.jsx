import CancelBookingModal from "@/client/components/CancelBookingModal";
import DelayBookingModal from "@/client/components/bookings/DelayBookingModal";
import RescheduleBooking from "@/client/components/RescheduleBooking";
import ReviewModal from "@/client/components/ReviewModal";
import BookingDetailsModal from "@/shared/components/BookingDetailsModal";

export default function MyBookingsModals({
  cancelError,
  cancellingBooking,
  closeBookingDetailsModal,
  createReview,
  createSalonReview,
  delayError,
  delayingBooking,
  getBarberForBooking,
  getSalonName,
  isCancelSubmitting,
  isDelaySubmitting,
  isReviewSubmitting,
  messageBarber,
  openCancelBookingModal,
  reschedulingBooking,
  reviewError,
  reviewingBooking,
  reviewingSalonBooking,
  selectedBookingForDetails,
  showBookingDetailsModal,
  onCloseCancel,
  onCloseDelay,
  onCloseReschedule,
  onCloseReview,
  onCloseSalonReview,
  onSubmitCancel,
  onSubmitDelay,
}) {
  return (
    <>
      {showBookingDetailsModal && (
        <BookingDetailsModal
          booking={selectedBookingForDetails}
          barber={getBarberForBooking(selectedBookingForDetails)}
          onCancel={openCancelBookingModal}
          onClose={closeBookingDetailsModal}
          onMessage={messageBarber}
        />
      )}

      {cancellingBooking && (
        <CancelBookingModal
          booking={cancellingBooking}
          error={cancelError}
          isSubmitting={isCancelSubmitting}
          onClose={onCloseCancel}
          onSubmit={onSubmitCancel}
        />
      )}

      {delayingBooking && (
        <DelayBookingModal
          booking={delayingBooking}
          error={delayError}
          isSubmitting={isDelaySubmitting}
          onClose={onCloseDelay}
          onSubmit={onSubmitDelay}
        />
      )}

      {reschedulingBooking && (
        <RescheduleBooking
          booking={reschedulingBooking}
          onClose={onCloseReschedule}
        />
      )}

      {reviewingBooking && (
        <ReviewModal
          booking={reviewingBooking}
          error={reviewError}
          isSubmitting={isReviewSubmitting}
          onClose={onCloseReview}
          onSubmit={createReview}
        />
      )}

      {reviewingSalonBooking && (
        <ReviewModal
          booking={reviewingSalonBooking}
          commentRequired
          commentPlaceholder="Tell us about your experience at this salon..."
          error={reviewError}
          isSubmitting={isReviewSubmitting}
          maxCommentLength={500}
          onClose={onCloseSalonReview}
          onSubmit={createSalonReview}
          subtitle={getSalonName(reviewingSalonBooking) || "Completed booking"}
          title={`Review ${getSalonName(reviewingSalonBooking) || "Salon"}`}
        />
      )}
    </>
  );
}
