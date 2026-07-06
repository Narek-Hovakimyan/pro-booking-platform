import { Heart, MapPin, Phone, Star, Store } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { getMediaUrl } from "@/shared/utils/media";

export default function SalonProfileHero({
  averageRating,
  barbersCount,
  currentUser,
  isSalonFavorited,
  onToggleFavorite,
  reviewsCount,
  salon,
}) {
  return (
    <Card className="overflow-hidden rounded-2xl shadow-card sm:rounded-3xl">
      <CardContent className="grid gap-0 p-0 lg:grid-cols-[340px_1fr]">
        <div className="relative overflow-hidden bg-brand-50">
          {salon?.imageUrl ? (
            <img
              alt={salon?.name || "Salon image"}
              className="aspect-[4/3] w-full object-cover lg:aspect-auto lg:h-full lg:min-h-[320px]"
              src={getMediaUrl(salon?.imageUrl)}
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center lg:aspect-auto lg:h-full lg:min-h-[320px]">
              <Store className="h-16 w-16 text-brand-600" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/25 to-transparent" />
        </div>

        <div className="flex flex-col justify-center p-5 sm:p-7 lg:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="break-words text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
                {salon?.name}
              </h1>
              <div className="mt-3 space-y-1.5 text-sm text-neutral-500">
                {salon?.city && (
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-brand-600" />
                    <span>{salon?.city}</span>
                  </p>
                )}
                {salon?.address && (
                  <p className={`${salon?.city ? "ml-6" : ""} break-words`}>
                    {salon?.address}
                  </p>
                )}
                {salon?.phone && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0 text-neutral-400" />
                    <span>{salon?.phone}</span>
                  </p>
                )}
              </div>
            </div>

            {currentUser?.role === "client" && salon && (
              <Button
                aria-label={
                  isSalonFavorited
                    ? "Remove salon from favorites"
                    : "Add salon to favorites"
                }
                className="w-full sm:w-auto"
                onClick={onToggleFavorite}
                variant={isSalonFavorited ? "default" : "outline"}
              >
                <Heart
                  className={`mr-2 h-4 w-4 ${
                    isSalonFavorited ? "fill-white" : ""
                  }`}
                />
                {isSalonFavorited ? "Favorited" : "Add to favorites"}
              </Button>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <p className="inline-flex items-center gap-2 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-neutral-900">
              <Store className="h-4 w-4 text-brand-600" />
              {barbersCount} {barbersCount === 1 ? "specialist" : "specialists"}
            </p>
            <p className="inline-flex items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-900">
              <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
              {averageRating
                ? `${averageRating.toFixed(1)} (${reviewsCount} reviews)`
                : "No reviews yet"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
