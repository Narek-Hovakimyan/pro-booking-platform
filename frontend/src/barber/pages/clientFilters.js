const DEFAULT_TOTAL_SPENT_RANGE = Object.freeze({
  min: "",
  max: "",
});

export const DEFAULT_CLIENT_FILTERS = Object.freeze({
  searchQuery: "",
  visitType: "",
  upcomingFilter: "",
  lastVisitFilter: "",
  totalSpentRange: DEFAULT_TOTAL_SPENT_RANGE,
});

export const createDefaultClientFilters = () => ({
  searchQuery: DEFAULT_CLIENT_FILTERS.searchQuery,
  visitType: DEFAULT_CLIENT_FILTERS.visitType,
  upcomingFilter: DEFAULT_CLIENT_FILTERS.upcomingFilter,
  lastVisitFilter: DEFAULT_CLIENT_FILTERS.lastVisitFilter,
  totalSpentRange: { ...DEFAULT_TOTAL_SPENT_RANGE },
});

export const normalizeSearch = (value) =>
  String(value || "").trim().toLowerCase();

export const getFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const getFilterNumber = (value) => {
  if (String(value ?? "").trim() === "") return null;
  return getFiniteNumber(value);
};

export const getClientVisitCount = (client) => {
  const totalBookings = getFiniteNumber(client?.bookingCount);
  if (totalBookings !== null) return totalBookings;

  return getFiniteNumber(client?.completedBookingsCount) || 0;
};

export const hasUpcomingBooking = (client) => Boolean(client?.nextBooking?.date);

export const getDaysSinceDate = (dateValue) => {
  if (!dateValue) return null;

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.floor((today.getTime() - date.getTime()) / 86400000);
};

export const buildClientFilterChips = ({
  searchQuery,
  visitType,
  upcomingFilter,
  lastVisitFilter,
  totalSpentRange,
  onClearSearch,
  onClearVisitType,
  onClearUpcomingFilter,
  onClearLastVisitFilter,
  onClearMinSpent,
  onClearMaxSpent,
}) => {
  const chips = [];

  if (searchQuery.trim()) {
    chips.push({ label: `Search: ${searchQuery.trim()}`, onRemove: onClearSearch });
  }

  if (visitType) {
    chips.push({
      label: visitType === "first-time" ? "First-time clients" : "Returning clients",
      onRemove: onClearVisitType,
    });
  }

  if (upcomingFilter) {
    chips.push({
      label: upcomingFilter === "has-upcoming"
        ? "Has upcoming booking"
        : "No upcoming booking",
      onRemove: onClearUpcomingFilter,
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
      onRemove: onClearLastVisitFilter,
    });
  }

  if (totalSpentRange.min) {
    chips.push({
      label: `Min spent: ${Number(totalSpentRange.min).toLocaleString()} AMD`,
      onRemove: onClearMinSpent,
    });
  }

  if (totalSpentRange.max) {
    chips.push({
      label: `Max spent: ${Number(totalSpentRange.max).toLocaleString()} AMD`,
      onRemove: onClearMaxSpent,
    });
  }

  return chips;
};

export const filterClients = (clients, filters) => {
  const query = normalizeSearch(filters.searchQuery);
  const minSpent = getFilterNumber(filters.totalSpentRange?.min);
  const maxSpent = getFilterNumber(filters.totalSpentRange?.max);

  return (clients || []).filter((client) => {
    const name = normalizeSearch(client.clientName);
    const phone = normalizeSearch(client.phone);
    const visitCount = getClientVisitCount(client);
    const spent = getFiniteNumber(client.totalSpent) || 0;
    const daysSinceLastVisit = getDaysSinceDate(client?.lastBooking?.date);

    if (query && !name.includes(query) && !phone.includes(query)) {
      return false;
    }

    if (filters.visitType === "first-time" && visitCount > 1) return false;
    if (filters.visitType === "returning" && visitCount <= 1) return false;

    if (filters.upcomingFilter === "has-upcoming" && !hasUpcomingBooking(client)) {
      return false;
    }

    if (filters.upcomingFilter === "no-upcoming" && hasUpcomingBooking(client)) {
      return false;
    }

    if (filters.lastVisitFilter === "last-30") {
      if (daysSinceLastVisit === null || daysSinceLastVisit > 30) return false;
    }

    if (filters.lastVisitFilter === "last-90") {
      if (daysSinceLastVisit === null || daysSinceLastVisit > 90) return false;
    }

    if (filters.lastVisitFilter === "no-recent") {
      if (daysSinceLastVisit !== null && daysSinceLastVisit <= 90) {
        return false;
      }
    }

    if (minSpent !== null && spent < minSpent) return false;
    if (maxSpent !== null && spent > maxSpent) return false;

    return true;
  });
};
