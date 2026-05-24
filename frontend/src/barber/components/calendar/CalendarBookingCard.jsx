import { Clock, MessageSquare, Phone, Scissors, UserRound } from "lucide-react";

import StatusBadge from "@/shared/components/StatusBadge";
import ClientReliabilitySummary from "@/barber/components/bookings/ClientReliabilitySummary";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

function getBookingCardTone(status) {
  switch (status) {
    case "pending":
      return "border-amber-200 bg-amber-50/80";
    case "accepted":
      return "border-emerald-200 bg-emerald-50/80";
    case "completed":
      return "border-blue-200 bg-blue-50/80";
    case "rejected":
    case "cancelled":
    case "expired":
    case "no_show":
    case "late_cancelled":
      return "border-neutral-200 bg-neutral-50 text-neutral-500";
    default:
      return "border-neutral-200 bg-white";
  }
}

function isBookingPast(booking) {
  if (!booking?.bookingDate) return false;
  const now = new Date();
  const bookingEnd = new Date(`${booking.bookingDate}T${booking.time || "00:00"}:00`);
  const duration = Number(booking?.duration || 0);

  if (Number.isNaN(bookingEnd.getTime())) return false;

  bookingEnd.setMinutes(
    bookingEnd.getMinutes() + (Number.isFinite(duration) && duration > 0 ? duration : 0)
  );
  return bookingEnd <= now;
}

function isEligibleForNoShowLateCancel(booking) {
  if (!booking) return false;
  return (
    booking.status === "accepted" &&
    isBookingPast(booking) &&
    !booking.noShowMarkedAt &&
    !booking.lateCancelledAt
  );
}

export default function CalendarBookingCard({
  booking,
  status,
  clientName,
  timeRange,
  serviceName,
  phone,
  duration,
  price,
  notes,
  onAccept,
  onReject,
  onComplete,
  onNoShow,
  onLateCancel,
}) {
  const showNoShowLateCancel = isEligibleForNoShowLateCancel(booking);

  return (
    <div
      className={cn("rounded-2xl border p-4 shadow-sm", getBookingCardTone(status))}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-neutral-950">
            <UserRound className="h-4 w-4 shrink-0" />
            <span className="truncate">{clientName}</span>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-neutral-600">
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0" />
              {timeRange}
            </span>
            <span className="flex items-center gap-2">
              <Scissors className="h-4 w-4 shrink-0" />
              {serviceName}
            </span>
            {phone && (
              <span className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0" />
                {phone}
              </span>
            )}
          </div>
        </div>

        <StatusBadge status={status} />
      </div>

      <div className="mt-3 grid gap-2 text-sm text-neutral-700 sm:grid-cols-2">
        <p>Duration: {duration} min</p>
        <p className="font-semibold text-neutral-900">
          Price: {price.toLocaleString()} AMD
        </p>
      </div>

      {notes && (
        <p className="mt-3 rounded-xl border border-neutral-200 bg-white/70 p-3 text-sm text-neutral-700">
          Note: {notes}
        </p>
      )}

      {status === "rejected" && booking?.rejectionReason && (
        <p className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          Reason: {booking.rejectionReason}
        </p>
      )}

      {status === "cancelled" && (
        <p className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          Cancelled by client
          {booking?.cancelReason ? `: ${booking.cancelReason}` : ""}
        </p>
      )}

      {/* Reschedule requested badge */}
      {booking?.rescheduleRequest?.status === "pending" && (
        <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          <p className="font-semibold">Reschedule requested</p>
          {(booking.rescheduleRequest.requestedBookingDate ||
            booking.rescheduleRequest.requestedTime) && (
            <p className="mt-0.5">
              To:{" "}
              {booking.rescheduleRequest.requestedBookingDate
                ? String(booking.rescheduleRequest.requestedBookingDate).slice(0, 10)
                : ""}
              {booking.rescheduleRequest.requestedTime
                ? ` ${booking.rescheduleRequest.requestedTime}`
                : ""}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
        {status === "pending" && (
          <Button className="w-full sm:w-auto" onClick={onAccept}>
            Accept
          </Button>
        )}

        {status === "pending" && (
          <Button className="w-full sm:w-auto" onClick={onReject} variant="outline">
            Reject
          </Button>
        )}

        {status === "accepted" && (
          <Button className="w-full sm:w-auto" onClick={onComplete}>
            Mark completed
          </Button>
        )}

        {showNoShowLateCancel && (
          <>
            <Button className="w-full sm:w-auto" onClick={onNoShow} variant="outline">
              Mark no-show
            </Button>
            <Button className="w-full sm:w-auto" onClick={onLateCancel} variant="outline">
              Late cancellation
            </Button>
          </>
        )}

        {phone && (
          <Button
            as="a"
            className="w-full sm:w-auto"
            href={`sms:${phone}`}
            variant="outline"
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Message client
          </Button>
        )}
      </div>

      <ClientReliabilitySummary
        clientId={booking?.client?.id || booking?.client?._id || booking?.clientId}
      />
    </div>
  );
}
