import { Calendar, CalendarDays, CheckCircle2 } from "lucide-react";

import EmptyState from "@/shared/components/common/EmptyState";
import StatusBadge from "@/shared/components/StatusBadge";

export default function AnalyticsActivityLists({
  recentCompleted,
  upcomingBookings,
  getBookingId,
  getClientName,
  getServiceName,
  getBookingTime,
  formatTimeAgo,
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-neutral-950">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Recent Completed
        </h3>
        {recentCompleted.length > 0 ? (
          <div className="space-y-2">
            {recentCompleted.map((booking) => (
              <div
                key={getBookingId(booking)}
                className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-white p-3 shadow-sm"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-900">
                    {getClientName(booking)} · {getServiceName(booking)}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {booking.bookingDate} {getBookingTime(booking) ? `at ${getBookingTime(booking)}` : ""}
                    {formatTimeAgo(booking.updatedAt || booking.createdAt)
                      ? ` · ${formatTimeAgo(booking.updatedAt || booking.createdAt)}`
                      : ""}
                  </p>
                </div>
                <StatusBadge status="completed" />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState description="No completed bookings this month." />
        )}
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-neutral-950">
          <CalendarDays className="h-4 w-4 text-blue-500" />
          Upcoming Bookings
        </h3>
        {upcomingBookings.length > 0 ? (
          <div className="space-y-2">
            {upcomingBookings.map((booking) => (
              <div
                key={getBookingId(booking)}
                className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-white p-3 shadow-sm"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-900">
                    {getClientName(booking)} · {getServiceName(booking)}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {booking.bookingDate} {getBookingTime(booking) ? `at ${getBookingTime(booking)}` : ""}
                  </p>
                </div>
                <StatusBadge status={booking.status} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState description="No upcoming bookings." />
        )}
      </div>
    </div>
  );
}
