import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Store } from "lucide-react";

import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import ServiceStep from "@/client/components/booking/ServiceStep";
import ClientDetailsStep from "@/client/components/booking/ClientDetailsStep";
import BookingConfirmationModal from "@/client/components/booking/BookingConfirmationModal";
import WaitlistForm from "@/client/components/waitlist/WaitlistForm";
import { useBooking } from "@/shared/hooks/useBooking";
import { formatDateKey, getDayKeyFromDate, parseDateKey } from "@/shared/utils/dates";

export default function ClientBooking({
  barber,
  step,
  setStep,
  services,
  selectedService,
  selectedServiceId,
  setSelectedServiceId,
  selectedDayKey,
  setSelectedDayKey,
  dateOptions,
  selectedDate,
  selectedDateLabel,
  setSelectedDate,
  nonWorkingDays = [],
  slotMessage = "No available slots",
  selectedTime,
  setSelectedTime,
  availableSlots,
  isSelectedTimeValid = false,
  isRebooking = false,
  client,
  currentUser,
  setClient,
  selectedSalonId: externalSelectedSalonId,
  onSalonSelect,
}) {
  const navigate = useNavigate();
  const { createBooking } = useBooking();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showWaitlistForm, setShowWaitlistForm] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);
  const [salonSelectorOpen, setSalonSelectorOpen] = useState(false);
  const previousSalonIdRef = useRef(externalSelectedSalonId);
  const todayKey = formatDateKey(new Date());
  const selectedBarberId = barber?._id || barber?.id || "";
  const selectedServiceEntityId = selectedService?._id || selectedService?.id || "";
  const safeServices = services || [];
  const activeServices = safeServices.filter((service) => service?.active);
  const hasActiveServices = activeServices.length > 0;
  const safeNonWorkingDays = nonWorkingDays || [];
  const safeAvailableSlots = availableSlots || [];

  // Get approved salons for this barber
  const approvedSalons = (barber?.approvedSalons || barber?.salons || [])
    .filter((s) => s?.status === "approved" || s?.status === undefined);
  const getSalonData = (salonEntry) => salonEntry?.salon || salonEntry;
  const getSalonId = (salonEntry) => {
    const salonData = getSalonData(salonEntry);
    return salonData?.id || salonData?._id || "";
  };
  const getSalonName = (salonEntry) => getSalonData(salonEntry)?.name || "";
  const hasMultipleSalons = approvedSalons.length > 1;
  const primarySalon = barber?.primarySalon || approvedSalons.find((s) => s?.isPrimary) || approvedSalons[0];
  const selectedSalon = externalSelectedSalonId
    ? approvedSalons.find((s) => String(getSalonId(s)) === String(externalSelectedSalonId))
    : primarySalon;
  const selectedSalonName = getSalonName(selectedSalon);
  const parsedSelectedDate = selectedDate ? parseDateKey(selectedDate) : null;
  const selectedDateDayKey =
    selectedDayKey || (parsedSelectedDate ? getDayKeyFromDate(parsedSelectedDate) : "");
  const canConfirmBooking = Boolean(
    selectedBarberId &&
      selectedServiceEntityId &&
      selectedDate &&
      selectedDateDayKey &&
      selectedTime &&
      currentUser &&
      !isSaving
  );

  const handleContinueAfterService = () => {
    if (hasMultipleSalons && !externalSelectedSalonId) {
      setSalonSelectorOpen(true);
    } else {
      setStep(3);
    }
  };

  const handleSalonSelect = (salonEntry) => {
    const salonId = getSalonId(salonEntry);
    if (onSalonSelect) onSalonSelect(salonId);
    setSalonSelectorOpen(false);
    setStep(3);
  };

  const changeRebookService = () => {
    setStep(2);
    setSelectedTime("");
    setSelectedDate("");
    setSelectedDayKey("");
  };

  const resetBookingFlow = () => {
    const initialDateOption = dateOptions[0];

    setShowConfirmation(false);
    setError("");
    setStep(2);
    setSelectedServiceId(null);
    setSelectedTime("");
    setSelectedDate(initialDateOption?.value || "");
    setSelectedDayKey(initialDateOption?.dayKey || "");
    setClient({ name: "", phone: "", note: "" });
  };

  const rebookServiceSummary = isRebooking && selectedService && (
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
            {Number(selectedService.price || 0).toLocaleString()} դրամ ·{" "}
            {selectedService.duration || 20} min
          </div>
        </div>

        <Button onClick={changeRebookService} variant="outline">
          Change service
        </Button>
      </div>
    </div>
  );

  useEffect(() => {
    const resetId = window.setTimeout(() => {
      setShowConfirmation(false);
      setError("");
    }, 0);

    return () => window.clearTimeout(resetId);
  }, [barber?.id]);

  useEffect(() => {
    if (!hasActiveServices && step > 2) {
      setStep(2);
      setSelectedServiceId(null);
      setSelectedTime("");
    }
  }, [
    hasActiveServices,
    setSelectedServiceId,
    setSelectedTime,
    setStep,
    step,
  ]);

  useEffect(() => {
    const resetId = window.setTimeout(() => {
      setWaitlistSuccess(false);
    }, 0);

    return () => window.clearTimeout(resetId);
  }, [externalSelectedSalonId, selectedBarberId, selectedDate, selectedServiceEntityId]);

  // Reset date/time only when the selected salon actually changes.
  useEffect(() => {
    if (
      externalSelectedSalonId &&
      previousSalonIdRef.current !== externalSelectedSalonId
    ) {
      const initialDateOption = dateOptions[0];
      setSelectedDate(initialDateOption?.value || "");
      setSelectedDayKey(initialDateOption?.dayKey || "");
      setSelectedTime("");
    }
    previousSalonIdRef.current = externalSelectedSalonId;
  }, [
    dateOptions,
    externalSelectedSalonId,
    setSelectedDate,
    setSelectedDayKey,
    setSelectedTime,
  ]);

  const selectDate = (dateKey) => {
    const date = parseDateKey(dateKey);

    if (!date || dateKey < todayKey) return;

    const selectedOption = dateOptions.find((day) => day.value === dateKey);
    const dayKey = selectedOption?.dayKey || [
      "sun",
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
      "sat",
    ][date.getDay()];

    setSelectedDate(dateKey);
    setSelectedDayKey(dayKey);
    setSelectedTime("");
  };

  const submitBooking = async () => {
    if (
      isSaving ||
      !selectedBarberId ||
      !currentUser ||
      !selectedService ||
      !selectedTime
    ) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const salonId = getSalonId(selectedSalon) || externalSelectedSalonId || "";

      await createBooking({
        barberId: selectedBarberId,
        clientId: currentUser.id || currentUser._id,
        serviceId: selectedServiceEntityId,
        serviceName: selectedService.name,
        price: selectedService.price,
        duration: selectedService?.duration || 20,
        dayKey: selectedDateDayKey,
        bookingDate: selectedDate,
        time: selectedTime,
        status: "pending",
        clientName: client.name,
        phone: client.phone,
        note: client.note,
        salonId,
      });

      resetBookingFlow();
      navigate("/success");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not create booking. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="p-4 sm:p-6">
        {/* Salon context banner */}
        {selectedSalonName && (
          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <Store className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
              <span>
                Booking at <strong>{selectedSalonName}</strong>
                {hasMultipleSalons && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    Selected salon
                  </span>
                )}
              </span>
            </div>
            <p className="ml-6 mt-1 text-xs text-blue-600">
              Availability is based on this salon's schedule.
            </p>
          </div>
        )}

        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-1 sm:gap-2">
          {[
            { num: 1, label: "Service" },
            { num: 2, label: "Date & Time" },
            { num: 3, label: "Your Info" },
            { num: 4, label: "Confirm" },
          ].map((s, i) => {
            // step prop: 2=service, 3=date/time, 4=details, 0 after-confirm=done
            const currentStep = step === 0 ? 5 : step - 1; // map to 1-4
            const isDone = currentStep > s.num;
            const isActive = currentStep === s.num;
            return (
              <div key={s.num} className="flex items-center gap-1 sm:gap-2">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition sm:h-8 sm:w-8 sm:text-sm ${
                    isDone
                      ? "bg-neutral-900 text-white"
                      : isActive
                        ? "bg-neutral-900 text-white ring-2 ring-neutral-900/20"
                        : "bg-neutral-100 text-neutral-400"
                  }`}
                >
                  {isDone ? "✓" : s.num}
                </div>
                <span
                  className={`hidden text-xs font-medium sm:inline ${
                    isActive ? "text-neutral-900" : "text-neutral-400"
                  }`}
                >
                  {s.label}
                </span>
                {i < 3 && (
                  <div
                    className={`mx-0.5 h-px w-3 sm:mx-1 sm:w-6 ${
                      currentStep > s.num ? "bg-neutral-900" : "bg-neutral-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {step === 2 && (
          <ServiceStep
            services={services}
            selectedServiceId={selectedServiceId}
            onSelectService={(serviceId) => {
              setSelectedServiceId(serviceId);
              setSelectedTime("");
            }}
            onContinue={handleContinueAfterService}
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

            {/* Selected service summary */}
            {selectedService && !isRebooking && (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-neutral-500">SELECTED SERVICE</span>
                    <div className="mt-0.5 font-semibold text-neutral-950">
                      {selectedService.name || "Service"}
                    </div>
                    <div className="mt-0.5 text-sm text-neutral-600">
                      {Number(selectedService.price || 0).toLocaleString()} դրամ ·{" "}
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
              </div>
            )}

            {rebookServiceSummary}

            {/* Date selection */}
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Select date
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {(dateOptions || []).map((day) => (
                  <div key={day.value} className="flex-1 sm:flex-none">
                    <Button
                      className="w-full"
                      variant={selectedDate === day.value ? "default" : "outline"}
                      onClick={() => selectDate(day.value)}
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

            {/* Date picker fallback */}
            <label className="grid gap-2 text-sm font-semibold sm:max-w-xs">
              Or pick a custom date
              <input
                className="rounded-2xl border p-3 font-normal"
                min={todayKey}
                type="date"
                value={selectedDate}
                onChange={(event) => selectDate(event.target.value)}
              />
            </label>

            {/* Selected date/time display */}
            {selectedDate && selectedTime && (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <span className="font-semibold">Selected:</span>{" "}
                {selectedDateLabel || selectedDate} at {selectedTime}
              </div>
            )}

            {/* Time slots */}
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
                      onClick={() => setSelectedTime(time)}
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
                            You joined the waitlist. We'll notify you if a slot may open.
                          </p>
                        ) : (
                          <button
                            className="text-sm font-medium text-amber-600 underline underline-offset-2 hover:text-amber-800"
                            onClick={() => setShowWaitlistForm(true)}
                            type="button"
                          >
                            No suitable times? Join waitlist
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-2 sm:flex">
              <Button className="w-full sm:w-auto" variant="outline" onClick={() => setStep(2)}>
                Հետ
              </Button>

              <Button
                className="w-full sm:w-auto"
                disabled={!isSelectedTimeValid}
                onClick={() => setStep(4)}
              >
                Շարունակել
              </Button>
            </div>
          </div>
        )}

        {step === 4 && hasActiveServices && (
          <ClientDetailsStep
            client={client}
            canConfirm={canConfirmBooking}
            error={error}
            onChange={setClient}
            onBack={() => setStep(3)}
            onContinue={() => setShowConfirmation(true)}
            rebookSummary={rebookServiceSummary}
          />
        )}

        {/* Salon selector modal */}
        {salonSelectorOpen && (
          <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="max-h-[calc(100vh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:p-6">
              <div>
                <h2 className="text-xl font-bold sm:text-2xl">Choose a salon</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  This barber works at multiple salons. Select one for your booking.
                </p>
              </div>

              <div className="mt-5 space-y-3">
                {approvedSalons.map((salonEntry) => {
                  const salonData = salonEntry?.salon || salonEntry;
                  const salonId = salonData?.id || salonData?._id;
                  const salonName = salonData?.name || "Salon";
                  const isPrimary = salonEntry?.isPrimary;

                  return (
                    <button
                      key={salonId}
                      onClick={() => handleSalonSelect(salonEntry)}
                      className="w-full rounded-2xl border border-neutral-200 p-4 text-left shadow-sm transition hover:bg-neutral-50"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-neutral-950">
                            {salonName}
                          </div>
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
                  onClick={() => setSalonSelectorOpen(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        <BookingConfirmationModal
          isOpen={showConfirmation}
          onClose={resetBookingFlow}
          onConfirm={submitBooking}
          selectedService={selectedService}
          selectedDate={selectedDateLabel || selectedDate}
          selectedTime={selectedTime}
          selectedSalonName={selectedSalonName}
          barberName={barber?.name || "Barber"}
          canConfirm={canConfirmBooking}
          isSubmitting={isSaving}
          error={error}
        />

        {showWaitlistForm && selectedBarberId && selectedService && selectedDate && (
          <WaitlistForm
            barberId={selectedBarberId}
            salonId={getSalonId(selectedSalon) || externalSelectedSalonId || ""}
            serviceId={selectedServiceEntityId}
            date={selectedDate}
            onClose={() => setShowWaitlistForm(false)}
            onSuccess={() => {
              setShowWaitlistForm(false);
              setWaitlistSuccess(true);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
