import { Button } from "@/shared/components/ui/button";

export default function BookingConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  selectedService,
  selectedDate,
  selectedTime,
  selectedSalonName = "",
  barberName = "",
  canConfirm = false,
  isSubmitting = false,
  error = "",
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[calc(100vh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:p-6">
        <div>
          <h2 className="text-xl font-bold sm:text-2xl">
            Confirm booking
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Review the details before sending your request.
          </p>
        </div>

        <div className="mt-5 divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white text-sm">
          {selectedSalonName && (
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-neutral-500">Salon</span>
              <span className="font-semibold text-neutral-950">
                {selectedSalonName}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-neutral-500">Specialist</span>
            <span className="font-semibold text-neutral-950">
              {barberName || "Specialist"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-neutral-500">Service</span>
            <span className="font-semibold text-neutral-950">
              {selectedService?.name || "Service"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-neutral-500">Duration</span>
            <span className="font-semibold text-neutral-950">
              {selectedService?.duration || 0} min
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-neutral-500">Date</span>
            <span className="font-semibold text-neutral-950">
              {selectedDate}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-neutral-500">Time</span>
            <span className="font-semibold text-neutral-950">
              {selectedTime}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-b-2xl bg-neutral-900 px-4 py-3 text-white">
            <span className="font-medium">Total</span>
            <span className="text-lg font-bold">
              {(selectedService?.price?.toLocaleString?.() ||
                selectedService?.price ||
                0)}{" "}
              դրամ
            </span>
          </div>
        </div>

        {error && (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 grid gap-2 sm:flex sm:flex-row-reverse">
          <Button
            className="w-full sm:w-auto sm:min-w-[160px]"
            disabled={!canConfirm || isSubmitting}
            onClick={onConfirm}
          >
            {isSubmitting ? "Booking..." : "Confirm booking"}
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={isSubmitting}
            onClick={onClose}
            variant="outline"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
