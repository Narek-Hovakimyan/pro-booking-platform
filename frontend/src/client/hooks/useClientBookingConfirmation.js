import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import api from "@/shared/api/axios";
import { buildClientBookingQuotePayload } from "@/client/utils/clientBookingPayload";

export const CLIENT_BOOKING_REQUEST_TIMEOUT_MS = 15_000;

const getBookingRequestErrorMessage = (requestError) => {
  const isTimeout = [requestError?.code, requestError?.cause?.code].some(
    (code) => code === "ECONNABORTED" || code === "ETIMEDOUT"
  );

  if (isTimeout) return "Price refresh timed out. Please try again.";

  return (
    requestError?.response?.data?.message ||
    (requestError?.response ? requestError.message : null) ||
    "Could not refresh service price. Please try again."
  );
};

const getConfirmationContextKey = ({
  barberId,
  client,
  currentUser,
  selectedBarberId,
  selectedBookingSalonId,
  selectedDate,
  selectedDateDayKey,
  selectedService,
  selectedServiceEntityId,
  selectedTime,
  isSelectedTimeValid,
  voucherCode,
}) => JSON.stringify({
  barberId: barberId || "",
  clientId: currentUser?.id || currentUser?._id || "",
  clientRole: currentUser?.role || "",
  clientName: client?.name || "",
  clientNote: client?.note || "",
  clientPhone: client?.phone || "",
  dayKey: selectedDateDayKey || "",
  salonId: selectedBookingSalonId || "",
  selectedBarberId: selectedBarberId || "",
  serviceId: selectedServiceEntityId || "",
  serviceActive: selectedService?.active,
  serviceDuration: selectedService?.duration || "",
  serviceName: selectedService?.name || "",
  servicePrice: selectedService?.price || "",
  time: selectedTime || "",
  timeIsValid: Boolean(isSelectedTimeValid),
  voucherCode: voucherCode || "",
  bookingDate: selectedDate || "",
});

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
  const contextGenerationRef = useRef(0);
  const openLockRef = useRef(false);
  const requestIdRef = useRef(0);
  const confirmationContextKey = getConfirmationContextKey({
    barberId,
    client,
    currentUser,
    selectedBarberId,
    selectedBookingSalonId,
    selectedDate,
    selectedDateDayKey,
    selectedService,
    selectedServiceEntityId,
    selectedTime,
    isSelectedTimeValid,
    voucherCode,
  });
  const currentContextKeyRef = useRef(confirmationContextKey);

  const clearQuoteState = useCallback(() => {
    setBookingQuote(null);
    setQuoteError("");
  }, []);

  const invalidateConfirmationRequest = useCallback((shouldClearLoading = true) => {
    requestIdRef.current += 1;
    openLockRef.current = false;
    if (shouldClearLoading) {
      setIsPreparingConfirmation(false);
      setIsQuoteLoading(false);
    }
  }, []);

  useLayoutEffect(() => {
    if (currentContextKeyRef.current === confirmationContextKey) return;

    currentContextKeyRef.current = confirmationContextKey;
    contextGenerationRef.current += 1;
    invalidateConfirmationRequest();
    setShowConfirmation(false);
    setConfirmationService(null);
    clearQuoteState();
    setError("");
  }, [
    clearQuoteState,
    confirmationContextKey,
    invalidateConfirmationRequest,
    setError,
  ]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      contextGenerationRef.current += 1;
      invalidateConfirmationRequest(false);
    };
  }, [invalidateConfirmationRequest]);

  const resetConfirmationFlow = useCallback(() => {
    invalidateConfirmationRequest();
    setShowConfirmation(false);
    setConfirmationService(null);
    clearQuoteState();
  }, [clearQuoteState, invalidateConfirmationRequest]);

  const clearBookingQuote = useCallback(() => {
    invalidateConfirmationRequest();
    clearQuoteState();
  }, [clearQuoteState, invalidateConfirmationRequest]);

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
    if (isPreparingConfirmation || openLockRef.current) return;

    if (!selectedTime || !isSelectedTimeValid) {
      setError("Please select a time first.");
      setShowConfirmation(false);
      setStep(3);
      return;
    }

    if (!canPrepareConfirmation) return;

    const requestId = ++requestIdRef.current;
    const requestContextGeneration = contextGenerationRef.current;
    const isCurrentRequest = () => (
      mountedRef.current &&
      requestId === requestIdRef.current &&
      requestContextGeneration === contextGenerationRef.current &&
      currentContextKeyRef.current === confirmationContextKey
    );
    openLockRef.current = true;
    setIsPreparingConfirmation(true);
    setError("");

    try {
      const latestServices = await onRefreshServices?.({
        timeout: CLIENT_BOOKING_REQUEST_TIMEOUT_MS,
      });
      if (!isCurrentRequest()) {
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
      clearQuoteState();
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
        }),
        { timeout: CLIENT_BOOKING_REQUEST_TIMEOUT_MS }
      );

      if (!isCurrentRequest()) {
        return;
      }

      setBookingQuote(quote);
    } catch (requestError) {
      if (!isCurrentRequest()) {
        return;
      }

      const message = getBookingRequestErrorMessage(requestError);
      setQuoteError(message);
      setError(message);
    } finally {
      if (isCurrentRequest()) {
        openLockRef.current = false;
        setIsPreparingConfirmation(false);
        setIsQuoteLoading(false);
      }
    }
  }, [
    canPrepareConfirmation,
    clearQuoteState,
    confirmationContextKey,
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
