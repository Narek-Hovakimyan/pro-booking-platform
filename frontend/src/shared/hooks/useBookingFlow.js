import { useCallback, useMemo, useState } from "react";

export function useBookingFlow({ currentUser, currentUserRole }) {
  const [step, setStep] = useState(2);
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [selectedDayKey, setSelectedDayKey] = useState("mon");
  const [selectedTime, setSelectedTime] = useState("");
  const [client, setClient] = useState({ name: "", phone: "", note: "" });

  const bookingClient = useMemo(
    () =>
      currentUserRole === "client"
        ? {
            ...client,
            name: client.name || currentUser.name,
            phone: client.phone || currentUser.phone,
          }
        : client,
    [client, currentUser, currentUserRole]
  );

  const startBooking = useCallback(() => {
    setStep(2);
  }, []);

  const resetBooking = useCallback(() => {
    setStep(2);
    setSelectedServiceId(null);
    setSelectedTime("");
    setClient({ name: "", phone: "", note: "" });
  }, []);

  return {
    step,
    setStep,
    selectedServiceId,
    setSelectedServiceId,
    selectedDayKey,
    setSelectedDayKey,
    selectedTime,
    setSelectedTime,
    client,
    setClient,
    bookingClient,
    startBooking,
    resetBooking,
  };
}