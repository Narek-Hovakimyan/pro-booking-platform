import { Search } from "lucide-react";

import FilterChip from "@/shared/components/common/FilterChip";
import { serviceCategories } from "@/shared/data/serviceCategories";

export default function BarbersFiltersPanel({
  searchTerm,
  onSearchChange,
  selectedCity,
  onCityChange,
  cities = [],
  selectedService,
  onServiceChange,
  serviceNames = [],
  selectedCategory,
  onCategoryChange,
  selectedProfession,
  onProfessionChange,
  selectedBarberType,
  onBarberTypeChange,
  priceRange,
  onPriceRangeChange,
  discountFilter,
  onDiscountFilterChange,
  rating,
  onRatingChange,
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

      <label className="grid gap-2 text-sm font-semibold">
        Search by name
        <span className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-neutral-400" />
          <input
            className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 pl-9 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
            placeholder="Search name"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </span>
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        City
        <select
          className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
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

      <label className="grid gap-2 text-sm font-semibold">
        Service
        <select
          className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
          value={selectedService}
          onChange={(event) => onServiceChange(event.target.value)}
        >
          <option value="">All services</option>
          {serviceNames.map((serviceName) => (
            <option key={serviceName} value={serviceName}>
              {serviceName}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Service category
        <select
          className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
          value={selectedCategory}
          onChange={(event) => onCategoryChange(event.target.value)}
        >
          <option value="">All categories</option>
          {serviceCategories.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Profession
        <select
          className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
          value={selectedProfession}
          onChange={(event) => onProfessionChange(event.target.value)}
        >
          <option value="">All specialists</option>
          <option value="barber">Barber</option>
          <option value="hair_stylist">Hair stylist</option>
          <option value="nail_master">Nail master</option>
          <option value="makeup_artist">Makeup artist</option>
          <option value="cosmetologist">Cosmetologist</option>
          <option value="lash_brow">Lash & brow</option>
          <option value="massage">Massage</option>
          <option value="other">Other specialist</option>
        </select>
      </label>

      {selectedProfession === "barber" && (
        <label className="grid gap-2 text-sm font-semibold">
          Barber type
          <select
            className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
            value={selectedBarberType}
            onChange={(event) => onBarberTypeChange(event.target.value)}
          >
            <option value="">Any barber type</option>
            <option value="men">Men's barber</option>
            <option value="women">Women's hairdresser</option>
            <option value="unisex">Unisex</option>
          </select>
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">
          Min price
          <input
            className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
            min="0"
            placeholder="Min"
            type="number"
            value={priceRange.min}
            onChange={(event) => onPriceRangeChange("min", event.target.value)}
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          Max price
          <input
            className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
            min="0"
            placeholder="Max"
            type="number"
            value={priceRange.max}
            onChange={(event) => onPriceRangeChange("max", event.target.value)}
          />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-semibold">
        Discounts
        <select
          className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
          value={discountFilter}
          onChange={(event) => onDiscountFilterChange(event.target.value)}
        >
          <option value="">All</option>
          <option value="with-discounts">With discounts</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm font-semibold">
        Rating
        <select
          className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
          value={rating}
          onChange={(event) => onRatingChange(event.target.value)}
        >
          <option value="">Any rating</option>
          <option value="5">5 stars</option>
          <option value="4">4+ stars</option>
          <option value="3">3+ stars</option>
        </select>
      </label>
    </>
  );
}
