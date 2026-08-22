import { useEffect, useMemo, useRef, useState } from "react";

import api from "@/shared/api/axios";
import { canBookAgain, getBookingBarberId, sortBookingsDescending } from "@/client/utils/bookingStatusUtils";
import { AVAILABILITY_STATUS, getBarberId, mapByBarberId, uniqueById } from "@/client/utils/favoriteHelpers";

const emptySummary = {
  barbersById: {}, servicesByBarberId: {}, reviewStatsByBarberId: {},
  firstAvailableSlotByBarberId: {}, availabilityStatusByBarberId: {},
};

const toBarberIds = (favorites, clientId) => [...new Set((favorites || [])
  .filter((favorite) => favorite?.type !== "salon" && String(favorite?.clientId) === String(clientId))
  .map((favorite) => getBarberId(favorite.barber) || getBarberId(favorite.barberId) || favorite.barberId)
  .filter(Boolean)
  .map(String))];

export const normalizeFavoriteRemovalId = (entityId) => {
  if (entityId === null || entityId === undefined) return null;
  if (typeof entityId === "object") return entityId.id || entityId._id || null;
  return String(entityId).trim() || null;
};

export const getFavoriteRemovalKey = (clientId, type, entityId) => {
  const normalizedClientId = normalizeFavoriteRemovalId(clientId);
  const normalizedId = normalizeFavoriteRemovalId(entityId);
  return normalizedClientId && normalizedId ? `${normalizedClientId}:${type}:${normalizedId}` : null;
};

export const getVisibleFavoriteBarbers = ({ favorites, users, clientId, barbersById, hasLoadedCardSummary }) => uniqueById(
  (favorites || []).filter((favorite) => favorite?.type !== "salon" && String(favorite?.clientId) === String(clientId))
    .map((favorite) => {
      const fallback = favorite.barber || (users || []).find((user) => user.role === "barber" && String(user.id) === String(favorite.barberId));
      const barberId = getBarberId(favorite.barber) || getBarberId(fallback) || String(favorite.barberId);
      const summary = barbersById[String(barberId)];
      if (hasLoadedCardSummary && !summary) return null;
      return { ...fallback, ...summary, id: getBarberId(summary) || barberId };
    }).filter(Boolean)
);

export const getEligibleBookingByBarberId = (bookings, clientId) => {
  const result = {};
  (bookings || []).filter((booking) => String(booking.clientId) === String(clientId) && canBookAgain(booking))
    .sort(sortBookingsDescending).forEach((booking) => {
      const barberId = getBookingBarberId(booking);
      if (barberId && !result[barberId]) result[barberId] = booking;
    });
  return result;
};

export function useFavoriteBarberSummaries({ favorites, clientId }) {
  const barberIds = useMemo(() => toBarberIds(favorites, clientId), [favorites, clientId]);
  const idsKey = barberIds.join(",");
  const requestId = useRef(0);
  const [summary, setSummary] = useState(emptySummary);
  const [loadedIdsKey, setLoadedIdsKey] = useState(null);

  useEffect(() => {
    const id = requestId.current + 1;
    requestId.current = id;
    if (!clientId || !idsKey) {
      Promise.resolve().then(() => {
        if (requestId.current !== id) return;
        setSummary(emptySummary);
        setLoadedIdsKey(idsKey);
      });
      return undefined;
    }
    api.get("/barbers/card-summary", { params: { barberIds: idsKey } })
      .then(({ data = {} }) => {
        if (requestId.current !== id) return;
        const availability = mapByBarberId(data.availability || []);
        const barbersById = Object.fromEntries((data.barbers || []).map((barber) => [String(getBarberId(barber)), barber]));
        const servicesByBarberId = (data.services || []).reduce((result, service) => {
          const barberId = String(service?.barberId || "");
          if (barberId) result[barberId] = [...(result[barberId] || []), service];
          return result;
        }, {});
        setSummary({
          barbersById, servicesByBarberId, reviewStatsByBarberId: mapByBarberId(data.reviewStats || []),
          firstAvailableSlotByBarberId: Object.fromEntries(Object.entries(availability).map(([barberId, item]) => [barberId, item?.firstAvailableSlot || null])),
          availabilityStatusByBarberId: Object.fromEntries(Object.keys(barbersById).map((barberId) => [barberId, availability[barberId]?.status || AVAILABILITY_STATUS.READY])),
        });
      })
      .catch(() => { if (requestId.current === id) setSummary(emptySummary); })
      .finally(() => { if (requestId.current === id) setLoadedIdsKey(idsKey); });
    return () => { requestId.current += 1; };
  }, [clientId, idsKey]);

  return { ...summary, hasLoadedCardSummary: loadedIdsKey === idsKey };
}
