import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { getFriendlyApiError } from "@/shared/api/errors";
import { buildClientBookingSubmissionPayload } from "@/client/utils/clientBookingPayload";

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

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

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

    submitLockRef.current = true;
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
      if (!mountedRef.current) {
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
      if (!mountedRef.current) {
        return;
      }

      setError(
        getFriendlyApiError(
          requestError,
          "Could not create booking. Please try again."
        )
      );
    } finally {
      if (mountedRef.current) {
        setIsSaving(false);
      }

      window.setTimeout(() => {
        submitLockRef.current = false;
      }, 0);
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
    voucherCode,
  ]);

  return {
    submitBooking,
  };
}
