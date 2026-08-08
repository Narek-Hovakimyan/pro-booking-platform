import { useCallback, useEffect, useRef, useState } from "react";

import api from "@/shared/api/axios";
import { buildClientBookingQuotePayload } from "@/client/utils/clientBookingPayload";

export function useClientBookingConfirmation({
  barberId,
  client,
  currentUser,
  isSaving,
  onRefreshServices,
  selectedBarberId,
  selectedDate,
  selectedDateDayKey,
  selectedService,
  selectedServiceEntityId,
  selectedTime,
  selectedBookingSalonId,
  isSelectedTimeValid,
  setError,
  setSelectedTime,
  setStep,
  voucherCode,
}) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationService, setConfirmationService] = useState(null);
  const [bookingQuote, setBookingQuote] = useState(null);
  const [isPreparingConfirmation, setIsPreparingConfirmation] = useState(false);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useEffect(() => {
    const resetId = window.setTimeout(() => {
      setShowConfirmation(false);
      setError("");
    }, 0);

    return () => window.clearTimeout(resetId);
  }, [barberId, setError]);

  const resetConfirmationFlow = useCallback(() => {
    requestIdRef.current += 1;
    setShowConfirmation(false);
    setConfirmationService(null);
    setBookingQuote(null);
    setIsPreparingConfirmation(false);
    setIsQuoteLoading(false);
    setQuoteError("");
  }, []);

  const clearBookingQuote = useCallback(() => {
    setBookingQuote(null);
    setQuoteError("");
  }, []);

  const canPrepareConfirmation = Boolean(
    selectedBarberId &&
      selectedServiceEntityId &&
      selectedDate &&
      selectedDateDayKey &&
      selectedTime &&
      isSelectedTimeValid &&
      currentUser &&
      selectedService &&
      client.name?.trim() &&
      client.phone?.trim() &&
      !isSaving &&
      !isPreparingConfirmation
  );

  const canSubmitConfirmation = Boolean(
    selectedBarberId &&
      selectedServiceEntityId &&
      selectedDate &&
      selectedDateDayKey &&
      selectedTime &&
      isSelectedTimeValid &&
      currentUser &&
      (confirmationService || selectedService) &&
      bookingQuote &&
      !isQuoteLoading &&
      client.name?.trim() &&
      client.phone?.trim() &&
      !isSaving
  );

  const confirmDisabledReason = [
    !selectedBarberId && "No specialist selected",
    !selectedServiceEntityId && "No service selected",
    !selectedDate && "No date selected",
    !selectedTime && "Please select a time first.",
    selectedTime && !isSelectedTimeValid && "Selected time is no longer available.",
    !currentUser && "Please log in to confirm.",
    !selectedService && "Selected service is no longer available.",
    !client.name?.trim() && "Please enter your name.",
    !client.phone?.trim() && "Please enter your phone number.",
    isSaving && "Booking in progress…",
    isPreparingConfirmation && "Preparing booking details…",
    isQuoteLoading && "Calculating final price…",
    quoteError && "Final price could not be calculated.",
  ]
    .filter(Boolean)
    .join(" ");

  const canRenderConfirmationModal = Boolean(
    showConfirmation && selectedTime && isSelectedTimeValid
  );

  const openConfirmation = useCallback(async () => {
    if (isPreparingConfirmation) return;

    if (!selectedTime || !isSelectedTimeValid) {
      setError("Please select a time first.");
      setShowConfirmation(false);
      setStep(3);
      return;
    }

    if (!canPrepareConfirmation) return;

    const requestId = ++requestIdRef.current;
    setIsPreparingConfirmation(true);
    setError("");

    try {
      const latestServices = await onRefreshServices?.();
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      const latestSelectedService = Array.isArray(latestServices)
        ? latestServices.find(
            (service) =>
              String(service?.id || service?._id) === String(selectedServiceEntityId)
          )
        : selectedService;

      if (!latestSelectedService || latestSelectedService.active === false) {
        setError(
          "Selected service is no longer available. Please choose another service."
        );
        setStep(2);
        setSelectedTime("");
        setConfirmationService(null);
        return;
      }

      if (!selectedTime || !isSelectedTimeValid) {
        setError("Please select a time first.");
        setShowConfirmation(false);
        setStep(3);
        return;
      }

      setConfirmationService(latestSelectedService);
      clearBookingQuote();
      setShowConfirmation(true);
      setIsQuoteLoading(true);

      const { data: quote } = await api.post(
        "/bookings/quote",
        buildClientBookingQuotePayload({
          barberId: selectedBarberId,
          serviceId: selectedServiceEntityId,
          bookingDate: selectedDate,
          dayKey: selectedDateDayKey,
          time: selectedTime,
          voucherCode: voucherCode || undefined,
          selectedSalonId: selectedBookingSalonId,
        })
      );

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      setBookingQuote(quote);
    } catch (requestError) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      const message =
        requestError.response?.data?.message ||
        requestError.message ||
        "Could not refresh service price. Please try again.";
      setQuoteError(message);
      setError(message);
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setIsPreparingConfirmation(false);
        setIsQuoteLoading(false);
      }
    }
  }, [
    canPrepareConfirmation,
    clearBookingQuote,
    isPreparingConfirmation,
    isSelectedTimeValid,
    onRefreshServices,
    selectedBarberId,
    selectedBookingSalonId,
    selectedDate,
    selectedDateDayKey,
    selectedService,
    selectedServiceEntityId,
    selectedTime,
    setSelectedTime,
    setError,
    setStep,
    voucherCode,
  ]);

  return {
    bookingQuote,
    canPrepareConfirmation,
    canRenderConfirmationModal,
    canSubmitConfirmation,
    clearBookingQuote,
    confirmDisabledReason,
    confirmationService,
    isPreparingConfirmation,
    isQuoteLoading,
    openConfirmation,
    quoteError,
    resetConfirmationFlow,
    setBookingQuote,
    setConfirmationService,
    setIsPreparingConfirmation,
    setIsQuoteLoading,
    setQuoteError,
    setShowConfirmation,
    showConfirmation,
  };
}
