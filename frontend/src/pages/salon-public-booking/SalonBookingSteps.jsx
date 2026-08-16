import { CalendarDays, Scissors, UserRound } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import EmptyState from "@/shared/components/common/EmptyState";
import { getServicePriceInfo } from "@/shared/data/serviceCategories";
import { getArmeniaTodayKey } from "@/shared/utils/dates";
import { getMediaUrl } from "@/shared/utils/media";

import SalonBookingSummary from "./SalonBookingSummary";

export default function SalonBookingSteps({
  salon,
  step,
  selectedBarber,
  selectedBarberId,
  selectedBarberServices,
  barbers,
  services,
  selectedService,
  selectedServiceId,
  handleSelectBarber,
  handleSelectService,
  setStep,
  dateOptions,
  selectedDate,
  selectedDateLabel,
  nonWorkingDays,
  selectDate,
  setSelectedTime,
  availableSlots,
  scheduleLoading,
  bookingsLoading,
  slotMessage,
  validSelectedTime,
  currentUser,
  client,
  setClient,
  promoCode,
  setPromoCode,
  promoStatus,
  validatedPromo,
  validatingPromo,
  onApplyPromo,
  onRemovePromo,
  submitError,
  canConfirmBooking,
  confirmDisabledReason,
  isSaving,
  onConfirm,
  onBackFromConfirm,
  authRedirect,
}) {
  const selectedServicePriceInfo = getServicePriceInfo(selectedService);
  const publicPromoDiscount = Math.max(0, Number(validatedPromo?.discountAmount || 0));
  const publicFinalPrice = Math.max(
    0,
    Number(validatedPromo?.finalPrice ?? selectedServicePriceInfo.discountedPrice ?? 0)
  );
  const publicTotalDiscount = Math.max(
    0,
    Number(selectedServicePriceInfo.originalPrice || 0) - publicFinalPrice
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      {step === 1 && (
        <Card className="rounded-2xl sm:rounded-3xl">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">Choose a specialist</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Select one of our specialists to get started.
              </p>
            </div>

            {barbers.length === 0 ? (
              <EmptyState
                description="No specialists are available for booking at this salon right now."
                title="No specialists available"
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {barbers.map((barber) => {
                  const barberId = barber.id || barber._id;
                  const barberServices = Array.isArray(barber.services) && barber.services.length > 0
                    ? barber.services
                    : (services || []).filter(
                        (service) => String(service?.barberId) === String(barberId)
                      );
                  const isSelected = String(selectedBarberId) === String(barberId);

                  return (
                    <button
                      key={barberId}
                      onClick={() => handleSelectBarber(barber)}
                      className={`relative w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                        isSelected
                          ? "border-neutral-900 bg-neutral-900 text-white ring-2 ring-neutral-900/20"
                          : "border-neutral-200 bg-white hover:bg-neutral-50"
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold text-neutral-900">
                          \u2713
                        </span>
                      )}
                      <div className="flex items-center gap-3">
                        {barber.avatarUrl ? (
                          <img
                            alt={barber.name}
                            className="h-12 w-12 rounded-full object-cover"
                            src={getMediaUrl(barber.avatarUrl)}
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
                            <UserRound className="h-6 w-6 text-neutral-400" />
                          </div>
                        )}
                        <div>
                          <div className={`font-semibold ${isSelected ? "text-white" : "text-neutral-950"}`}>
                            {barber.name}
                          </div>
                          <div className={`text-sm ${isSelected ? "text-neutral-300" : "text-neutral-500"}`}>
                            {barber.profession || barber.specialty || "Barber"}
                          </div>
                        </div>
                      </div>
                      {barber.firstAvailableSlot && (
                        <div
                          className={`mt-3 rounded-xl px-3 py-2 text-sm ${
                            isSelected
                              ? "bg-white/15 text-white"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          Next available today: {barber.firstAvailableSlot}
                        </div>
                      )}
                      {barberServices.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {barberServices.slice(0, 3).map((svc) => (
                            <span
                              key={svc.id || svc._id}
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                isSelected
                                  ? "bg-white/20 text-white"
                                  : "bg-neutral-100 text-neutral-600"
                              }`}
                            >
                              {svc.name}
                            </span>
                          ))}
                          {barberServices.length > 3 && (
                            <span className={`text-xs ${isSelected ? "text-neutral-300" : "text-neutral-400"}`}>
                              +{barberServices.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                className="w-full sm:w-auto"
                disabled={!selectedBarber}
                onClick={() => setStep(2)}
              >
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && selectedBarber && (
        <Card className="rounded-2xl sm:rounded-3xl">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">Pick a service</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Choose a service from {selectedBarber.name}.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-200">
                <UserRound className="h-5 w-5 text-neutral-500" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-neutral-950">{selectedBarber.name}</div>
              </div>
              <button
                onClick={() => setStep(1)}
                className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
              >
                Change
              </button>
            </div>

            {selectedBarberServices.length === 0 ? (
              <EmptyState
                description="This specialist has no active services."
                title="No services available"
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedBarberServices.map((svc) => {
                  const svcId = svc.id || svc._id;
                  const isSelected = String(selectedServiceId) === String(svcId);
                  const priceInfo = getServicePriceInfo(svc);
                  return (
                    <button
                      key={svcId}
                      onClick={() => handleSelectService(svcId)}
                      className={`relative w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                        isSelected
                          ? "border-neutral-900 bg-neutral-900 text-white ring-2 ring-neutral-900/20"
                          : "border-neutral-200 bg-white hover:bg-neutral-50"
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold text-neutral-900">
                          \u2713
                        </span>
                      )}
                      <div className={`font-semibold ${isSelected ? "text-white" : "text-neutral-950"}`}>
                        {svc.name}
                      </div>
                      {(svc.type === "package" || priceInfo.hasDiscount) && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {priceInfo.hasDiscount && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                              isSelected ? "bg-rose-500 text-white" : "bg-rose-100 text-rose-700"
                            }`}>
                              {priceInfo.discountLabel}
                            </span>
                          )}
                          {svc.type === "package" && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              isSelected ? "bg-violet-500 text-white" : "bg-violet-100 text-violet-700"
                            }`}>
                              Package
                            </span>
                          )}
                        </div>
                      )}
                      <div className={`mt-1 text-sm ${isSelected ? "text-neutral-300" : "text-neutral-500"}`}>
                        {svc.duration || 20} min ·{" "}
                        <span className="inline-flex items-center gap-1.5">
                          {priceInfo.hasDiscount && (
                            <span className={`line-through ${isSelected ? "text-neutral-400" : "text-neutral-400"}`}>
                              {Number(priceInfo.originalPrice).toLocaleString()} դրամ
                            </span>
                          )}
                          <span className={`font-semibold ${isSelected ? "text-white" : "text-neutral-800"}`}>
                            {Number(priceInfo.discountedPrice).toLocaleString()} դրամ
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={!selectedServiceId}
                onClick={() => setStep(3)}
              >
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && selectedBarber && selectedService && (
        <Card className="rounded-2xl sm:rounded-3xl">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">Choose date & time</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Pick a date and time for your appointment.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              <div>
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <Scissors className="h-4 w-4" />
                  <span className="font-medium text-neutral-950">{selectedService.name}</span>
                </div>
                <div className="mt-1 text-sm text-neutral-500">
                  {selectedService.duration || 20} min
                </div>
              </div>
              <button
                onClick={() => setStep(2)}
                className="text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
              >
                Change
              </button>
            </div>

            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Select date
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {dateOptions.map((day) => (
                  <div key={day.value} className="flex-1 sm:flex-none">
                    <Button
                      className="w-full"
                      variant={selectedDate === day.value ? "default" : "outline"}
                      onClick={() => selectDate(day.value)}
                    >
                      {day.label}
                    </Button>
                    {nonWorkingDays.includes(day.value) && (
                      <div className="mt-1 text-center text-xs text-neutral-500">
                        Day off
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <label className="grid gap-2 text-sm font-semibold sm:max-w-xs">
              Or pick a custom date
              <input
                className="rounded-2xl border p-3 font-normal"
                min={getArmeniaTodayKey()}
                type="date"
                value={selectedDate}
                onChange={(event) => selectDate(event.target.value)}
              />
            </label>

            {selectedDate && validSelectedTime && (
              <div className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <CalendarDays className="h-4 w-4 shrink-0" />
                <span className="font-semibold">Selected:</span>{" "}
                {selectedDateLabel} at {validSelectedTime}
              </div>
            )}

            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Available times
              </span>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                {scheduleLoading ? (
                  <div className="col-span-full text-center text-sm text-neutral-500">
                    Loading available times...
                  </div>
                ) : bookingsLoading ? (
                  <div className="col-span-full text-center text-sm text-neutral-500">
                    Loading current bookings...
                  </div>
                ) : availableSlots.length > 0 ? (
                  availableSlots.map((time) => (
                    <Button
                      key={time}
                      variant={validSelectedTime === time ? "default" : "outline"}
                      onClick={() => setSelectedTime(time)}
                    >
                      {time}
                    </Button>
                  ))
                ) : (
                  <div className="col-span-full rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-center text-sm text-neutral-500">
                    {selectedDate && nonWorkingDays.includes(selectedDate)
                      ? "This is a non-working day — no slots available."
                      : slotMessage}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={!validSelectedTime}
                onClick={() => setStep(4)}
              >
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && selectedBarber && selectedService && validSelectedTime && (
        <SalonBookingSummary
          salon={salon}
          selectedBarber={selectedBarber}
          selectedService={selectedService}
          selectedDateLabel={selectedDateLabel}
          validSelectedTime={validSelectedTime}
          selectedServicePriceInfo={selectedServicePriceInfo}
          validatedPromo={validatedPromo}
          publicPromoDiscount={publicPromoDiscount}
          publicTotalDiscount={publicTotalDiscount}
          publicFinalPrice={publicFinalPrice}
          currentUser={currentUser}
          promoCode={promoCode}
          setPromoCode={setPromoCode}
          promoStatus={promoStatus}
          validatingPromo={validatingPromo}
          onApplyPromo={onApplyPromo}
          onRemovePromo={onRemovePromo}
          client={client}
          setClient={setClient}
          submitError={submitError}
          canConfirmBooking={canConfirmBooking}
          confirmDisabledReason={confirmDisabledReason}
          isSaving={isSaving}
          onBack={onBackFromConfirm}
          onConfirm={onConfirm}
          authRedirect={authRedirect}
        />
      )}
    </div>
  );
}
