import { Store } from "lucide-react";

import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import ServiceStep from "@/client/components/booking/ServiceStep";
import ClientDetailsStep from "@/client/components/booking/ClientDetailsStep";
import BookingConfirmationModal from "@/client/components/booking/BookingConfirmationModal";
import WaitlistForm from "@/client/components/waitlist/WaitlistForm";

export default function ClientBookingStepContent({
  barber,
  step,
  services,
  selectedService,
  selectedServiceId,
  onSelectService,
  selectedDate,
  selectedDateLabel,
  onSelectDate,
  onSelectCustomDate,
  selectedTime,
  onSelectTime,
  availableSlots,
  isSelectedTimeValid = false,
  isRebooking = false,
  client,
  onClientChange,
  bookingState,
  salon,
  confirmation,
  voucher,
  todayKey,
  nonWorkingDays,
  slotMessage,
  onContinueToClientDetails,
  onOpenConfirmation,
  onBackToServiceSelection,
  onChangeService,
  onOpenWaitlistForm,
  onCloseWaitlistForm,
  onCancelSalonSelector,
  onWaitlistSuccess,
  onResetBookingFlow,
  onConfirmBooking,
  canPrepareConfirmation,
  selectedServicePriceInfo,
  isServiceDataLoading = false,
}) {
  const selectedBarberId = barber?._id || barber?.id || "";
  const selectedSalonName = salon.selectedSalonName;
  const selectedBookingSalonId = salon.selectedBookingSalonId;
  const showWaitlistForm = bookingState.showWaitlistForm;
  const waitlistSuccess = bookingState.waitlistSuccess;
  const safeNonWorkingDays = nonWorkingDays || [];
  const safeAvailableSlots = availableSlots || [];
  const hasActiveServices = (services || []).some((service) => service?.active);

  const rebookSummary =
    isRebooking && selectedService ? (
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="inline-flex rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-white">
              Booking again
            </span>
            <div className="mt-3 font-semibold text-neutral-950">
              {selectedService.name || "Service"}
            </div>
            <div className="mt-1 text-sm text-neutral-600">
              {selectedServicePriceInfo.hasDiscount && (
                <span className="mr-1.5 text-neutral-400 line-through">
                  {selectedServicePriceInfo.originalPrice.toLocaleString()} դրամ
                </span>
              )}
              <span
                className={
                  selectedServicePriceInfo.hasDiscount ? "font-semibold text-emerald-700" : ""
                }
              >
                {selectedServicePriceInfo.discountedPrice.toLocaleString()} դրամ
              </span>{" "}
              · {selectedService.duration || 20} min
            </div>
          </div>
          <Button onClick={onChangeService} variant="outline">
            Change service
          </Button>
        </div>
      </div>
    ) : null;

  return (
    <Card className="rounded-2xl shadow-card sm:rounded-3xl">
      <CardContent className="p-4 sm:p-6">
      {selectedSalonName && (
        <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <Store className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
            <span>
              Booking at <strong>{selectedSalonName}</strong>
              {salon.hasMultipleSalons && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  Selected salon
                </span>
              )}
            </span>
          </div>
          <p className="ml-6 mt-1 text-xs text-blue-600">
            Availability is based on this salon&apos;s schedule.
          </p>
        </div>
      )}

      {step === 2 && (
        <ServiceStep
          services={services}
          selectedServiceId={selectedServiceId}
          onSelectService={onSelectService}
          onContinue={salon.handleContinueAfterService}
        />
      )}

      {step === 3 && hasActiveServices && (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">Ընտրիր օրը և ժամը</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Available times update after service and date selection.
            </p>
          </div>

          {selectedService && !isRebooking && (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-neutral-500">
                    SELECTED SERVICE
                  </span>
                  <div className="mt-0.5 font-semibold text-neutral-950">
                    {selectedService.name || "Service"}
                  </div>
                  <div className="mt-0.5 text-sm text-neutral-600">
                    {selectedServicePriceInfo.hasDiscount && (
                      <span className="mr-1.5 text-neutral-400 line-through">
                        {selectedServicePriceInfo.originalPrice.toLocaleString()} դրամ
                      </span>
                    )}
                    <span
                      className={
                        selectedServicePriceInfo.hasDiscount
                          ? "font-semibold text-emerald-700"
                          : ""
                      }
                    >
                      {selectedServicePriceInfo.discountedPrice.toLocaleString()} դրամ
                    </span>{" "}
                    · {selectedService.duration || 20} min
                  </div>
                </div>
                <button
                  onClick={onBackToServiceSelection}
                  className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {rebookSummary}

          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Select date
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {(salon.dateOptions || []).map((day) => (
                <div key={day.value} className="flex-1 sm:flex-none">
                  <Button
                    className="w-full"
                    variant={selectedDate === day.value ? "default" : "outline"}
                    onClick={() => onSelectDate(day)}
                  >
                    {day.label}
                  </Button>
                  {safeNonWorkingDays.includes(day.value) && (
                    <div className="mt-1 text-center text-xs text-neutral-500">
                      Day off
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <label className="grid gap-2 text-sm font-semibold sm:max-w-xs">
            Other date
            <input
              className="rounded-2xl border p-3 font-normal"
              min={todayKey}
              type="date"
              value={selectedDate}
              onChange={(event) => onSelectCustomDate(event.target.value)}
            />
          </label>

          {selectedDate && selectedTime && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800">
              Selected: {selectedDateLabel || selectedDate} at {selectedTime}
            </div>
          )}

          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Available times
            </span>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {safeAvailableSlots.length > 0 ? (
                safeAvailableSlots.map((time) => (
                  <Button
                    key={time}
                    variant={selectedTime === time ? "default" : "outline"}
                    onClick={() => onSelectTime(time)}
                  >
                    {time}
                  </Button>
                ))
              ) : (
                <div className="col-span-full space-y-3">
                  <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-center text-sm text-neutral-500">
                    {selectedDate && safeNonWorkingDays.includes(selectedDate)
                      ? "This is a non-working day — no slots available."
                      : slotMessage}
                  </div>

                  {selectedDate && selectedService && !safeNonWorkingDays.includes(selectedDate) && (
                    <div className="text-center">
                      {waitlistSuccess ? (
                        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                          You&apos;ll be notified when a time opens.
                        </p>
                      ) : (
                        <button
                          className="text-sm font-medium text-amber-600 underline underline-offset-2 hover:text-amber-800"
                          onClick={onOpenWaitlistForm}
                          type="button"
                        >
                          Notify me when a time opens
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:flex">
            <Button className="w-full sm:w-auto" variant="outline" onClick={onBackToServiceSelection}>
              Հետ
            </Button>

            <Button
              className="w-full sm:w-auto"
              disabled={!selectedTime || !isSelectedTimeValid}
              onClick={onContinueToClientDetails}
            >
              Շարունակել
            </Button>
          </div>
        </div>
      )}

      {step === 4 && hasActiveServices && (
        <ClientDetailsStep
          client={client}
          canConfirm={canPrepareConfirmation}
          error={bookingState.error}
          onChange={onClientChange}
          onBack={onBackToServiceSelection}
          onContinue={onOpenConfirmation}
          rebookSummary={rebookSummary}
          referenceFiles={bookingState.referenceFiles}
          onReferenceFilesChange={bookingState.setReferenceFiles}
          consultation={bookingState.consultation}
          onConsultationChange={bookingState.setConsultation}
          consent={bookingState.consent}
          onConsentChange={bookingState.setConsent}
          publicVouchers={voucher.publicVouchers}
          voucherCode={bookingState.voucherCode}
          voucherPreview={voucher.voucherPreview}
          discountPreview={voucher.discountPreview}
          voucherError={voucher.voucherError}
          voucherLoading={voucher.voucherLoading}
          onVoucherCodeChange={voucher.voucherCodeChange}
          onApplyVoucher={voucher.applyVoucher}
          onRemoveVoucher={voucher.removeVoucher}
          isPreparingConfirmation={confirmation.isPreparingConfirmation}
        />
      )}

      {salon.salonSelectorOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[calc(100vh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:p-6">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">Choose a salon</h2>
              <p className="mt-1 text-sm text-neutral-500">
                This specialist works at multiple salons. Select one for your booking.
              </p>
            </div>

            <div className="mt-5 space-y-3">
              {salon.approvedSalons.map((salonEntry) => {
                const salonData = salonEntry?.salon || salonEntry;
                const salonId = salonData?.id || salonData?._id;
                const salonName = salonData?.name || "Salon";
                const isPrimary = salonEntry?.isPrimary;

                return (
                  <button
                    key={salonId}
                    onClick={() => salon.handleSalonSelect(salonEntry)}
                    className="w-full rounded-2xl border border-neutral-200 p-4 text-left shadow-sm transition hover:bg-neutral-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-neutral-950">{salonName}</div>
                        {salonData?.city && (
                          <div className="mt-1 text-sm text-neutral-500">
                            {salonData.city}
                            {salonData?.address ? `, ${salonData.address}` : ""}
                          </div>
                        )}
                      </div>
                      {isPrimary && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                          ⭐ Primary
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5">
              <Button
                className="w-full"
                onClick={onCancelSalonSelector}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <BookingConfirmationModal
        isOpen={confirmation.canRenderConfirmationModal}
        onClose={onResetBookingFlow}
        onConfirm={onConfirmBooking}
        selectedService={confirmation.confirmationService || selectedService}
        isServiceLoading={isServiceDataLoading}
        selectedDate={selectedDateLabel || selectedDate}
        selectedTime={selectedTime}
        selectedSalonName={selectedSalonName}
        barberName={barber?.name || "Specialist"}
        canConfirm={confirmation.canSubmitConfirmation}
        isSubmitting={bookingState.isSaving}
        error={bookingState.error}
        consultation={bookingState.consultation}
        consent={bookingState.consent}
        voucherCode={bookingState.voucherCode}
        discountPreview={voucher.discountPreview}
        pricingQuote={confirmation.bookingQuote}
        isQuoteLoading={confirmation.isQuoteLoading}
        quoteError={confirmation.quoteError}
        depositSettings={barber?.depositSettings}
        disabledReason={confirmation.confirmDisabledReason}
      />

      {showWaitlistForm && selectedBarberId && selectedService && selectedDate && (
        <WaitlistForm
          barberId={barber?._id || barber?.id || ""}
          salonId={selectedBookingSalonId}
          serviceId={selectedService?._id || selectedService?.id || ""}
          date={selectedDate}
          onClose={onCloseWaitlistForm}
          onSuccess={onWaitlistSuccess}
        />
      )}
      </CardContent>
    </Card>
  );
}
