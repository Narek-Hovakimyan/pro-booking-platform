import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, SlidersHorizontal } from "lucide-react";

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
                    <h2 className="truncate text-lg font-semibold text-neutral-950">
                      {client.clientName || "Client"}
                    </h2>
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

                <Button
                  className="w-full gap-2"
                  onClick={() => openMessage(client)}
                >
                  <MessageCircle className="h-4 w-4" />
                  Message
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
