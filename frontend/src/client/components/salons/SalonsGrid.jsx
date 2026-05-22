import { Heart, MapPin, Phone, Star, Store, Users } from "lucide-react";

import { SalonCardSkeleton } from "@/shared/components/LoadingSkeletons";
import EmptyState from "@/shared/components/common/EmptyState";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { getMediaUrl } from "@/shared/utils/media";

export default function SalonsGrid({
  salons = [],
  isLoading = false,
  hasActiveFilters = false,
  currentUser = null,
  onToggleFavorite,
  onViewSalon,
  onResetFilters,
  isSalonFavorite = () => false,
}) {
  const initialLoading = isLoading && salons.length === 0;

  if (initialLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <SalonCardSkeleton key={item} />
        ))}
      </div>
    );
  }

  if (salons.length === 0) {
    return (
      <EmptyState
        actionLabel={hasActiveFilters ? "Clear filters" : ""}
        description={
          hasActiveFilters
            ? "Try adjusting your filters or search for a different salon name."
            : "There are no salons available at the moment. Check back later!"
        }
        onAction={onResetFilters}
        title="No salons found"
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {salons.map((salon) => {
        const salonId = salon?.id || salon?._id;
        const barbers = salon?.barbers || [];
        const salonFavorited = isSalonFavorite(salonId);
        const salonRating = Number(salon?.averageRating || 0);
        const salonReviewsCount = Number(
          salon?.totalReviews ?? salon?.reviewsCount ?? 0
        );

        return (
          <Card
            className="rounded-2xl transition-shadow hover:shadow-md sm:rounded-3xl"
            key={salonId}
          >
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div className="relative">
                {salon?.imageUrl ? (
                  <img
                    alt={`Photos of ${salon?.name || "salon"}`}
                    className="aspect-[4/3] w-full rounded-2xl object-cover"
                    src={getMediaUrl(salon.imageUrl)}
                    loading="lazy"
                  />
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-neutral-100">
                    <Store className="h-12 w-12 text-neutral-400" />
                    <span className="sr-only">Salon image placeholder</span>
                  </div>
                )}

                {currentUser?.role === "client" && (
                  <Button
                    aria-label={
                      salonFavorited
                        ? "Remove salon from favorites"
                        : "Add salon to favorites"
                    }
                    className="absolute right-3 top-3 bg-white"
                    onClick={() => onToggleFavorite(salon)}
                    size="icon"
                    variant="outline"
                  >
                    <Heart
                      className={`h-4 w-4 ${
                        salonFavorited ? "fill-red-500 text-red-500" : ""
                      }`}
                    />
                  </Button>
                )}
              </div>

              <div>
                <h2 className="text-xl font-bold text-neutral-950">{salon?.name}</h2>
                {salon?.city && (
                  <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{salon.city}</span>
                  </p>
                )}
                {salon?.address && !salon?.city && (
                  <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{salon.address}</span>
                  </p>
                )}
                {salon?.city && salon?.address && (
                  <p className="ml-6 text-sm text-neutral-400">
                    {salon.address}
                  </p>
                )}
                {salon?.phone && (
                  <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
                    <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{salon.phone}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 rounded-xl bg-neutral-50 p-3">
                <Users className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                <span className="text-sm font-semibold text-neutral-900">
                  {barbers.length} {barbers.length === 1 ? "barber" : "barbers"}
                </span>
              </div>

              <div className="flex items-center gap-1 text-sm text-neutral-600">
                <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />
                {salonRating ? (
                  <span>
                    <span className="font-semibold text-neutral-900">{salonRating.toFixed(1)}</span>
                    <span className="text-neutral-400"> ({salonReviewsCount} {salonReviewsCount === 1 ? "review" : "reviews"})</span>
                  </span>
                ) : (
                  <span className="text-neutral-400">No reviews yet</span>
                )}
              </div>

              <Button
                aria-label={`View barbers at ${salon?.name || "salon"}`}
                className="w-full"
                onClick={() => onViewSalon(salon)}
                variant="outline"
              >
                <Users className="mr-2 h-4 w-4" aria-hidden="true" />
                View barbers
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
