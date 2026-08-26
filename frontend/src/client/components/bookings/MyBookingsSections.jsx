import { CalendarX, HeartCrack } from "lucide-react";

import BookingSection from "@/client/components/bookings/BookingSection";
import { BookingCardSkeleton } from "@/shared/components/LoadingSkeletons";

export default function MyBookingsSections({
  activeBookings,
  groupedActiveBookings,
  groupedHistoryBookings,
  historyBookings,
  historyFilters,
  historyPagination,
  historyEmptyText = "No booking history yet",
  initialLoading,
  renderBookingCard,
  view = "active",
}) {
  if (initialLoading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <BookingCardSkeleton key={item} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {view !== "history" && (
        <BookingSection
          title="Active bookings"
          emptyText="No active bookings"
          bookings={activeBookings}
          groups={groupedActiveBookings}
          section="active"
          renderBooking={renderBookingCard}
          emptyIcon={CalendarX}
          emptyCta={{ label: "Browse specialists", to: "/specialists" }}
        />
      )}
      {view === "history" && (
        <>
          {historyFilters}
          <BookingSection
            title="History"
            emptyText={historyEmptyText}
            bookings={historyBookings}
            groups={groupedHistoryBookings}
            section="history"
            renderBooking={renderBookingCard}
            emptyIcon={HeartCrack}
            emptyCta={{ label: "Browse specialists", to: "/specialists" }}
          />
          {historyPagination}
        </>
      )}
    </div>
  );
}
