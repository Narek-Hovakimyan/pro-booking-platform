import { ChevronRight, Clock3, Settings } from "lucide-react";

import AnalyticsBookingRow from "@/barber/components/analytics/AnalyticsBookingRow";
import AnalyticsQuickActionButton from "@/barber/components/analytics/AnalyticsQuickActionButton";
import EmptyState from "@/shared/components/common/EmptyState";
import { Button } from "@/shared/components/ui/button";

export default function AnalyticsPendingActions({
  pendingBookings,
  pendingCount,
  quickActions,
  getBookingId,
  getClientName,
  getServiceName,
  getBookingTime,
  getBookingPrice,
  onNavigate,
  bookingsPath,
}) {
  return (
    <>
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-neutral-950">
          <Clock3 className="h-4 w-4 text-amber-500" />
          Pending Requests
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {pendingCount}
            </span>
          )}
        </h2>

        {pendingBookings.length > 0 ? (
          <div className="space-y-2">
            {pendingBookings.map((booking) => (
              <AnalyticsBookingRow
                booking={booking}
                getBookingId={getBookingId}
                getBookingPrice={getBookingPrice}
                getBookingTime={getBookingTime}
                getClientName={getClientName}
                getServiceName={getServiceName}
                key={getBookingId(booking)}
                linkTo={bookingsPath}
              />
            ))}
            {pendingCount > 5 && (
              <Button
                className="w-full text-xs"
                onClick={() => onNavigate(bookingsPath)}
                variant="ghost"
              >
                View all {pendingCount} pending requests
                <ChevronRight className="ml-1 h-3 w-3" />
              </Button>
            )}
          </div>
        ) : (
          <EmptyState description="No pending requests at the moment." />
        )}
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-neutral-950">
          <Settings className="h-4 w-4 text-neutral-400" />
          Quick Actions
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => (
            <AnalyticsQuickActionButton
              key={action.path}
              icon={action.icon}
              label={action.label}
              onClick={() => onNavigate(action.path)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
