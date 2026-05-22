import {
  Award,
  BadgeCheck,
  Heart,
  MapPin,
  MessageCircle,
  Scissors,
  Star,
  UserRound,
} from "lucide-react";

import { Link } from "react-router-dom";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { getSpecialistProfessionDisplay } from "@/shared/data/professions";
import { getMediaUrl } from "@/shared/utils/media";

export default function BarberProfileHero({
  barber,
  currentUser,
  isFavorite,
  profileBarberId,
  reviewStats,
  salonId,
  salonName,
  salonRating,
  showSalonLink,
  startingPrice,
  toggleFavorite,
  totalCerts,
}) {
  return (
    <Card className="overflow-hidden rounded-2xl sm:rounded-3xl">
      <CardContent className="grid gap-0 lg:grid-cols-[340px_1fr]">
        <div className="relative overflow-hidden bg-neutral-100 lg:min-h-full">
          {barber.imageUrl ? (
            <img
              alt={`Photo of ${barber?.name || "barber"}`}
              className="aspect-[4/3] w-full object-cover lg:aspect-auto lg:h-full"
              src={getMediaUrl(barber.imageUrl)}
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center bg-neutral-100 lg:aspect-auto lg:h-full lg:min-h-[320px]">
              <UserRound className="h-20 w-20 text-neutral-300" />
            </div>
          )}
          {currentUser?.id && (
            <button
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              className={`absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border bg-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-white ${
                isFavorite ? "border-red-200" : "border-neutral-200"
              }`}
              onClick={toggleFavorite}
              type="button"
            >
              <Heart
                className={`h-5 w-5 ${
                  isFavorite ? "fill-red-500 text-red-500" : "text-neutral-600"
                }`}
              />
            </button>
          )}
        </div>

        <div className="flex flex-col justify-center p-5 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
                {barber?.name || "Barber"}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(() => {
                  const display = getSpecialistProfessionDisplay(barber);
                  if (!display) return null;
                  return (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-sm ring-1 ring-inset ${display.className}`}>
                      <Scissors className="h-3.5 w-3.5 text-neutral-500" />
                      {display.icon} {display.label}
                    </span>
                  );
                })()}

                {barber?.isVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Verified
                  </span>
                )}

                {totalCerts > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    <Award className="h-3.5 w-3.5" />
                    {totalCerts} {totalCerts === 1 ? "certification" : "certifications"}
                  </span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 shadow-sm">
              <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
              <span className="text-sm font-bold text-neutral-900">
                {reviewStats.average ? reviewStats.average.toFixed(1) : "0.0"}
              </span>
              <span className="text-xs text-neutral-400">
                ({reviewStats.count} {reviewStats.count === 1 ? "review" : "reviews"})
              </span>
            </div>
          </div>

          {barber.city && (
            <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500">
              <MapPin className="h-4 w-4 shrink-0 text-neutral-400" />
              <span>{barber.city}</span>
              {showSalonLink && (
                <>
                  <span className="text-neutral-300">·</span>
                  <Link
                    className="font-medium text-blue-600 hover:underline"
                    to={`/salons/${salonId}`}
                  >
                    {salonName}
                  </Link>
                  {salonRating !== null && (
                    <span className="text-xs text-neutral-400">
                      <Star className="mr-0.5 inline-block h-3 w-3 fill-amber-400 text-amber-500" />
                      {salonRating.toFixed(1)}
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {barber?.phone && (
            <p className="mt-1.5 text-sm text-neutral-500">
              {barber.phone}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-semibold text-neutral-800">
              {startingPrice
                ? `From ${startingPrice.toLocaleString()} դրամ`
                : "No active services"}
            </span>
          </div>

          {barber.bio && (
            <p className="mt-4 text-base leading-relaxed text-neutral-700">
              {barber.bio}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              as={Link}
              className="sm:min-w-[160px]"
              size="lg"
              state={{ barber }}
              to={`/booking/${profileBarberId}`}
            >
              Book appointment
            </Button>
            <Button
              as={Link}
              className="sm:min-w-[120px]"
              size="lg"
              state={{ user: barber }}
              to={`/messages/${profileBarberId}`}
              variant="outline"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Message
            </Button>
            {currentUser?.id && (
              <Button
                className="sm:min-w-[120px]"
                onClick={toggleFavorite}
                size="lg"
                variant="outline"
              >
                <Heart
                  className={`mr-2 h-4 w-4 ${
                    isFavorite ? "fill-red-500 text-red-500" : ""
                  }`}
                />
                {isFavorite ? "Saved" : "Save"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
