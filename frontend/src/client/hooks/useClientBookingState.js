import { useCallback, useEffect, useState } from "react";

export function useClientBookingState({
  barberId,
  selectedDate,
  selectedServiceEntityId,
  externalSelectedSalonId,
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [showWaitlistForm, setShowWaitlistForm] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);
  const [referenceFiles, setReferenceFiles] = useState([]);
  const [consultation, setConsultation] = useState(null);
  const [consent, setConsent] = useState(null);
  const [voucherCode, setVoucherCode] = useState("");

  useEffect(() => {
    const resetId = window.setTimeout(() => {
      setWaitlistSuccess(false);
    }, 0);

    return () => window.clearTimeout(resetId);
  }, [externalSelectedSalonId, barberId, selectedDate, selectedServiceEntityId]);

  const resetBookingExtras = useCallback(() => {
    setShowWaitlistForm(false);
    setWaitlistSuccess(false);
    setReferenceFiles([]);
    setConsultation(null);
    setConsent(null);
    setVoucherCode("");
  }, []);

  return {
    consultation,
    consent,
    error,
    isSaving,
    referenceFiles,
    resetBookingExtras,
    setConsultation,
    setConsent,
    setError,
    setIsSaving,
    setReferenceFiles,
    setShowWaitlistForm,
    setVoucherCode,
    setWaitlistSuccess,
    showWaitlistForm,
    voucherCode,
    waitlistSuccess,
  };
}
