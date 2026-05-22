import { X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

const delayOptions = [10, 20];

export default function DelayBookingModal({
  booking,
  error = "",
  isSubmitting = false,
  onClose,
  onSubmit,
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md space-y-5 overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:max-h-[90vh] sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">Running late?</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {booking?.serviceName || "Service"} · {booking?.bookingDate || "No date"} {booking?.time || ""}
            </p>
          </div>

          <Button
            aria-label="Close delay booking modal"
            disabled={isSubmitting}
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm text-neutral-600">
          You can delay this booking if the next time is available.
        </p>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="grid gap-2">
          {delayOptions.map((delayMinutes) => (
            <Button
              disabled={isSubmitting}
              key={delayMinutes}
              onClick={() => onSubmit?.({ delayMinutes })}
              type="button"
            >
              {isSubmitting ? "Checking..." : `Delay ${delayMinutes} minutes`}
            </Button>
          ))}
        </div>

        <Button
          className="w-full"
          disabled={isSubmitting}
          onClick={onClose}
          type="button"
          variant="outline"
        >
          Keep current time
        </Button>
      </div>
    </div>
  );
}
