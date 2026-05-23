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
    <div className="grid gap-3 sm:flex sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Salons
        </h1>
        <p className="mt-2 text-neutral-500">
          Browse salons and book with approved specialists.
        </p>
      </div>

      {!selectedSalon && (
        <div className="grid gap-2 sm:flex">
          <Button
            className="relative w-full sm:w-auto"
            onClick={onOpenFilters}
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
