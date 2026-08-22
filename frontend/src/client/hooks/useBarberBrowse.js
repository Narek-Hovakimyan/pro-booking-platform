import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import api from "@/shared/api/axios";

const PAGE_LIMIT = 24;
const AVAILABILITY_STATUS = { LOADING: "loading", READY: "ready" };

const getBarberId = (barber) => barber?.id || barber?._id;
const mapByBarberId = (items = []) => Object.fromEntries(
  items.map((item) => [String(item?.barberId || ""), item]).filter(([id]) => id)
);

const normalizeSummary = (summary = {}) => {
  const barbers = Array.isArray(summary.barbers) ? summary.barbers : [];
  const availability = mapByBarberId(summary.availability || []);
  const reviewStatsByBarberId = mapByBarberId(summary.reviewStats || []);

  return {
    barbers,
    services: Array.isArray(summary.services) ? summary.services : [],
    reviewStatsByBarberId,
    firstAvailableSlotByBarberId: Object.fromEntries(
      Object.entries(availability).map(([id, item]) => [id, item?.firstAvailableSlot || null])
    ),
    availabilityStatusByBarberId: Object.fromEntries(
      barbers.map((barber) => {
        const id = String(getBarberId(barber) || "");
        return [id, availability[id]?.status || AVAILABILITY_STATUS.READY];
      }).filter(([id]) => id)
    ),
  };
};

const queryParams = (filters, page) => ({
  page,
  limit: PAGE_LIMIT,
  ...(filters.name ? { name: filters.name } : {}),
  ...(filters.city ? { city: filters.city } : {}),
  ...(filters.serviceName ? { serviceName: filters.serviceName } : {}),
  ...(filters.category ? { category: filters.category } : {}),
  ...(filters.minPrice ? { minPrice: filters.minPrice } : {}),
  ...(filters.maxPrice ? { maxPrice: filters.maxPrice } : {}),
  ...(filters.discountOnly ? { discountOnly: "true" } : {}),
  ...(filters.rating ? { rating: filters.rating } : {}),
  ...(filters.profession ? { profession: filters.profession } : {}),
  ...(filters.barberType ? { barberType: filters.barberType } : {}),
});

const mergeSummary = (current, incoming) => {
  const knownIds = new Set(current.barbers.map((barber) => String(getBarberId(barber))));
  const addedBarbers = incoming.barbers.filter((barber) => !knownIds.has(String(getBarberId(barber))));
  const barberIds = new Set([...current.barbers, ...addedBarbers].map((barber) => String(getBarberId(barber))));
  const mergeServices = (items, additions) => {
    const byId = new Map(items.map((item) => [String(item?.id || item?._id), item]));
    additions.forEach((item) => byId.set(String(item?.id || item?._id), item));
    return [...byId.values()].filter((item) => barberIds.has(String(item?.barberId)));
  };

  return {
    barbers: [...current.barbers, ...addedBarbers],
    services: mergeServices(current.services, incoming.services),
    reviewStatsByBarberId: { ...current.reviewStatsByBarberId, ...incoming.reviewStatsByBarberId },
    firstAvailableSlotByBarberId: { ...current.firstAvailableSlotByBarberId, ...incoming.firstAvailableSlotByBarberId },
    availabilityStatusByBarberId: { ...current.availabilityStatusByBarberId, ...incoming.availabilityStatusByBarberId },
  };
};

const emptySummary = () => ({
  barbers: [], services: [], reviewStatsByBarberId: {}, firstAvailableSlotByBarberId: {}, availabilityStatusByBarberId: {},
});

export function useBarberBrowse(filters) {
  const filtersKey = JSON.stringify(filters);
  const activeFilters = useMemo(() => JSON.parse(filtersKey), [filtersKey]);
  const requestId = useRef(0);
  const [summary, setSummary] = useState(emptySummary);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async (nextPage, replace) => {
    const id = requestId.current + 1;
    requestId.current = id;
    if (replace) {
      setSummary(emptySummary());
      setPage(1);
      setHasMore(true);
    }
    setIsLoading(true);
    setError("");
    try {
      const { data } = await api.get("/barbers/card-summary", { params: queryParams(activeFilters, nextPage) });
      if (requestId.current !== id) return;
      const incoming = normalizeSummary(data);
      setSummary((current) => replace ? incoming : mergeSummary(current, incoming));
      setPage(nextPage);
      setHasMore(incoming.barbers.length === PAGE_LIMIT);
    } catch (requestError) {
      if (requestId.current === id) {
        setError(requestError.response?.data?.message || "Could not load specialists. Please try again.");
      }
    } finally {
      if (requestId.current === id) setIsLoading(false);
    }
  }, [activeFilters]);

  useEffect(() => {
    Promise.resolve().then(() => load(1, true));
    return () => { requestId.current += 1; };
  }, [filtersKey, load]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) load(page + 1, false);
  }, [hasMore, isLoading, load, page]);

  return useMemo(() => ({ ...summary, page, isLoading, error, hasMore, loadMore }), [summary, page, isLoading, error, hasMore, loadMore]);
}

export { PAGE_LIMIT };
