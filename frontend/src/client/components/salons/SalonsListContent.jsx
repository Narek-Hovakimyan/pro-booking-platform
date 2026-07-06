import EmptyState from "@/shared/components/common/EmptyState";
import SalonsGrid from "@/client/components/salons/SalonsGrid";

export default function SalonsListContent({
  currentUser,
  filteredSalons,
  hasActiveFilters,
  isLoading,
  isSalonFavorite,
  onResetFilters,
  onToggleFavorite,
  onViewSalon,
  salons,
  sortedSalons,
}) {
  if (isLoading) {
    return (
      <SalonsGrid
        salons={sortedSalons}
        isLoading={isLoading}
        hasActiveFilters={hasActiveFilters}
        currentUser={currentUser}
        onToggleFavorite={onToggleFavorite}
        onViewSalon={onViewSalon}
        onResetFilters={onResetFilters}
        isSalonFavorite={isSalonFavorite}
      />
    );
  }

  if (salons.length === 0) {
    return (
      <EmptyState
        className="border-brand-100 bg-brand-50/40 p-6 text-center"
        description="There are no salons available right now."
        title="No salons found"
      />
    );
  }

  if (filteredSalons.length === 0) {
    return (
      <EmptyState
        actionLabel={hasActiveFilters ? "Clear filters" : ""}
        className="border-brand-100 bg-brand-50/40 p-6 text-center"
        description="Try removing filters or searching a different salon name."
        onAction={onResetFilters}
        title="No salons found"
      />
    );
  }

  return (
    <SalonsGrid
      salons={sortedSalons}
      isLoading={isLoading}
      hasActiveFilters={hasActiveFilters}
      currentUser={currentUser}
      onToggleFavorite={onToggleFavorite}
      onViewSalon={onViewSalon}
      onResetFilters={onResetFilters}
      isSalonFavorite={isSalonFavorite}
    />
  );
}
