import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

export default function SalonsPageHeader({
  activeFiltersCount,
  hasActiveFilters,
  onOpenFilters,
  onResetFilters,
  selectedSalon,
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-card sm:flex sm:items-end sm:justify-between sm:rounded-3xl sm:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
          Salons
        </h1>
        <p className="mt-2 text-neutral-500">
          Browse salons and book with approved specialists.
        </p>
      </div>

      {!selectedSalon && (
        <div className="mt-4 grid gap-2 sm:mt-0 sm:flex">
          <Button
            className="relative w-full border-brand-100 text-brand-700 hover:bg-brand-50 sm:w-auto"
            onClick={onOpenFilters}
            variant="outline"
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">
                {activeFiltersCount}
              </span>
            )}
          </Button>
          {hasActiveFilters && (
            <Button
              className="w-full sm:w-auto"
              onClick={onResetFilters}
              variant="outline"
            >
              Clear Filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
