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
  consultation = null,
  consent = null,
  voucherCode = "",
  discountPreview = 0,
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
          {discountPreview > 0 && voucherCode && (
            <div className="flex items-center justify-between gap-4 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              <span className="font-medium">Discount (code: {voucherCode})</span>
              <span className="font-semibold">
                -{Number(discountPreview).toLocaleString()} դր
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 rounded-b-2xl bg-neutral-900 px-4 py-3 text-white">
            <span className="font-medium">Total</span>
            <span className="text-lg font-bold">
              {(Number(selectedService?.price || 0) - discountPreview).toLocaleString()}{" "}
              դրամ
            </span>
          </div>
        </div>

        {consultation && (
          <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm">
            <div className="font-semibold text-violet-900">Hair Consultation</div>
            {consultation.hairType && (
              <div className="mt-2 text-violet-800">
                <span className="font-medium">Hair type:</span> {consultation.hairType}
              </div>
            )}
            {consultation.chemicalTreatments && (
              <div className="mt-1 text-violet-800">
                <span className="font-medium">Chemical treatments:</span> {consultation.chemicalTreatments}
              </div>
            )}
            {consultation.allergies && (
              <div className="mt-1 text-violet-800">
                <span className="font-medium">Allergies:</span> {consultation.allergies}
              </div>
            )}
            {consultation.scalpSensitivity && (
              <div className="mt-1 text-violet-800">
                <span className="font-medium">Scalp sensitivity:</span> {consultation.scalpSensitivity}
              </div>
            )}
            {consultation.desiredOutcome && (
              <div className="mt-1 text-violet-800">
                <span className="font-medium">Desired outcome:</span> {consultation.desiredOutcome}
              </div>
            )}
            {consultation.notes && (
              <div className="mt-1 text-violet-800">
                <span className="font-medium">Notes:</span> {consultation.notes}
              </div>
            )}
          </div>
        )}

        {consent && consent.accepted && (
          <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
            <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <span className="font-semibold">Photo consent given</span>
              {consent.textVersion && (
                <p className="mt-0.5 text-emerald-700 text-xs">
                  Version: {consent.textVersion}
                </p>
              )}
              {consent.acceptedAt && (
                <p className="mt-0.5 text-emerald-700">
                  Consented on {new Date(consent.acceptedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>
          </div>
        )}

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
