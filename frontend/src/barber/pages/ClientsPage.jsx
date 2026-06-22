import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Percent, SlidersHorizontal, Star } from "lucide-react";

import ClientsFiltersPanel from "@/barber/components/clients/ClientsFiltersPanel";
import api from "@/shared/api/axios";
import Drawer from "@/shared/components/common/Drawer";
import EmptyState from "@/shared/components/common/EmptyState";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

const formatCurrency = (amount) =>
  `${Number(amount || 0).toLocaleString()} դրամ`;

const formatBookingLabel = (booking) => {
  if (!booking?.date) return "None";

  const pieces = [booking.date];
  if (booking.time) pieces.push(booking.time);
  if (booking.serviceName) pieces.push(booking.serviceName);

  return pieces.join(" · ");
};

const normalizeSearch = (value) =>
  String(value || "").trim().toLowerCase();

const DEFAULT_CLIENT_FILTERS = Object.freeze({
  searchQuery: "",
  visitType: "",
  upcomingFilter: "",
  lastVisitFilter: "",
  totalSpentRange: Object.freeze({
    min: "",
    max: "",
  }),
});

const DEFAULT_LOYALTY_DISCOUNT_SETTINGS = Object.freeze({
  enabled: false,
  thresholdCompletedBookings: 5,
  discountPercent: 10,
  maxDiscountPercent: 30,
});

const getFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const getFilterNumber = (value) => {
  if (String(value ?? "").trim() === "") return null;
  return getFiniteNumber(value);
};

const getClientVisitCount = (client) => {
  const totalBookings = getFiniteNumber(client?.bookingCount);
  if (totalBookings !== null) return totalBookings;

  return getFiniteNumber(client?.completedBookingsCount) || 0;
};

const hasUpcomingBooking = (client) => Boolean(client?.nextBooking?.date);

const getDaysSinceDate = (dateValue) => {
  if (!dateValue) return null;

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.floor((today.getTime() - date.getTime()) / 86400000);
};

