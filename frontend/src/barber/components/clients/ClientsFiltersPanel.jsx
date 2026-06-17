import { Search } from "lucide-react";

import FilterChip from "@/shared/components/common/FilterChip";

export default function ClientsFiltersPanel({
  searchQuery,
  onSearchChange,
  visitType,
  onVisitTypeChange,
  upcomingFilter,
  onUpcomingFilterChange,
  lastVisitFilter,
  onLastVisitFilterChange,
  totalSpentRange,
  onTotalSpentRangeChange,
  filterChips = [],
}) {
  return (
    <>
      {filterChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filterChips.map((chip) => (
            <FilterChip
              key={chip.label}
              label={chip.label}
              onRemove={chip.onRemove}
            />
          ))}
        </div>
      )}

      <div className="space-y-4">
        <label className="grid gap-2 text-sm font-semibold">
          Search by name or phone
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-neutral-400" />
            <input
              className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 pl-9 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search name or phone"
              type="search"
              value={searchQuery}
            />
          </span>
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          Visit type
          <select
            className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
            onChange={(event) => onVisitTypeChange(event.target.value)}
            value={visitType}
          >
            <option value="">All clients</option>
            <option value="first-time">First-time clients</option>
            <option value="returning">Returning clients</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          Upcoming booking
          <select
            className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
            onChange={(event) => onUpcomingFilterChange(event.target.value)}
            value={upcomingFilter}
          >
            <option value="">All</option>
            <option value="has-upcoming">Has upcoming booking</option>
            <option value="no-upcoming">No upcoming booking</option>
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            Min total spent
            <input
              className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
              min="0"
              onChange={(event) =>
                onTotalSpentRangeChange("min", event.target.value)
              }
              placeholder="Min"
              type="number"
              value={totalSpentRange.min}
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            Max total spent
            <input
              className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
              min="0"
              onChange={(event) =>
                onTotalSpentRangeChange("max", event.target.value)
              }
              placeholder="Max"
              type="number"
              value={totalSpentRange.max}
            />
          </label>
        </div>

        <label className="grid gap-2 text-sm font-semibold">
          Last visit
          <select
            className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
            onChange={(event) => onLastVisitFilterChange(event.target.value)}
            value={lastVisitFilter}
          >
            <option value="">All</option>
            <option value="last-30">Last 30 days</option>
            <option value="last-90">Last 90 days</option>
            <option value="no-recent">No recent visit</option>
          </select>
        </label>
      </div>
    </>
  );
}
