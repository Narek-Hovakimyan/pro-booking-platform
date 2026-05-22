import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/components/ui/button";

const maxReasonLength = 300;

export default function CancelBookingModal({
  booking,
  error = "",
  isSubmitting = false,
  onClose,
  onSubmit,
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const trimmedReason = reason.trim();
  const showRequiredError = touched && !trimmedReason;

  const submitCancellation = (event) => {
    event.preventDefault();
    setTouched(true);

    if (!trimmedReason || isSubmitting) return;

    onSubmit({ cancelReason: trimmedReason });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg space-y-5 overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:max-h-[90vh] sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">Cancel booking</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {booking?.serviceName || "Service"} · {booking?.bookingDate || "No date"} {booking?.time || ""}
            </p>
          </div>

          <Button
            aria-label="Close cancel booking modal"
            disabled={isSubmitting}
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form className="space-y-4" onSubmit={submitCancellation}>
          <label className="grid gap-2 text-sm font-semibold">
            Reason for cancellation
            <textarea
              className="min-h-28 w-full rounded-2xl border bg-white p-3 font-normal"
              disabled={isSubmitting}
              maxLength={maxReasonLength}
              placeholder="Tell the barber why you are cancelling..."
              value={reason}
              onBlur={() => setTouched(true)}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>

          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-red-600">
              {showRequiredError ? "Please provide a cancellation reason" : ""}
            </span>
            <span className="text-neutral-500">
              {reason.length}/{maxReasonLength}
            </span>
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="grid gap-2 sm:flex sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              disabled={isSubmitting}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Keep booking
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={isSubmitting || !trimmedReason}
              type="submit"
            >
              {isSubmitting ? "Cancelling..." : "Confirm cancellation"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