export default function ClientsPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [searchQuery, setSearchQuery] = useState(
    DEFAULT_CLIENT_FILTERS.searchQuery
  );
  const [visitType, setVisitType] = useState(DEFAULT_CLIENT_FILTERS.visitType);
  const [upcomingFilter, setUpcomingFilter] = useState(
    DEFAULT_CLIENT_FILTERS.upcomingFilter
  );
  const [lastVisitFilter, setLastVisitFilter] = useState(
    DEFAULT_CLIENT_FILTERS.lastVisitFilter
  );
  const [totalSpentRange, setTotalSpentRange] = useState({
    ...DEFAULT_CLIENT_FILTERS.totalSpentRange,
  });
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isLoyaltySettingsOpen, setIsLoyaltySettingsOpen] = useState(false);
  const [loyaltySettings, setLoyaltySettings] = useState({
    ...DEFAULT_LOYALTY_DISCOUNT_SETTINGS,
  });
  const [loyaltySettingsDraft, setLoyaltySettingsDraft] = useState({
    ...DEFAULT_LOYALTY_DISCOUNT_SETTINGS,
  });
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
    let isMounted = true;

    async function fetchClients() {
      setIsLoading(true);
      setError("");

      try {
        const { data } = await api.get("/barbers/me/clients");
        if (isMounted) setClients(Array.isArray(data) ? data : []);
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Could not load clients. Please try again."
          );
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchClients();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function fetchLoyaltySettings() {
      try {
        const { data } = await api.get("/barbers/me/loyalty-discount-settings");
        const nextSettings = {
          ...DEFAULT_LOYALTY_DISCOUNT_SETTINGS,
          ...(data || {}),
        };

        if (isMounted) {
          setLoyaltySettings(nextSettings);
          setLoyaltySettingsDraft(nextSettings);
        }
      } catch {
        if (isMounted) {
          setLoyaltySettingsError("Could not load loyalty discount settings.");
        }
      }
    }

    fetchLoyaltySettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleTotalSpentRangeChange = (field, value) => {
    setTotalSpentRange((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const clearFilters = () => {
    setSearchQuery(DEFAULT_CLIENT_FILTERS.searchQuery);
    setVisitType(DEFAULT_CLIENT_FILTERS.visitType);
    setUpcomingFilter(DEFAULT_CLIENT_FILTERS.upcomingFilter);
    setLastVisitFilter(DEFAULT_CLIENT_FILTERS.lastVisitFilter);
    setTotalSpentRange({ ...DEFAULT_CLIENT_FILTERS.totalSpentRange });
  };

  const openLoyaltySettings = () => {
    setLoyaltySettingsDraft({ ...loyaltySettings });
    setLoyaltySettingsError("");
    setIsLoyaltySettingsOpen(true);
  };

  const updateLoyaltySettingsDraft = (field, value) => {
    setLoyaltySettingsDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveLoyaltySettings = async () => {
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

      setLoyaltySettings(nextSettings);
      setLoyaltySettingsDraft(nextSettings);
      setIsLoyaltySettingsOpen(false);
    } catch (requestError) {
      setLoyaltySettingsError(
        requestError.response?.data?.message ||
          "Could not save loyalty discount settings."
      );
    } finally {
      setIsSavingLoyaltySettings(false);
    }
  };

  const filterChips = useMemo(() => {
    const chips = [];

    if (searchQuery.trim()) {
      chips.push({
        label: `Search: ${searchQuery.trim()}`,
        onRemove: () => setSearchQuery(""),
      });
    }

    if (visitType) {
      chips.push({
        label:
          visitType === "first-time"
            ? "First-time clients"
            : "Returning clients",
        onRemove: () => setVisitType(""),
      });
    }

    if (upcomingFilter) {
      chips.push({
        label:
          upcomingFilter === "has-upcoming"
            ? "Has upcoming booking"
            : "No upcoming booking",
        onRemove: () => setUpcomingFilter(""),
      });
    }

    if (lastVisitFilter) {
      const labels = {
        "last-30": "Last 30 days",
        "last-90": "Last 90 days",
        "no-recent": "No recent visit",
      };
      chips.push({
        label: labels[lastVisitFilter],
        onRemove: () => setLastVisitFilter(""),
      });
    }

    if (totalSpentRange.min) {
      chips.push({
        label: `Min spent: ${formatCurrency(totalSpentRange.min)}`,
        onRemove: () =>
          setTotalSpentRange((current) => ({ ...current, min: "" })),
      });
    }

    if (totalSpentRange.max) {
      chips.push({
        label: `Max spent: ${formatCurrency(totalSpentRange.max)}`,
        onRemove: () =>
          setTotalSpentRange((current) => ({ ...current, max: "" })),
      });
    }

    return chips;
  }, [lastVisitFilter, searchQuery, totalSpentRange, upcomingFilter, visitType]);

  const hasActiveFilters = filterChips.length > 0;
  const activeFiltersCount = filterChips.length;

  const filteredClients = useMemo(() => {
    const query = normalizeSearch(searchQuery);
    const minSpent = getFilterNumber(totalSpentRange.min);
    const maxSpent = getFilterNumber(totalSpentRange.max);

    return clients.filter((client) => {
      const name = normalizeSearch(client.clientName);
      const phone = normalizeSearch(client.phone);
      const visitCount = getClientVisitCount(client);
      const spent = getFiniteNumber(client.totalSpent) || 0;
      const daysSinceLastVisit = getDaysSinceDate(client?.lastBooking?.date);

      if (query && !name.includes(query) && !phone.includes(query)) {
        return false;
      }

      if (visitType === "first-time" && visitCount > 1) return false;
      if (visitType === "returning" && visitCount <= 1) return false;

      if (upcomingFilter === "has-upcoming" && !hasUpcomingBooking(client)) {
        return false;
      }

      if (upcomingFilter === "no-upcoming" && hasUpcomingBooking(client)) {
        return false;
      }

      if (lastVisitFilter === "last-30") {
        if (daysSinceLastVisit === null || daysSinceLastVisit > 30) return false;
      }

      if (lastVisitFilter === "last-90") {
        if (daysSinceLastVisit === null || daysSinceLastVisit > 90) return false;
      }

      if (lastVisitFilter === "no-recent") {
        if (daysSinceLastVisit !== null && daysSinceLastVisit <= 90) {
          return false;
        }
      }

      if (minSpent !== null && spent < minSpent) return false;
      if (maxSpent !== null && spent > maxSpent) return false;

      return true;
    });
  }, [
    clients,
    lastVisitFilter,
    searchQuery,
    totalSpentRange,
    upcomingFilter,
    visitType,
  ]);

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
      setLoyaltyError(
        requestError.response?.data?.message ||
          "Could not save client loyalty settings."
      );
    } finally {
      setIsSavingLoyalty(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Clients
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Clients who have booked with you.
          </p>
        </div>

        <div className="grid gap-2 sm:flex sm:items-center">
          <Button
            className="relative w-full sm:w-auto"
            onClick={() => setIsFilterDrawerOpen(true)}
            variant="outline"
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                {activeFiltersCount}
              </span>
            )}
          </Button>
          <Button
            className="w-full gap-2 sm:w-auto"
            onClick={openLoyaltySettings}
            variant="outline"
          >
            <Percent className="h-4 w-4" />
            Loyalty discount
          </Button>
          {hasActiveFilters && (
            <Button
              className="w-full sm:w-auto"
              onClick={clearFilters}
              variant="outline"
            >
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm font-medium text-neutral-600">
        Showing {filteredClients.length} of {clients.length} clients
      </p>

      <Drawer
        closeLabel="Close filters"
        description="Refine the client list instantly."
        footer={
          <>
            <Button onClick={() => setIsFilterDrawerOpen(false)}>
              Apply filters
            </Button>
            <Button onClick={clearFilters} variant="outline">
              Clear filters
            </Button>
          </>
        }
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        title="Filters"
      >
        <ClientsFiltersPanel
          filterChips={filterChips}
          lastVisitFilter={lastVisitFilter}
          onLastVisitFilterChange={setLastVisitFilter}
          onSearchChange={setSearchQuery}
          onTotalSpentRangeChange={handleTotalSpentRangeChange}
          onUpcomingFilterChange={setUpcomingFilter}
          onVisitTypeChange={setVisitType}
          searchQuery={searchQuery}
          totalSpentRange={totalSpentRange}
          upcomingFilter={upcomingFilter}
          visitType={visitType}
        />
      </Drawer>

      <Drawer
        closeLabel="Close loyalty discount settings"
        description="Applies automatically after completed bookings. Does not combine with vouchers."
        footer={
          <>
            <Button
              onClick={saveLoyaltySettings}
              disabled={isSavingLoyaltySettings}
            >
              {isSavingLoyaltySettings ? "Saving..." : "Save settings"}
            </Button>
            <Button
              onClick={() => setIsLoyaltySettingsOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
          </>
        }
        isOpen={isLoyaltySettingsOpen}
        onClose={() => setIsLoyaltySettingsOpen(false)}
        title="Loyalty discount"
      >
        <div className="space-y-5">
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 p-4 text-sm font-semibold">
            <span>Enable loyalty discount</span>
            <input
              checked={Boolean(loyaltySettingsDraft.enabled)}
              className="h-5 w-5 accent-neutral-950"
              onChange={(event) =>
                updateLoyaltySettingsDraft("enabled", event.target.checked)
              }
              type="checkbox"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            Completed bookings required
            <input
              className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
              min="1"
              onChange={(event) =>
                updateLoyaltySettingsDraft(
                  "thresholdCompletedBookings",
                  event.target.value
                )
              }
              type="number"
              value={loyaltySettingsDraft.thresholdCompletedBookings}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Discount percent
              <input
                className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
                min="0"
                max="100"
                onChange={(event) =>
                  updateLoyaltySettingsDraft(
                    "discountPercent",
                    event.target.value
                  )
                }
                type="number"
                value={loyaltySettingsDraft.discountPercent}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold">
              Max discount percent
              <input
                className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
                min="0"
                max="100"
                onChange={(event) =>
                  updateLoyaltySettingsDraft(
                    "maxDiscountPercent",
                    event.target.value
                  )
                }
                type="number"
                value={loyaltySettingsDraft.maxDiscountPercent}
              />
            </label>
          </div>

          {loyaltySettingsError && (
            <p
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {loyaltySettingsError}
            </p>
          )}
        </div>
      </Drawer>

      <Drawer
        closeLabel="Close client details"
        description={
          selectedClient
            ? "Private loyalty details for your admin view only."
            : ""
        }
        footer={
          <>
            <Button onClick={saveClientLoyalty} disabled={isSavingLoyalty}>
              {isSavingLoyalty ? "Saving..." : "Save loyalty"}
            </Button>
            <Button onClick={closeClientDetails} variant="outline">
              Close
            </Button>
          </>
        }
        isOpen={Boolean(selectedClient)}
        onClose={closeClientDetails}
        title={selectedClient?.clientName || "Client details"}
      >
        {selectedClient && (
          <div className="space-y-5">
            <div className="rounded-2xl bg-neutral-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-950">
                    {selectedClient.clientName || "Client"}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {selectedClient.phone || "No phone on booking"}
                  </p>
                </div>
                {selectedClient.loyalty?.isVip && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    VIP
                  </span>
                )}
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 p-4 text-sm font-semibold">
              <span>VIP client</span>
              <input
                checked={loyaltyDraft.isVip}
                className="h-5 w-5 accent-neutral-950"
                onChange={(event) =>
                  setLoyaltyDraft((current) => ({
                    ...current,
                    isVip: event.target.checked,
                  }))
                }
                type="checkbox"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold">
              Internal note
              <textarea
                className="min-h-32 w-full rounded-2xl border border-neutral-200 p-3 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
                maxLength={1000}
                onChange={(event) =>
                  setLoyaltyDraft((current) => ({
                    ...current,
                    internalNote: event.target.value,
                  }))
                }
                placeholder="No internal note yet"
                value={loyaltyDraft.internalNote}
              />
            </label>

            {!loyaltyDraft.internalNote.trim() && (
              <p className="rounded-2xl bg-neutral-50 p-3 text-sm text-neutral-500">
                No internal note yet.
              </p>
            )}

            {loyaltyError && (
              <p
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                role="alert"
              >
                {loyaltyError}
              </p>
            )}
          </div>
        )}
      </Drawer>

      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="rounded-2xl">
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="h-5 w-2/3 animate-pulse rounded bg-neutral-200" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-100" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-12 animate-pulse rounded-xl bg-neutral-100" />
                  <div className="h-12 animate-pulse rounded-xl bg-neutral-100" />
                </div>
                <div className="h-10 animate-pulse rounded-xl bg-neutral-100" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredClients.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="p-4 sm:p-6">
            <EmptyState
              title={clients.length === 0 ? "No clients yet" : "No matching clients"}
              description={
                clients.length === 0
                  ? "Clients will appear here after they book with you."
                  : "No clients match these filters."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredClients.map((client) => (
            <Card key={client.clientId} className="rounded-2xl">
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-lg font-semibold text-neutral-950">
                        {client.clientName || "Client"}
                      </h2>
                      {client.loyalty?.isVip && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          <Star className="h-3 w-3 fill-current" />
                          VIP
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-neutral-500">
                      {client.phone || "No phone on booking"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">
                    {client.bookingCount || 0} total
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-neutral-50 p-3">
                    <div className="text-xs font-medium text-neutral-500">
                      Completed
                    </div>
                    <div className="mt-1 text-lg font-semibold text-neutral-950">
                      {client.completedBookingsCount || 0}
                    </div>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-3">
                    <div className="text-xs font-medium text-neutral-500">
                      Total spent
                    </div>
                    <div className="mt-1 text-lg font-semibold text-neutral-950">
                      {formatCurrency(client.totalSpent)}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <div className="text-xs font-medium text-neutral-500">
                      Last visit
                    </div>
                    <div className="mt-0.5 text-neutral-800">
                      {formatBookingLabel(client.lastBooking)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-neutral-500">
                      Next booking
                    </div>
                    <div className="mt-0.5 text-neutral-800">
                      {formatBookingLabel(client.nextBooking)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-neutral-500">
                      Most booked
                    </div>
                    <div className="mt-0.5 text-neutral-800">
                      {client.mostBookedService
                        ? `${client.mostBookedService.serviceName} (${client.mostBookedService.count})`
                        : "None"}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    className="w-full"
                    onClick={() => openClientDetails(client)}
                    variant="outline"
                  >
                    Client details
                  </Button>
                  <Button
                    className="w-full gap-2"
                    onClick={() => openMessage(client)}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Message
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
