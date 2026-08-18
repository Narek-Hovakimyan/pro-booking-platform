import { useEffect, useRef, useState } from "react";

import SalonPromotionsManager from "@/barber/components/SalonPromotionsManager";
import { getSalonSubscription } from "@/shared/api/subscriptions";

export default function PromotionSettingsView({
  effectivePromotionSalonId,
  error,
  isLoading,
  managedSalons,
  selectedPromotionSalon,
  onSelectedPromotionSalonChange,
}) {
  const selectedSalonId =
    selectedPromotionSalon?.id || selectedPromotionSalon?._id || "";
  const requestIdRef = useRef(0);
  const [entitlement, setEntitlement] = useState({
    salonId: "",
    status: "loading",
  });

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!selectedSalonId) {
      return undefined;
    }

    let isActive = true;

    getSalonSubscription(selectedSalonId)
      .then((response) => {
        if (!isActive || requestId !== requestIdRef.current) return;

        setEntitlement({
          salonId: selectedSalonId,
          status: response?.subscription?.isActive === true ? "active" : "denied",
        });
      })
      .catch(() => {
        if (!isActive || requestId !== requestIdRef.current) return;
        setEntitlement({ salonId: selectedSalonId, status: "denied" });
      });

    return () => {
      isActive = false;
    };
  }, [selectedSalonId]);

  const isCheckingEntitlement =
    Boolean(selectedSalonId) &&
    (entitlement.salonId !== selectedSalonId || entitlement.status === "loading");
  const hasActiveEntitlement =
    entitlement.salonId === selectedSalonId && entitlement.status === "active";

  return (
    <>
      <h2 className="text-xl font-bold sm:text-2xl">Salon Promotions</h2>
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {isLoading ? (
        <p className="text-neutral-500">Loading...</p>
      ) : managedSalons.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
          You need to own or administer a salon to manage salon
          promotions.
        </p>
      ) : (
        <>
          {managedSalons.length > 1 && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <label className="text-sm font-semibold text-neutral-700">
                Select salon
              </label>
              <select
                className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                onChange={(event) =>
                  onSelectedPromotionSalonChange(event.target.value)
                }
                value={
                  effectivePromotionSalonId
                }
              >
                {managedSalons.map((salon) => {
                  const salonId = salon.id || salon._id;
                  return (
                    <option key={salonId} value={salonId}>
                      {salon.name || "Salon"}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {isCheckingEntitlement && (
            <p className="text-neutral-500">Checking salon subscription...</p>
          )}

          {selectedPromotionSalon && !isCheckingEntitlement && !hasActiveEntitlement && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              An active salon subscription is required to manage promotions for
              this salon.
            </p>
          )}

          {selectedPromotionSalon && hasActiveEntitlement && (
            <SalonPromotionsManager
              salonId={selectedSalonId}
              salonName={selectedPromotionSalon.name || "Salon"}
            />
          )}
        </>
      )}
    </>
  );
}
