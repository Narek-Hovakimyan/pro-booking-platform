import { Search } from "lucide-react";

import Drawer from "@/shared/components/common/Drawer";
import FilterChip from "@/shared/components/common/FilterChip";
import { Button } from "@/shared/components/ui/button";
import { EVENT_TYPE_OPTIONS } from "@/features/events/utils/eventFormatters";

export default function EventFiltersDrawer({
  activeFiltersCount = 0,
  filterChips = [],
  filterPrice,
  filterSalonId,
  filterType,
  isOpen,
  onApply,
  onClear,
  onClose,
  salons = [],
  search,
  setFilterPrice,
  setFilterSalonId,
  setFilterType,
  setSearch,
}) {
  const visibleFilterChips = activeFiltersCount > 0 ? filterChips : [];

  return (
    <Drawer
      closeLabel="Close filters"
      description="Refine the events list instantly."
      footer={
        <>
          <Button onClick={onApply}>Apply filters</Button>
          <Button onClick={onClear} variant="outline">
            Clear filters
          </Button>
        </>
      }
      isOpen={isOpen}
      onClose={onClose}
      title="Filters"
    >
      {visibleFilterChips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visibleFilterChips.map((chip) => (
            <FilterChip
              key={chip.label}
              label={chip.label}
              onRemove={chip.onRemove}
            />
          ))}
        </div>
      )}

      <label className="grid gap-2 text-sm font-semibold">
        Search events
        <span className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-neutral-400" />
          <input
            className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 pl-9 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
            placeholder="Search events"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </span>
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Salon
        <select
          className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
          value={filterSalonId}
          onChange={(event) => setFilterSalonId(event.target.value)}
        >
          <option value="">All salons</option>
          {(salons || []).map((salon) => (
            <option key={salon._id} value={salon._id}>
              {salon.name}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Price
        <select
          className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
          value={filterPrice}
          onChange={(event) => setFilterPrice(event.target.value)}
        >
          <option value="">All prices</option>
          <option value="free">Free</option>
          <option value="paid">Paid</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Event type
        <select
          className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
          value={filterType}
          onChange={(event) => setFilterType(event.target.value)}
        >
          <option value="">All event types</option>
          {EVENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </Drawer>
  );
}
