import EmptyState from "@/shared/components/common/EmptyState";
import { BookingCardSkeleton } from "@/shared/components/LoadingSkeletons";
import BookingListItem from "@/barber/components/bookings/BookingListItem";

export default function BookingSections({
  isLoading,
  isInitialLoading,
  filteredBookings,
  groupedBookings,
  highlightedBookingIds,
  getBookingId,
  getBookingStatus,
  getClientName,
  getServiceName,
  getBookingTime,
  isEligibleForNoShowLateCancel,
  onUpdateBookingStatus,
  onOpenRejectBookingModal,
  onMarkNoShowBooking,
  onMarkLateCancelBooking,
  onAcceptRescheduleRequest,
  onRejectRescheduleRequest,
  rescheduleAction,
}) {
  if ((isLoading || isInitialLoading) && filteredBookings.length === 0) {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <BookingCardSkeleton key={item} />
        ))}
      </div>
    );
  }

  if (filteredBookings.length === 0) {
    return (
      <EmptyState
        description="Bookings for the selected date will appear here."
        title="No bookings yet"
      />
    );
  }

  return (
    <div className="space-y-5">
      {groupedBookings.map((section) => {
        if (!section.shouldAlwaysShow && section.bookings.length === 0) {
          return null;
        }

        return (
          <section className="space-y-3" key={section.key}>
            <h3 className="text-base font-bold text-neutral-950">
              {section.title} ({section.bookings.length})
            </h3>

            {section.bookings.length === 0 ? (
              <EmptyState description={section.emptyText} />
            ) : (
              <div className="space-y-3">
                {section.bookings.map((booking) => {
                  const bookingId = String(getBookingId(booking));
                  const status = getBookingStatus(booking);
                  const isHighlighted = highlightedBookingIds.has(bookingId);

                  return (
                    <BookingListItem
                      booking={booking}
                      bookingId={bookingId}
                      getBookingTime={getBookingTime}
                      getClientName={getClientName}
                      getServiceName={getServiceName}
                      isEligibleForNoShowLateCancel={isEligibleForNoShowLateCancel}
                      isHighlighted={isHighlighted}
                      key={bookingId}
                      status={status}
                      onMarkLateCancelBooking={onMarkLateCancelBooking}
                      onMarkNoShowBooking={onMarkNoShowBooking}
                      onOpenRejectBookingModal={onOpenRejectBookingModal}
                      onAcceptRescheduleRequest={onAcceptRescheduleRequest}
                      onRejectRescheduleRequest={onRejectRescheduleRequest}
                      rescheduleAction={rescheduleAction}
                      onUpdateBookingStatus={onUpdateBookingStatus}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
