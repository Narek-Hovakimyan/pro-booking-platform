import { ArrowRight, CalendarDays } from "lucide-react";

import StatusBadge from "@/shared/components/StatusBadge";
import { Button } from "@/shared/components/ui/button";

export default function AnalyticsNextBooking({
  nextBooking,
  getClientName,
  getServiceName,
  getBookingTime,
  getBookingPrice,
  onViewBookings,
}) {
  if (!nextBooking) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-center text-sm text-neutral-500 sm:p-5">
        <CalendarDays className="mx-auto mb-1 h-5 w-5 text-neutral-400" />
        No bookings scheduled for today
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
        <CalendarDays className="h-4 w-4" />
        Next Booking Today
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-neutral-950">
              {getClientName(nextBooking)}
            </span>
            <StatusBadge status={nextBooking.status} />
          </div>
          <p className="mt-0.5 text-sm text-neutral-600">
            {getServiceName(nextBooking)}
            {getBookingTime(nextBooking) ? ` at ${getBookingTime(nextBooking)}` : ""}
            {getBookingPrice(nextBooking) ? ` · ${getBookingPrice(nextBooking)} AMD` : ""}
          </p>
        </div>
        <Button
          className="shrink-0 text-xs sm:text-sm"
          onClick={onViewBookings}
          variant="outline"
        >
          View Details
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
