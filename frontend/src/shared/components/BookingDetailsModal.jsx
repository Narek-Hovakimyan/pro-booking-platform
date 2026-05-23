import { MessageCircle, X } from "lucide-react";

import StatusBadge from "@/shared/components/StatusBadge";
import { Button } from "@/shared/components/ui/button";
import { isDateKey } from "@/shared/utils/dates";

const getEntityId = (entity) =>
  typeof entity === "string" ? entity : entity?.id || entity?._id || "";

const getBookingDate = (booking) => {
  if (isDateKey(booking?.bookingDate)) return booking.bookingDate;
  if (isDateKey(booking?.date)) return booking.date;
  if (isDateKey(booking?.dayKey)) return booking.dayKey;
  return "";
};

const getDisplayStatus = (status) =>
  status === "confirmed" ? "accepted" : status;

const formatCreatedDate = (dateValue) => {
  if (!dateValue) return "";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 rounded-xl bg-neutral-50 p-3 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-semibold text-neutral-950">
        {value || "-"}
      </span>
    </div>
  );
}

export default function BookingDetailsModal({
  booking,
  barber = null,
  onCancel,
  onClose,
  onMessage,
}) {
  const bookingBarber =
    booking?.barber && typeof booking.barber === "object"
      ? booking.barber
      : barber;
  const service =
    booking?.service && typeof booking.service === "object"
      ? booking.service
      : null;
  const barberId =
    getEntityId(booking?.barberId) ||
    getEntityId(booking?.barber) ||
    getEntityId(bookingBarber);
  const salon =
    bookingBarber?.salonStatus === "approved" || bookingBarber?.salon?.name
      ? bookingBarber?.salon
      : null;
  const salonName = salon?.name || bookingBarber?.salonName || "";
  const serviceName = service?.name || booking?.serviceName || "Service";
  const servicePrice = service?.price ?? booking?.price;
  const serviceDuration = service?.duration ?? booking?.duration;
  const createdDate = formatCreatedDate(booking?.createdAt);
  const canCancel =
    getDisplayStatus(booking?.status) === "pending" ||
    getDisplayStatus(booking?.status) === "accepted";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">Booking details</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {serviceName}
            </p>
          </div>

          <Button
            aria-label="Close booking details"
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {!booking ? (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Booking not found
          </p>
        ) : (
          <>
            <div className="mt-5 space-y-3">
              <DetailRow label="Specialist" value={bookingBarber?.name || "Specialist"} />
              {salonName && <DetailRow label="Salon" value={salonName} />}
              <DetailRow label="Service" value={serviceName} />
              <DetailRow
                label="Price"
                value={
                  servicePrice !== undefined && servicePrice !== null
                    ? `${Number(servicePrice || 0).toLocaleString()} դրամ`
                    : ""
                }
              />
              <DetailRow
                label="Duration"
                value={serviceDuration ? `${serviceDuration} min` : ""}
              />
              <DetailRow label="Date" value={getBookingDate(booking)} />
              <DetailRow label="Time" value={booking.time} />
              <div className="flex justify-between gap-4 rounded-xl bg-neutral-50 p-3 text-sm">
                <span className="text-neutral-500">Status</span>
                <StatusBadge status={getDisplayStatus(booking.status)} />
              </div>
              {createdDate && <DetailRow label="Created" value={createdDate} />}
            </div>

            {booking.status === "rejected" && booking.rejectionReason && (
              <p className="mt-5 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                Reason: {booking.rejectionReason}
              </p>
            )}

            {booking.status === "cancelled" && booking.cancelReason && (
              <p className="mt-5 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                Cancellation reason: {booking.cancelReason}
              </p>
            )}

            {booking.status === "expired" && (
              <p className="mt-5 rounded-xl border border-orange-100 bg-orange-50 p-3 text-sm text-orange-700">
                {booking.expiredReason || "Specialist did not confirm this booking in time"}
              </p>
            )}

            <div className="mt-5 grid gap-2 sm:flex sm:justify-end">
              {barberId && (
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => onMessage?.(barberId)}
                  type="button"
                  variant="outline"
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Message specialist
                </Button>
              )}
              {canCancel && (
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => onCancel?.(booking)}
                  type="button"
                  variant="outline"
                >
                  Cancel booking
                </Button>
              )}
              <Button
                className="w-full sm:w-auto"
                onClick={onClose}
                type="button"
              >
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
