import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "@/shared/api/axios";

import {
  DEFAULT_CLIENT_FILTERS,
  buildClientFilterChips,
  createDefaultClientFilters,
  filterClients,
} from "./clientFilters";

const DEFAULT_LOYALTY_DISCOUNT_SETTINGS = Object.freeze({
  enabled: false,
  thresholdCompletedBookings: 5,
  discountPercent: 10,
  maxDiscountPercent: 30,
});

export default function useClientsData() {
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const clientsRequestRef = useRef(0);
  const loyaltySettingsRequestRef = useRef(0);
  const [clients, setClients] = useState([]);
  const [searchQuery, setSearchQuery] = useState(DEFAULT_CLIENT_FILTERS.searchQuery);
  const [visitType, setVisitType] = useState(DEFAULT_CLIENT_FILTERS.visitType);
  const [upcomingFilter, setUpcomingFilter] = useState(
    DEFAULT_CLIENT_FILTERS.upcomingFilter
  );
  const [lastVisitFilter, setLastVisitFilter] = useState(
    DEFAULT_CLIENT_FILTERS.lastVisitFilter
  );
  const [totalSpentRange, setTotalSpentRange] = useState(
    createDefaultClientFilters().totalSpentRange
  );
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isLoyaltySettingsOpen, setIsLoyaltySettingsOpen] = useState(false);
  const [loyaltySettings, setLoyaltySettings] = useState(
    DEFAULT_LOYALTY_DISCOUNT_SETTINGS
  );
  const [loyaltySettingsDraft, setLoyaltySettingsDraft] = useState(
    DEFAULT_LOYALTY_DISCOUNT_SETTINGS
  );
  const [isSavingLoyaltySettings, setIsSavingLoyaltySettings] = useState(false);
  const [loyaltySettingsError, setLoyaltySettingsError] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [loyaltyDraft, setLoyaltyDraft] = useState({
    isVip: false,
    internalNote: "",
  });
  const [isSavingLoyalty, setIsSavingLoyalty] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const requestId = ++clientsRequestRef.current;
    let isMounted = true;

    async function fetchClients() {
      setIsLoading(true);
      setError("");

      try {
        const { data } = await api.get("/barbers/me/clients");
        if (isMounted && clientsRequestRef.current === requestId) {
          setClients(Array.isArray(data) ? data : []);
        }
      } catch (requestError) {
        if (isMounted && clientsRequestRef.current === requestId) {
          setError(
            requestError.response?.data?.message ||
              "Could not load clients. Please try again."
          );
        }
      } finally {
        if (isMounted && clientsRequestRef.current === requestId) {
          setIsLoading(false);
        }
      }
    }

    fetchClients();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const requestId = ++loyaltySettingsRequestRef.current;
    let isMounted = true;

    async function fetchLoyaltySettings() {
      try {
        const { data } = await api.get("/barbers/me/loyalty-discount-settings");
        const nextSettings = {
          ...DEFAULT_LOYALTY_DISCOUNT_SETTINGS,
          ...(data || {}),
        };

        if (isMounted && loyaltySettingsRequestRef.current === requestId) {
          setLoyaltySettings(nextSettings);
          setLoyaltySettingsDraft(nextSettings);
        }
      } catch {
        if (isMounted && loyaltySettingsRequestRef.current === requestId) {
          setLoyaltySettingsError("Could not load loyalty discount settings.");
        }
      }
    }

    fetchLoyaltySettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const clearFilters = () => {
    setSearchQuery(DEFAULT_CLIENT_FILTERS.searchQuery);
    setVisitType(DEFAULT_CLIENT_FILTERS.visitType);
    setUpcomingFilter(DEFAULT_CLIENT_FILTERS.upcomingFilter);
    setLastVisitFilter(DEFAULT_CLIENT_FILTERS.lastVisitFilter);
    setTotalSpentRange({ ...createDefaultClientFilters().totalSpentRange });
  };

  const openLoyaltySettings = () => {
    setLoyaltySettingsDraft({ ...loyaltySettings });
    setLoyaltySettingsError("");
    setIsLoyaltySettingsOpen(true);
  };

  const closeLoyaltySettings = () => setIsLoyaltySettingsOpen(false);

  const updateLoyaltySettingsDraft = (field, value) => {
    setLoyaltySettingsDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveLoyaltySettings = async () => {
    if (!mountedRef.current) return;

    setIsSavingLoyaltySettings(true);
    setLoyaltySettingsError("");

    try {
      const payload = {
        enabled: Boolean(loyaltySettingsDraft.enabled),
        thresholdCompletedBookings: Number(
          loyaltySettingsDraft.thresholdCompletedBookings
        ),
        discountPercent: Number(loyaltySettingsDraft.discountPercent),
        maxDiscountPercent: Number(loyaltySettingsDraft.maxDiscountPercent),
      };
      const { data } = await api.patch(
        "/barbers/me/loyalty-discount-settings",
        payload
      );
      const nextSettings = {
        ...DEFAULT_LOYALTY_DISCOUNT_SETTINGS,
        ...(data || payload),
      };

      if (!mountedRef.current) return;

      setLoyaltySettings(nextSettings);
      setLoyaltySettingsDraft(nextSettings);
      setIsLoyaltySettingsOpen(false);
    } catch (requestError) {
      if (!mountedRef.current) return;

      setLoyaltySettingsError(
        requestError.response?.data?.message ||
          "Could not save loyalty discount settings."
      );
    } finally {
      if (mountedRef.current) {
        setIsSavingLoyaltySettings(false);
      }
    }
  };

  const filterChips = useMemo(
    () =>
      buildClientFilterChips({
        searchQuery,
        visitType,
        upcomingFilter,
        lastVisitFilter,
        totalSpentRange,
        onClearSearch: () => setSearchQuery(""),
        onClearVisitType: () => setVisitType(""),
        onClearUpcomingFilter: () => setUpcomingFilter(""),
        onClearLastVisitFilter: () => setLastVisitFilter(""),
        onClearMinSpent: () =>
          setTotalSpentRange((current) => ({ ...current, min: "" })),
        onClearMaxSpent: () =>
          setTotalSpentRange((current) => ({ ...current, max: "" })),
      }),
    [lastVisitFilter, searchQuery, totalSpentRange, upcomingFilter, visitType]
  );

  const filteredClients = useMemo(
    () =>
      filterClients(clients, {
        searchQuery,
        visitType,
        upcomingFilter,
        lastVisitFilter,
        totalSpentRange,
      }),
    [clients, lastVisitFilter, searchQuery, totalSpentRange, upcomingFilter, visitType]
  );

  const openMessage = (client) => {
    if (!client?.clientId) return;

    navigate(client.messagePath || `/messages/${client.clientId}`, {
      state: {
        user: {
          id: client.clientId,
          name: client.clientName,
          phone: client.phone,
          role: "client",
        },
      },
    });
  };

  const openClientDetails = (client) => {
    setSelectedClient(client);
    setLoyaltyDraft({
      isVip: Boolean(client?.loyalty?.isVip),
      internalNote: client?.loyalty?.internalNote || "",
    });
    setLoyaltyError("");
  };

  const closeClientDetails = () => {
    setSelectedClient(null);
    setLoyaltyError("");
  };

  const saveClientLoyalty = async () => {
    if (!selectedClient?.clientId) return;
    if (!mountedRef.current) return;

    setIsSavingLoyalty(true);
    setLoyaltyError("");

    try {
      const { data } = await api.patch(
        `/barbers/me/clients/${selectedClient.clientId}/loyalty`,
        loyaltyDraft
      );
      const nextLoyalty = data?.loyalty || {
        isVip: Boolean(loyaltyDraft.isVip),
        internalNote: loyaltyDraft.internalNote.trim(),
        updatedAt: null,
      };

      if (!mountedRef.current) return;

      setClients((currentClients) =>
        currentClients.map((client) =>
          client.clientId === selectedClient.clientId
            ? { ...client, loyalty: nextLoyalty }
            : client
        )
      );
      setSelectedClient((currentClient) =>
        currentClient
          ? { ...currentClient, loyalty: nextLoyalty }
          : currentClient
      );
      setLoyaltyDraft({
        isVip: Boolean(nextLoyalty.isVip),
        internalNote: nextLoyalty.internalNote || "",
      });
    } catch (requestError) {
      if (!mountedRef.current) return;

      setLoyaltyError(
        requestError.response?.data?.message ||
          "Could not save client loyalty settings."
      );
    } finally {
      if (mountedRef.current) {
        setIsSavingLoyalty(false);
      }
    }
  };

  return {
    clients,
    searchQuery,
    setSearchQuery,
    visitType,
    setVisitType,
    upcomingFilter,
    setUpcomingFilter,
    lastVisitFilter,
    setLastVisitFilter,
    totalSpentRange,
    setTotalSpentRange,
    clearFilters,
    isFilterDrawerOpen,
    setIsFilterDrawerOpen,
    isLoyaltySettingsOpen,
    openLoyaltySettings,
    closeLoyaltySettings,
    loyaltySettings,
    loyaltySettingsDraft,
    updateLoyaltySettingsDraft,
    isSavingLoyaltySettings,
    loyaltySettingsError,
    saveLoyaltySettings,
    selectedClient,
    openClientDetails,
    closeClientDetails,
    openMessage,
    loyaltyDraft,
    setLoyaltyDraft,
    isSavingLoyalty,
    loyaltyError,
    saveClientLoyalty,
    isLoading,
    error,
    filterChips,
    filteredClients,
    hasActiveFilters: filterChips.length > 0,
    activeFiltersCount: filterChips.length,
  };
}
