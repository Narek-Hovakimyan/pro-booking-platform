import BarberCard from "@/client/components/BarberCard";
import { BarberCardSkeleton } from "@/shared/components/LoadingSkeletons";
import EmptyState from "@/shared/components/common/EmptyState";

export default function BarbersGrid({
  barbers = [],
  isLoading = false,
  error = "",
  hasActiveFilters = false,
  favorites = [],
  currentUser = null,
  reviews = [],
  services = [],
  onToggleFavorite,
  onResetFilters,
}) {
  const initialLoading = isLoading && barbers.length === 0;

  if (error && barbers.length === 0) {
    return (
      <EmptyState
        className="border-red-200 bg-red-50 text-red-700"
        description={error}
        title="Could not load specialists"
      />
    );
  }

  if (initialLoading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <BarberCardSkeleton key={item} />
        ))}
      </div>
    );
  }

  if (barbers.length === 0) {
    return (
      <EmptyState
        actionLabel={hasActiveFilters ? "Clear filters" : ""}
        description={
          hasActiveFilters
            ? "Try removing filters or searching a different name."
            : "There are no specialists available right now. Check back later."
        }
        onAction={onResetFilters}
        title="No specialists found"
      />
    );
  }

  return (
    <div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {barbers.map((barber) => {
          const barberId = barber?.id || barber?._id;

          return (
            <BarberCard
              key={barberId}
              barber={barber}
              currentUser={currentUser}
              favorites={favorites}
              onToggleFavorite={onToggleFavorite}
              reviews={reviews}
              services={services}
              reviewStats={barber.reviewStats}
              availabilityResult={barber.firstAvailableSlot}
              availabilityStatus={barber.availabilityStatus}
            />
          );
        })}
      </div>
    </div>
  );
}