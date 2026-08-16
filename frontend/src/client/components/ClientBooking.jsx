import { useEffect, useRef } from "react";

import {
  getArmeniaDayKey,
  getArmeniaTodayKey,
  isBeforeArmeniaToday,
  isDateKey,
} from "@/shared/utils/dates";
import { getServicePriceInfo } from "@/shared/data/serviceCategories";
import { useBooking } from "@/shared/hooks/useBooking";
import { useClientBookingState } from "@/client/hooks/useClientBookingState";
import { useClientBookingSalon } from "@/client/hooks/useClientBookingSalon";
import { useClientBookingVoucher } from "@/client/hooks/useClientBookingVoucher";
import { useClientBookingConfirmation } from "@/client/hooks/useClientBookingConfirmation";
import { useClientBookingSubmission } from "@/client/hooks/useClientBookingSubmission";
import ClientBookingStepContent from "@/client/components/booking/ClientBookingStepContent";

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
  onPriceAdjustmentChange,
  isServiceDataLoading = false,
  onRefreshServices,
}) {
  const { createBooking } = useBooking();
  const selectedBarberId = barber?._id || barber?.id || "";
  const selectedServiceEntityId =
    selectedService?._id || selectedService?.id || selectedServiceId || "";
  const todayKey = getArmeniaTodayKey();
  const safeServices = services || [];
  const activeServices = safeServices.filter((service) => service?.active);
  const hasActiveServices = activeServices.length > 0;
  const selectedDateDayKey =
    selectedDayKey || (isDateKey(selectedDate) ? getArmeniaDayKey(selectedDate) : "");
  const selectedServicePriceInfo = getServicePriceInfo(selectedService);

  const bookingState = useClientBookingState({
    barberId: selectedBarberId,
    externalSelectedSalonId,
    selectedDate,
    selectedServiceEntityId,
  });
  const { setShowWaitlistForm, showWaitlistForm } = bookingState;

  const salon = useClientBookingSalon({
    barber,
    dateOptions,
    externalSelectedSalonId,
    onSalonSelect,
    setSelectedDate,
    setSelectedDayKey,
    setSelectedTime,
    setStep,
  });

  const confirmation = useClientBookingConfirmation({
    barberId: selectedBarberId,
    client,
    currentUser,
    isSaving: bookingState.isSaving,
    onRefreshServices,
    selectedBarberId,
    selectedDate,
    selectedDateDayKey,
    selectedService,
    selectedServiceEntityId,
    selectedTime,
    selectedBookingSalonId: salon.selectedBookingSalonId,
    isSelectedTimeValid,
    setError: bookingState.setError,
    setSelectedTime,
    setStep,
    voucherCode: bookingState.voucherCode,
  });

  const voucher = useClientBookingVoucher({
    selectedBarberId,
    selectedServiceEntityId,
    selectedSalonId: salon.selectedBookingSalonId,
    voucherCode: bookingState.voucherCode,
    setVoucherCode: bookingState.setVoucherCode,
    clearBookingQuote: confirmation.clearBookingQuote,
    setQuoteError: confirmation.setQuoteError,
  });

  const resetBookingFlow = useRef(null);
  const handleResetBookingFlow = () => resetBookingFlow.current?.();

  const submission = useClientBookingSubmission({
    client,
    consent: bookingState.consent,
    consultation: bookingState.consultation,
    createBooking,
    currentUser,
    isSaving: bookingState.isSaving,
    onResetBookingFlow: handleResetBookingFlow,
    referenceFiles: bookingState.referenceFiles,
    selectedBarberId,
    selectedBookingSalonId: salon.selectedBookingSalonId,
    selectedDate,
    selectedDateDayKey,
    selectedService,
    selectedServiceEntityId,
    selectedTime,
    setError: bookingState.setError,
    setIsSaving: bookingState.setIsSaving,
    isSelectedTimeValid,
    voucherCode: bookingState.voucherCode,
  });

  const canPrepareConfirmation =
    confirmation.canPrepareConfirmation && !isServiceDataLoading;

  const handleSelectService = (serviceId) => {
    confirmation.setConfirmationService(null);
    setSelectedServiceId(serviceId);
    setSelectedTime("");
  };

  const handleSelectDate = (day) => {
    if (!isDateKey(day.value) || isBeforeArmeniaToday(day.value)) return;
    setSelectedDate(day.value);
    setSelectedDayKey(day.dayKey || getArmeniaDayKey(day.value));
    setSelectedTime("");
    confirmation.clearBookingQuote();
    bookingState.setError("");
  };

  const handleSelectCustomDate = (value) => {
    if (!isDateKey(value) || isBeforeArmeniaToday(value)) return;
    setSelectedDate(value);
    setSelectedDayKey(getArmeniaDayKey(value));
    setSelectedTime("");
    confirmation.clearBookingQuote();
    bookingState.setError("");
  };

  const handleSelectTime = (time) => {
    setSelectedTime(time);
    confirmation.clearBookingQuote();
    bookingState.setError("");
  };

  const handleContinueToClientDetails = () => {
    if (isServiceDataLoading) return;
    if (!selectedTime || !isSelectedTimeValid) {
      bookingState.setError("Please select a time first.");
      setStep(3);
      return;
    }

    bookingState.setError("");
    setStep(4);
  };

  const handleBackToServiceSelection = () => {
    setStep(2);
  };

  const handleChangeRebookService = () => {
    setStep(2);
    setSelectedTime("");
    setSelectedDate("");
    setSelectedDayKey("");
  };

  const handleOpenWaitlistForm = () => setShowWaitlistForm(true);
  const handleCloseWaitlistForm = () => setShowWaitlistForm(false);
  const handleCancelSalonSelector = () => salon.setSalonSelectorOpen(false);
  const handleWaitlistSuccess = () => {
    setShowWaitlistForm(false);
    bookingState.setWaitlistSuccess(true);
  };

  const handleOpenConfirmation = () => {
    if (isServiceDataLoading) return;
    confirmation.openConfirmation();
  };

  useEffect(() => {
    if (!onPriceAdjustmentChange) return;

    onPriceAdjustmentChange({
      discountPreview: voucher.discountPreview,
      pricingQuote: confirmation.bookingQuote,
      voucherCode: bookingState.voucherCode,
    });
  }, [
    bookingState.voucherCode,
    confirmation.bookingQuote,
    onPriceAdjustmentChange,
    voucher.discountPreview,
  ]);

  useEffect(() => {
    resetBookingFlow.current = () => {
      const initialDateOption = dateOptions[0];
      confirmation.resetConfirmationFlow();
      voucher.removeVoucher();
      bookingState.resetBookingExtras();
      bookingState.setError("");
      setStep(2);
      setSelectedServiceId(null);
      setSelectedTime("");
      setSelectedDate(initialDateOption?.value || "");
      setSelectedDayKey(initialDateOption?.dayKey || "");
      setClient({ name: "", phone: "", note: "" });
    };
  }, [
    bookingState,
    confirmation,
    dateOptions,
    setClient,
    setSelectedDate,
    setSelectedDayKey,
    setSelectedServiceId,
    setSelectedTime,
    setStep,
    voucher,
  ]);

  useEffect(() => {
    if (isServiceDataLoading) return;
    if (!hasActiveServices && step > 2) {
      setStep(2);
      setSelectedServiceId(null);
      setSelectedTime("");
    }
  }, [
    hasActiveServices,
    isServiceDataLoading,
    setSelectedServiceId,
    setSelectedTime,
    setStep,
    step,
  ]);

  useEffect(() => {
    if (!showWaitlistForm) return undefined;

    const onEscape = (event) => {
      if (event.key === "Escape") {
        setShowWaitlistForm(false);
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [setShowWaitlistForm, showWaitlistForm]);

  return (
    <ClientBookingStepContent
      barber={barber}
      step={step}
      bookingState={bookingState}
      canPrepareConfirmation={canPrepareConfirmation}
      client={client}
      confirmation={confirmation}
      isRebooking={isRebooking}
      isSelectedTimeValid={isSelectedTimeValid}
      isServiceDataLoading={isServiceDataLoading}
      nonWorkingDays={nonWorkingDays}
      onBackToServiceSelection={handleBackToServiceSelection}
      onChangeService={handleChangeRebookService}
      onCancelSalonSelector={handleCancelSalonSelector}
      onCloseWaitlistForm={handleCloseWaitlistForm}
      onClientChange={setClient}
      onConfirmBooking={submission.submitBooking}
      onContinueToClientDetails={handleContinueToClientDetails}
      onOpenWaitlistForm={handleOpenWaitlistForm}
      onOpenConfirmation={handleOpenConfirmation}
      onResetBookingFlow={handleResetBookingFlow}
      onSelectCustomDate={handleSelectCustomDate}
      onSelectDate={handleSelectDate}
      onSelectService={handleSelectService}
      onSelectTime={handleSelectTime}
      onWaitlistSuccess={handleWaitlistSuccess}
      availableSlots={availableSlots}
      dateOptions={salon.dateOptions}
      selectedDate={selectedDate}
      selectedDateLabel={selectedDateLabel}
      selectedService={selectedService}
      selectedServiceId={selectedServiceId}
      selectedServicePriceInfo={selectedServicePriceInfo}
      selectedSalon={salon.selectedSalon}
      selectedSalonName={salon.selectedSalonName}
      selectedTime={selectedTime}
      salon={salon}
      services={safeServices}
      showWaitlistForm={showWaitlistForm}
      slotMessage={slotMessage}
      todayKey={todayKey}
      voucher={voucher}
    />
  );
}
