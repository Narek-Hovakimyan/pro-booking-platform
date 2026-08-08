import { useState } from "react";

import { useBooking } from "@/shared/hooks/useBooking";
import api from "@/shared/api/axios";
import { getFriendlyApiError } from "@/shared/api/errors";

export function useSalonBookingSubmission({
  salonId,
  currentUser,
  selectedBarber,
  selectedService,
  selectedDate,
  selectedDateDayKey,
  validSelectedTime,
  client,
}) {
  const { createBooking } = useBooking();
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState({ type: "", message: "" });
  const [validatedPromo, setValidatedPromo] = useState(null);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingPayment, setBookingPayment] = useState(null);

  const resetPromoState = () => {
    setPromoCode("");
    setValidatedPromo(null);
    setPromoStatus({ type: "", message: "" });
  };

  const resetBookingFlow = () => {
    setBookingSuccess(false);
    setBookingPayment(null);
    setSubmitError("");
  };

  const handleApplyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;

    setValidatingPromo(true);
    setPromoStatus({ type: "", message: "" });

    try {
      const res = await api.post(`/salons/${salonId}/promotions/validate`, {
        code,
        serviceId: selectedService?.id || selectedService?._id,
        barberId: selectedBarber?.id || selectedBarber?._id,
      });

      if (res.data.valid) {
        setValidatedPromo(res.data);
        setPromoStatus({
          type: "success",
          message: `${res.data.promotion.title} applied! ${res.data.discountAmount > 0 ? `Save ${Number(res.data.discountAmount).toLocaleString()} դր.` : ""}`,
        });
      }
    } catch (err) {
      setValidatedPromo(null);
      setPromoStatus({
        type: "error",
        message: err.response?.data?.message || "Invalid promo code",
      });
    } finally {
      setValidatingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    resetPromoState();
  };

  const submitBooking = async () => {
    if (
      isSaving ||
      !currentUser ||
      !selectedBarber ||
      !selectedService ||
      !selectedDate ||
      !selectedDateDayKey ||
      !validSelectedTime
    ) {
      return;
    }

    setIsSaving(true);
    setSubmitError("");

    try {
      const barberId = selectedBarber.id || selectedBarber._id;
      const serviceEntityId = selectedService.id || selectedService._id;

      const bookingPayload = {
        barberId,
        clientId: currentUser.id || currentUser._id,
        serviceId: serviceEntityId,
        serviceName: selectedService.name,
        price: selectedService.price,
        duration: selectedService?.duration || 20,
        dayKey: selectedDateDayKey,
        bookingDate: selectedDate,
        time: validSelectedTime,
        status: "pending",
        clientName: client.name,
        phone: client.phone,
        note: client.note,
        salonId,
      };

      if (validatedPromo) {
        bookingPayload.promotionCode = validatedPromo.promotion?.code;
      }

      const createdBooking = await createBooking(bookingPayload);

      setBookingPayment(createdBooking?.payment || createdBooking?.depositPayment || null);
      setBookingSuccess(true);
      return createdBooking;
    } catch (requestError) {
      setSubmitError(
        getFriendlyApiError(
          requestError,
          "Could not create booking. Please try again."
        )
      );
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const canConfirmBooking = Boolean(
    currentUser &&
      (selectedBarber?.id || selectedBarber?._id) &&
      selectedService &&
      selectedDate &&
      selectedDateDayKey &&
      validSelectedTime &&
      client.name &&
      client.phone &&
      !isSaving
  );
  const confirmDisabledReason = [
    !currentUser && "Please log in to confirm.",
    !(selectedBarber?.id || selectedBarber?._id) && "No specialist selected",
    !selectedService && "No service selected",
    !selectedDate && "No date selected",
    !selectedDateDayKey && "Invalid date.",
    !validSelectedTime && "Please select a time first.",
    !client.name && "Please enter your name.",
    !client.phone && "Please enter your phone number.",
    isSaving && "Booking in progress…",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    promoCode,
    setPromoCode,
    promoStatus,
    validatedPromo,
    validatingPromo,
    handleApplyPromo,
    handleRemovePromo,
    submitBooking,
    canConfirmBooking,
    confirmDisabledReason,
    isSaving,
    submitError,
    bookingSuccess,
    bookingPayment,
    resetBookingFlow,
    resetPromoState,
  };
}
