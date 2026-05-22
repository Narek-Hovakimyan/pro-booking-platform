import { Search } from "lucide-react";

import FilterChip from "@/shared/components/common/FilterChip";

const ROLE_OPTIONS = [
  { value: "", label: "All roles" },
  { value: "barber", label: "Barber" },
  { value: "hairdresser", label: "Hairdresser" },
  { value: "nail-artist", label: "Nail artist" },
  { value: "makeup-artist", label: "Makeup artist" },
  { value: "receptionist", label: "Receptionist" },
  { value: "other", label: "Other" },
];

export default function JobsFiltersPanel({
  role,
  city,
  onRoleChange,
  onCityChange,
  filterChips = [],
  showIntro = true,
  className = "",
}) {
  return (
    <div className={`space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-200/60 sm:rounded-3xl sm:p-6 ${className}`}>
      {showIntro && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
              Salon jobs
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Browse active openings from salons looking for new specialists.
            </p>
          </div>
        </div>
      )}

      {filterChips.length > 0 && (
        <div className="flex flex-wrap gap-2" role="list" aria-label="Active filters">
          {filterChips.map((chip) => (
            <div key={chip.label} role="listitem">
              <FilterChip label={chip.label} onRemove={chip.onRemove} />
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4">
        <label className="grid gap-2 text-sm font-semibold" htmlFor="job-role-filter">
          Role
          <select
            className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
            id="job-role-filter"
            value={role}
            onChange={(event) => onRoleChange(event.target.value)}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold" htmlFor="job-city-filter">
          City
          <span className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-neutral-400"
            />
            <input
              className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 pl-9 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
              id="job-city-filter"
              placeholder="e.g. Yerevan"
              type="search"
              value={city}
              onChange={(event) => onCityChange(event.target.value)}
            />
          </span>
        </label>
      </div>
    </div>
  );
}
