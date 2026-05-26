import StatusBadge from "@/shared/components/StatusBadge";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import ClientReliabilitySummary from "@/barber/components/bookings/ClientReliabilitySummary";

const formatRequestDate = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

export default function BookingListItem({
  booking,
  bookingId,
  status,
  isHighlighted,
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
  const rescheduleRequest = booking?.rescheduleRequest;
  const rescheduleStatus = rescheduleRequest?.status || "";
  const isReschedulePending = rescheduleStatus === "pending";
  const isRescheduleRejected = rescheduleStatus === "rejected";
  const isRescheduleAccepted = rescheduleStatus === "accepted";
  const requestedDate = formatRequestDate(
    rescheduleRequest?.requestedBookingDate
  );
  const requestedTime = rescheduleRequest?.requestedTime || "";
  const rejectionReason = rescheduleRequest?.rejectionReason || "";
  const isAcceptingReschedule =
    rescheduleAction?.bookingId === bookingId &&
    rescheduleAction?.action === "accept";
  const isRejectingReschedule =
    rescheduleAction?.bookingId === bookingId &&
    rescheduleAction?.action === "reject";
  const isRescheduleActionLoading = isAcceptingReschedule || isRejectingReschedule;

  return (
    <div
      key={bookingId}
      className={cn(
        "rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-colors",
        isHighlighted && "border-yellow-300 bg-yellow-50"
      )}
    >
      <div className="font-semibold text-neutral-950">
        {getClientName(booking)} · {booking?.clientPhone || booking?.phone || ""}
      </div>

      <div className="mt-1 text-sm text-neutral-500">
        {getServiceName(booking)} · {booking?.bookingDate || "No date"}{" "}
        {getBookingTime(booking) || "HH:mm"} ·{" "}
        {booking?.price !== undefined && booking?.price !== null && (
          <span className="font-semibold text-neutral-800">
            {Number(booking.price || 0).toLocaleString()} դրամ
          </span>
        )}
      </div>

      <div className="mt-3">
        <StatusBadge status={status} />
      </div>

      {booking?.note && (
        <div className="mt-1 text-sm">
          Նշում՝ {booking.note}
        </div>
      )}

      {/* Consultation summary for barbers */}
      {booking?.consultation && (
        <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50 p-3 text-sm text-violet-900">
          <div className="font-semibold">Hair Consultation</div>
          {booking.consultation.hairType && (
            <p className="mt-1 text-violet-800">
              <span className="font-medium">Type:</span> {booking.consultation.hairType}
            </p>
          )}
          {booking.consultation.chemicalTreatments && (
            <p className="mt-0.5 text-violet-800">
              <span className="font-medium">Chemical treatments:</span> {booking.consultation.chemicalTreatments}
            </p>
          )}
          {booking.consultation.allergies && (
            <p className="mt-0.5 text-violet-800">
              <span className="font-medium">Allergies:</span> {booking.consultation.allergies}
            </p>
          )}
          {booking.consultation.scalpSensitivity && (
            <p className="mt-0.5 text-violet-800">
              <span className="font-medium">Scalp sensitivity:</span> {booking.consultation.scalpSensitivity}
            </p>
          )}
          {booking.consultation.desiredOutcome && (
            <p className="mt-0.5 text-violet-800">
              <span className="font-medium">Desired outcome:</span> {booking.consultation.desiredOutcome}
            </p>
          )}
          {booking.consultation.notes && (
            <p className="mt-0.5 text-violet-800">
              <span className="font-medium">Notes:</span> {booking.consultation.notes}
            </p>
          )}
        </div>
      )}

      {/* Consent status */}
      {booking?.consent && booking.consent.accepted && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Photo consent given
            {booking.consent.textVersion && (
              <span className="ml-1 text-emerald-500 text-xs">
                · v{booking.consent.textVersion}
              </span>
            )}
            {booking.consent.acceptedAt && (
              <span className="ml-1 text-emerald-600">
                ({new Date(booking.consent.acceptedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })})
              </span>
            )}
          </span>
        </div>
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

      {isReschedulePending && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">Reschedule request</div>
          <p className="mt-1">
            Requested: {requestedDate || "No date"} {requestedTime || "HH:mm"}
          </p>
          {rescheduleRequest?.requestNote && (
            <p className="mt-1 text-amber-800">
              Note: {rescheduleRequest.requestNote}
            </p>
          )}
          <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
            <Button
              className="w-full sm:w-auto"
              disabled={isRescheduleActionLoading}
              onClick={() => onAcceptRescheduleRequest?.(booking)}
            >
              {isAcceptingReschedule ? "Accepting..." : "Accept request"}
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={isRescheduleActionLoading}
              onClick={() => onRejectRescheduleRequest?.(booking)}
              variant="outline"
            >
              {isRejectingReschedule ? "Rejecting..." : "Reject request"}
            </Button>
          </div>
        </div>
      )}

      {isRescheduleRejected && (
        <p className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
          Reschedule request rejected
          {rejectionReason ? `: ${rejectionReason}` : ""}
        </p>
      )}

      {isRescheduleAccepted && (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Reschedule request accepted
        </p>
      )}

      <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
        {status === "pending" && (
          <Button
            className="w-full sm:w-auto"
            onClick={() => onUpdateBookingStatus(booking, "accepted")}
          >
            Accept
          </Button>
        )}

        {(status === "pending" || status === "accepted") && (
          <Button
            className="w-full sm:w-auto"
            onClick={() => onOpenRejectBookingModal(booking)}
            variant="outline"
          >
            Reject
          </Button>
        )}

        {status === "accepted" && (
          <Button
            className="w-full sm:w-auto"
            onClick={() => onUpdateBookingStatus(booking, "completed")}
          >
            Complete
          </Button>
        )}

        {isEligibleForNoShowLateCancel(booking) && (
          <>
            <Button
              className="w-full sm:w-auto"
              onClick={() => onMarkNoShowBooking(booking)}
              variant="outline"
            >
              Mark no-show
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => onMarkLateCancelBooking(booking)}
              variant="outline"
            >
              Late cancellation
            </Button>
          </>
        )}
      </div>

      <ClientReliabilitySummary
        clientId={booking?.client?.id || booking?.client?._id || booking?.clientId}
      />
    </div>
  );
}
