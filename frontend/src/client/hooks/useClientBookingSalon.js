import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getApprovedClientBookingSalons,
  getClientBookingSalonId,
  getClientBookingSalonName,
  normalizeClientBookingSalonId,
  getClientBookingSelectedSalon,
} from "@/client/utils/clientBookingPayload";

export function useClientBookingSalon({
  barber,
  dateOptions,
  externalSelectedSalonId,
  onSalonSelect,
  setSelectedDate,
  setSelectedDayKey,
  setSelectedTime,
  setStep,
}) {
  const [salonSelectorOpen, setSalonSelectorOpen] = useState(false);
  const previousSalonIdRef = useRef(externalSelectedSalonId);

  const approvedSalons = useMemo(
    () => getApprovedClientBookingSalons(barber),
    [barber]
  );

  const selectedBookingSalonId = normalizeClientBookingSalonId(externalSelectedSalonId);
  const selectedSalon = useMemo(
    () => getClientBookingSelectedSalon(barber, selectedBookingSalonId),
    [barber, selectedBookingSalonId]
  );
  const selectedSalonName = getClientBookingSalonName(selectedSalon);
  const hasMultipleSalons = approvedSalons.length > 1;

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

  const handleContinueAfterService = useCallback(() => {
    if (hasMultipleSalons && !externalSelectedSalonId) {
      setSalonSelectorOpen(true);
    } else {
      setStep(3);
    }
  }, [externalSelectedSalonId, hasMultipleSalons, setStep]);

  const handleSalonSelect = useCallback(
    (salonEntry) => {
      const salonId = getClientBookingSalonId(salonEntry);
      onSalonSelect?.(salonId);
      setSalonSelectorOpen(false);
      setStep(3);
    },
    [onSalonSelect, setStep]
  );

  return {
    approvedSalons,
    dateOptions,
    hasMultipleSalons,
    handleContinueAfterService,
    handleSalonSelect,
    selectedBookingSalonId,
    selectedSalon,
    selectedSalonName,
    salonSelectorOpen,
    setSalonSelectorOpen,
  };
}
