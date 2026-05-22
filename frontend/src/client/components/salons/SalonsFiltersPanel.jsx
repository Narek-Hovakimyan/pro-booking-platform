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
  return (
    <>
      {filterChips.length > 0 && (
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
      )}

      <label className="grid gap-2 text-sm font-semibold" htmlFor="salon-search">
        Search by salon name
        <span className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-neutral-400" aria-hidden="true" />
          <input
            className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 pl-9 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
            id="salon-search"
            placeholder="e.g. Elegance Salon"
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </span>
      </label>

      <label className="grid gap-2 text-sm font-semibold" htmlFor="salon-city">
        City
        <select
          className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
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

      <label className="grid gap-2 text-sm font-semibold" htmlFor="salon-address">
        Address
        <select
          className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
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
    </>
  );
}
