import {
  Building2,
  CalendarDays,
  Clock,
  MessageCircle,
  RotateCcw,
  Scissors,
  UserRound,
} from "lucide-react";

import StatusBadge from "@/shared/components/StatusBadge";
import BookingReviewActions from "@/client/components/bookings/BookingReviewActions";
import BookingInfoRow from "@/client/components/bookings/BookingInfoRow";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

const formatRequestDate = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

export default function BookingCard({
  barberId = "",
  barberName = "",
  booking,
  bookingDate = "",
  bookingId = "",
  bookingTime = "",
  canCancel = false,
  canDelay = false,
  canReviewSalon = false,
  duration = "",
  isActive = false,
  isBookAgainEligible = false,
  isBarberReviewed = false,
  isSalonReviewed = false,
  onBookAgain,
  onCancel,
  onDetails,
  onDelay,
  onMessage,
  onReschedule,
  onReviewBarber,
  onReviewSalon,
  price = "",
  salonName = "",
  serviceName = "Service",
}) {
  const rescheduleRequest = booking?.rescheduleRequest;
  const rescheduleStatus = rescheduleRequest?.status || "";
  const isReschedulePending = rescheduleStatus === "pending";
  const requestedDate = formatRequestDate(
    rescheduleRequest?.requestedBookingDate
  );
  const requestedTime = rescheduleRequest?.requestedTime || "";
  const hasRescheduleSummary = Boolean(rescheduleStatus);

  return (
    <Card
      id={`booking-${bookingId}`}
      key={bookingId}
      className="rounded-2xl sm:rounded-3xl"
    >
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold sm:text-xl">{serviceName}</h3>
            {price && (
              <p className="mt-1 text-sm font-semibold text-neutral-700">
                {price}
              </p>
            )}
          </div>

          <StatusBadge status={booking?.status} />
        </div>

        <div className="space-y-2 text-sm text-neutral-600">
          <BookingInfoRow icon={<UserRound />} value={barberName} />
          <BookingInfoRow icon={<Scissors />} value={serviceName} />
          <BookingInfoRow icon={<CalendarDays />} value={bookingDate || "No date"} />
          <BookingInfoRow icon={<Clock />} value={bookingTime || "HH:mm"} />
          {duration && (
            <p className="text-neutral-500">Duration: {duration} min</p>
          )}
          {salonName && (
            <BookingInfoRow icon={<Building2 />} value={salonName} />
          )}
        </div>

        {booking?.status === "rejected" && booking?.rejectionReason && (
          <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            Reason: {booking.rejectionReason}
          </p>
        )}

        {booking?.status === "expired" && (
          <p className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-sm text-orange-700">
            {booking?.expiredReason || "Barber did not confirm this booking in time"}
          </p>
        )}

        {hasRescheduleSummary && (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
            {rescheduleStatus === "pending" && (
              <p>
                Request pending: {requestedDate || "No date"}{" "}
                {requestedTime || "HH:mm"}
              </p>
            )}
            {rescheduleStatus === "accepted" && (
              <p>Reschedule accepted.</p>
            )}
            {rescheduleStatus === "rejected" && (
              <p>
                Reschedule rejected
                {rescheduleRequest?.rejectionReason
                  ? `: ${rescheduleRequest.rejectionReason}`
                  : "."}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-2">
          <Button
            className="w-full"
            onClick={() => onDetails?.(booking)}
            variant="outline"
          >
            View details
          </Button>

          {isActive && barberId && (
            <Button
              className="w-full"
              onClick={() => onMessage?.(barberId)}
              variant="outline"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Message barber
            </Button>
          )}

          {isActive && canCancel && (
            <Button
              className="w-full"
              onClick={() => onCancel?.(booking)}
              variant="outline"
            >
              Cancel booking
            </Button>
          )}

          {isActive && canCancel && (
            <Button
              className="w-full"
              disabled={isReschedulePending}
              onClick={() => onReschedule?.(booking)}
              variant="outline"
            >
              {isReschedulePending ? "Request pending" : "Reschedule"}
            </Button>
          )}

          {isActive && canDelay && (
            <Button
              className="w-full"
              onClick={() => onDelay?.(booking)}
              variant="outline"
            >
              I'm running late
            </Button>
          )}

          {isBookAgainEligible && (
            <Button
              className="w-full"
              onClick={() => onBookAgain?.(booking)}
              variant="outline"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Book again
            </Button>
          )}

          {booking?.status === "completed" && (
            <BookingReviewActions
              booking={booking}
              canReviewSalon={canReviewSalon}
              hasReviewedBarber={isBarberReviewed}
              hasReviewedSalon={isSalonReviewed}
              onReviewBarber={onReviewBarber}
              onReviewSalon={onReviewSalon}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
