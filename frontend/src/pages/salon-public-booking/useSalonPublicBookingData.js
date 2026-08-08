import { useEffect, useState } from "react";

import { getPublicSalonBooking } from "@/shared/api/publicSalonBooking";

export function useSalonPublicBookingData(salonId) {
  const [salon, setSalon] = useState(null);
  const [barbers, setBarbers] = useState([]);
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setError("");

      try {
        const data = await getPublicSalonBooking(salonId);

        if (!isMounted) return;

        setSalon(data.salon || null);
        setBarbers(data.barbers || []);
        setServices(data.services || []);
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Could not load salon booking data."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    if (salonId) {
      load();
    }

    return () => {
      isMounted = false;
    };
  }, [salonId]);

  return {
    salon,
    barbers,
    services,
    isLoading,
    error,
  };
}
