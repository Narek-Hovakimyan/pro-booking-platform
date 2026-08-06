import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import api from "@/shared/api/axios";
import {
  EVENT_TYPE_LABELS,
  getEventType,
  getRegistrationEventId,
} from "@/features/events/utils/eventFormatters";
import {
  normalizeSalonList,
} from "@/utils/eventFormUtils";

export function useEventsPageData({ currentUserId, selectedEventSyncRef }) {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [salons, setSalons] = useState([]);
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [myOwnedSalons, setMyOwnedSalons] = useState([]);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [filterSalonId, setFilterSalonId] = useState("");
  const [filterPrice, setFilterPrice] = useState("");
  const [filterType, setFilterType] = useState("");
  const mountedRef = useRef(true);
  const eventRequestIdRef = useRef(0);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const loadEvents = useCallback(async () => {
    const requestId = ++eventRequestIdRef.current;
    setIsLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ status: "upcoming" });
      if (search) params.append("search", search);
      if (filterSalonId) params.append("salonId", filterSalonId);

      const { data } = await api.get(`/events?${params}`);
      if (!mountedRef.current || requestId !== eventRequestIdRef.current) return;
      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      if (!mountedRef.current || requestId !== eventRequestIdRef.current) return;
      setError(err.response?.data?.message || "Could not load events");
    } finally {
      if (mountedRef.current && requestId === eventRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [filterSalonId, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    async function fetchSalons() {
      try {
        const { data } = await api.get("/salons");
        if (mountedRef.current) {
          setSalons(Array.isArray(data) ? data : []);
        }
      } catch {
        // ignore
      }
    }

    void fetchSalons();
  }, []);

  useEffect(() => {
    if (!currentUserId) return undefined;

    let active = true;

    async function fetchManageableSalons() {
      try {
        const { data } = await api.get("/salons/mine/manageable");
        if (active) {
          setMyOwnedSalons(normalizeSalonList(data));
        }
      } catch {
        if (active) setMyOwnedSalons([]);
      }
    }

    void fetchManageableSalons();

    return () => {
      active = false;
    };
  }, [currentUserId]);

  const refreshMyRegistrations = useCallback(async () => {
    if (!currentUserId) return;

    try {
      const { data } = await api.get("/events/my-registrations");
      if (mountedRef.current) {
        setMyRegistrations(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    let active = true;

    async function loadMyRegistrations() {
      try {
        const { data } = await api.get("/events/my-registrations");
        if (active) {
          setMyRegistrations(Array.isArray(data) ? data : []);
        }
      } catch {
        // ignore
      }
    }

    void loadMyRegistrations();

    return () => {
      active = false;
    };
  }, [currentUserId]);

  const myRegistrationsByEventId = useMemo(() => {
    const registrationsByEventId = new Map();

    for (const registration of myRegistrations || []) {
      const eventId = getRegistrationEventId(registration);
      if (!eventId) continue;
      registrationsByEventId.set(String(eventId), registration);
    }

    return registrationsByEventId;
  }, [myRegistrations]);

  const filteredEvents = useMemo(() => {
    let result = events;

    if (filterPrice === "free") {
      result = result.filter((event) => !event.price || event.price === 0);
    } else if (filterPrice === "paid") {
      result = result.filter((event) => event.price && event.price > 0);
    }

    if (filterType) {
      result = result.filter((event) => getEventType(event) === filterType);
    }

    return result;
  }, [events, filterPrice, filterType]);

  const resetFilters = useCallback(() => {
    setSearch("");
    setFilterSalonId("");
    setFilterPrice("");
    setFilterType("");
  }, []);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    Boolean(filterSalonId) ||
    Boolean(filterPrice) ||
    Boolean(filterType);
  const activeFiltersCount =
    (search.trim() ? 1 : 0) +
    (filterSalonId ? 1 : 0) +
    (filterPrice ? 1 : 0) +
    (filterType ? 1 : 0);

  const filterChips = [
    search.trim()
      ? { label: `Search: ${search.trim()}`, onRemove: () => setSearch("") }
      : null,
    filterSalonId
      ? {
          label: `Salon: ${salons.find((salon) => salon._id === filterSalonId)?.name || filterSalonId}`,
          onRemove: () => setFilterSalonId(""),
        }
      : null,
    filterPrice
      ? { label: `Price: ${filterPrice}`, onRemove: () => setFilterPrice("") }
      : null,
    filterType
      ? {
          label: `Type: ${EVENT_TYPE_LABELS[filterType] || filterType}`,
          onRemove: () => setFilterType(""),
        }
      : null,
  ].filter(Boolean);

  const canManageEvent = useCallback(
    (event) =>
      Boolean(
        event &&
          currentUserId &&
          (String(event?.organizerId?._id || event?.organizerId) ===
            String(currentUserId) ||
            myOwnedSalons.some(
              (salon) =>
                String(salon?._id || salon?.id) ===
                String(event?.salonId?._id || event?.salonId)
            ))
      ),
    [currentUserId, myOwnedSalons]
  );

  const syncEventRegistrationCount = useCallback((eventId, registrationCount) => {
    setEvents((prev) =>
      prev.map((event) =>
        event._id === eventId ? { ...event, registrationCount } : event
      )
    );
    selectedEventSyncRef?.current?.(eventId, registrationCount);
  }, [selectedEventSyncRef]);

  const refreshEvents = useCallback(() => loadEvents(), [loadEvents]);

  return {
    activeFiltersCount,
    canCreateEvents: Boolean(currentUserId && myOwnedSalons.length > 0),
    canManageEvent,
    error,
    events,
    filteredEvents,
    filterChips,
    filterPrice,
    filterSalonId,
    filterType,
    hasActiveFilters,
    isFilterDrawerOpen,
    isLoading,
    myOwnedSalons,
    myRegistrations,
    myRegistrationsByEventId,
    refreshEvents,
    refreshMyRegistrations,
    resetFilters,
    salons,
    search,
    setFilterPrice,
    setFilterSalonId,
    setFilterType,
    setIsFilterDrawerOpen,
    setSearch,
    syncEventRegistrationCount,
  };
}
