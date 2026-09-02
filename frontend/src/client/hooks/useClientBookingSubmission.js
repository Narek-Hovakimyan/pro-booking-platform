import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { getFriendlyApiError } from "@/shared/api/errors";
import { buildClientBookingSubmissionPayload } from "@/client/utils/clientBookingPayload";

function getSubmissionContextKey({
  client,
  consultation,
  consent,
  currentUser,
  referenceFiles,
  selectedBarberId,
  selectedBookingSalonId,
  selectedDate,
  selectedDateDayKey,
  selectedService,
  selectedServiceEntityId,
  selectedTime,
  voucherCode,
}) {
  return JSON.stringify({
    barberId: selectedBarberId || "",
    salonId: selectedBookingSalonId || "",
    serviceId: selectedServiceEntityId || selectedService?._id || "",
    serviceActive: selectedService?.active,
    serviceName: selectedService?.name || "",
    serviceDuration: selectedService?.duration || "",
    servicePrice: selectedService?.price || "",
    bookingDate: selectedDate || "",
    dayKey: selectedDateDayKey || "",
    time: selectedTime || "",
    voucherCode: voucherCode || "",
    currentUserId: currentUser?.id || currentUser?._id || "",
    currentUserRole: currentUser?.role || "",
    clientName: client?.name || "",
    clientPhone: client?.phone || "",
    clientNote: client?.note || "",
    consultation: consultation || null,
    consent: consent || null,
    referenceFiles: referenceFiles?.map(({ lastModified, name, size, type }) => ({
      lastModified,
      name,
      size,
      type,
    })) || [],
  });
}

export function useClientBookingSubmission({
  client,
  consent,
  consultation,
  createBooking,
  currentUser,
  isSaving,
  onResetBookingFlow,
  referenceFiles,
  selectedBarberId,
  selectedBookingSalonId,
  selectedDate,
  selectedDateDayKey,
  selectedService,
  selectedServiceEntityId,
  selectedTime,
  setError,
  setIsSaving,
  isSelectedTimeValid,
  voucherCode,
}) {
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const submitLockRef = useRef(false);
  const activeRequestIdRef = useRef(null);
  const contextGenerationRef = useRef(0);
  const nextRequestIdRef = useRef(0);
  const submissionContextKey = getSubmissionContextKey({
    client,
    consultation,
    consent,
    currentUser,
    referenceFiles,
    selectedBarberId,
    selectedBookingSalonId,
    selectedDate,
    selectedDateDayKey,
    selectedService,
    selectedServiceEntityId,
    selectedTime,
    voucherCode,
  });
  const submissionContextKeyRef = useRef(submissionContextKey);

  useLayoutEffect(() => {
    if (submissionContextKeyRef.current === submissionContextKey) {
      return;
    }

    submissionContextKeyRef.current = submissionContextKey;
    contextGenerationRef.current += 1;

    if (activeRequestIdRef.current !== null) {
      activeRequestIdRef.current = null;
      submitLockRef.current = false;
      setIsSaving(false);
    }
  }, [setIsSaving, submissionContextKey]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      contextGenerationRef.current += 1;
      activeRequestIdRef.current = null;
      submitLockRef.current = false;
    };
  }, []);

  const submitBooking = useCallback(async () => {
    if (
      isSaving ||
      submitLockRef.current ||
      !selectedBarberId ||
      !currentUser ||
      !selectedService ||
      !selectedDate ||
      !selectedDateDayKey ||
      !selectedTime ||
      !isSelectedTimeValid ||
      !client.name?.trim() ||
      !client.phone?.trim()
    ) {
      return;
    }

    if (submissionContextKeyRef.current !== submissionContextKey) {
      return;
    }

    const requestId = nextRequestIdRef.current + 1;
    nextRequestIdRef.current = requestId;
    const requestGeneration = contextGenerationRef.current;
    const isCurrentRequest = () => (
      mountedRef.current &&
      activeRequestIdRef.current === requestId &&
      contextGenerationRef.current === requestGeneration &&
      submissionContextKeyRef.current === submissionContextKey
    );

    submitLockRef.current = true;
    activeRequestIdRef.current = requestId;
    setIsSaving(true);
    setError("");

    try {
      const bookingPayload = buildClientBookingSubmissionPayload({
        barberId: selectedBarberId,
        clientId: currentUser.id || currentUser._id,
        serviceId: selectedServiceEntityId,
        serviceName: selectedService.name,
        duration: selectedService?.duration || 20,
        dayKey: selectedDateDayKey,
        bookingDate: selectedDate,
        time: selectedTime,
        clientName: client.name,
        phone: client.phone,
        note: client.note,
        referenceFiles,
        consultation,
        consent,
        voucherCode,
        selectedSalonId: selectedBookingSalonId,
      });

      const createdBooking = await createBooking(bookingPayload);
      if (!isCurrentRequest()) {
        return;
      }

      onResetBookingFlow();
      navigate("/success", {
        state: {
          booking: createdBooking,
          payment: createdBooking?.payment || createdBooking?.depositPayment || null,
        },
      });
    } catch (requestError) {
      if (!isCurrentRequest()) {
        return;
      }

      setError(
        getFriendlyApiError(
          requestError,
          "Could not create booking. Please try again."
        )
      );
    } finally {
      if (isCurrentRequest()) {
        activeRequestIdRef.current = null;
        submitLockRef.current = false;
        setIsSaving(false);
      }
    }
  }, [
    client.name,
    client.note,
    client.phone,
    consultation,
    consent,
    createBooking,
    currentUser,
    isSaving,
    isSelectedTimeValid,
    navigate,
    onResetBookingFlow,
    referenceFiles,
    selectedBarberId,
    selectedBookingSalonId,
    selectedDate,
    selectedDateDayKey,
    selectedService,
    selectedServiceEntityId,
    selectedTime,
    setError,
    setIsSaving,
    submissionContextKey,
    voucherCode,
  ]);

  return {
    submitBooking,
  };
}
