import { Search } from "lucide-react";

import FilterChip from "@/shared/components/common/FilterChip";

export default function SalonsFiltersPanel({
  searchTerm,
  onSearchChange,
  selectedCity,
  onCityChange,
  cities = [],
  selectedAddress,
  onAddressChange,
  addresses = [],
  filterChips = [],
}) {
  const fieldClass =
    "h-11 w-full rounded-xl border border-neutral-200 bg-white px-4 py-2 font-normal text-neutral-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

  return (
    <div className="space-y-5">
      {filterChips.length > 0 && (
        <div
          className="rounded-2xl border border-brand-100 bg-brand-50/50 p-3"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
            Active filters
          </p>
          <div className="flex flex-wrap gap-2" role="list" aria-label="Active filters">
            {filterChips.map((chip) => (
              <div key={chip.label} role="listitem">
                <FilterChip
                  label={chip.label}
                  onRemove={chip.onRemove}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <label
        className="grid gap-2 rounded-2xl border border-neutral-200 bg-white p-3 text-sm font-semibold text-neutral-800 shadow-sm"
        htmlFor="salon-search"
      >
        Search by salon name
        <span className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-brand-600" aria-hidden="true" />
          <input
            className={`${fieldClass} pl-9`}
            id="salon-search"
            placeholder="e.g. Elegance Salon"
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label
          className="grid gap-2 rounded-2xl border border-neutral-200 bg-white p-3 text-sm font-semibold text-neutral-800 shadow-sm"
          htmlFor="salon-city"
        >
          City
          <select
            className={fieldClass}
            id="salon-city"
            value={selectedCity}
            onChange={(event) => onCityChange(event.target.value)}
          >
            <option value="">All cities</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>

        <label
          className="grid gap-2 rounded-2xl border border-neutral-200 bg-white p-3 text-sm font-semibold text-neutral-800 shadow-sm"
          htmlFor="salon-address"
        >
          Address
          <select
            className={fieldClass}
            id="salon-address"
            value={selectedAddress}
            onChange={(event) => onAddressChange(event.target.value)}
          >
            <option value="">All addresses</option>
            {addresses.map((address) => (
              <option key={address} value={address}>
                {address}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
