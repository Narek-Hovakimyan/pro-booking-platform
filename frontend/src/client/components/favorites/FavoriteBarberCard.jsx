import { Heart, MessageCircle, Star, UserRound } from "lucide-react";
import { Link } from "react-router-dom";

import {
  getActiveServicesForBarber,
  getReviewStatsFromReviews,
  getStartingPrice,
  getUniqueDisplayCategoryEntries,
} from "@/client/utils/favoriteHelpers";
import { formatCurrency } from "@/platform/utils/billingFormatters";
import { getSpecialistProfessionDisplay } from "@/shared/data/professions";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { getMediaUrl } from "@/shared/utils/media";
import { formatAvailabilityLabel, getAvailabilityTone } from "@/shared/utils/availability";

function getSalonEntryId(salonEntry) {
  if (!salonEntry) return null;
  if (typeof salonEntry === "string") return salonEntry;
  if (typeof salonEntry.salon === "string") return salonEntry.salon;
  if (salonEntry.salon && typeof salonEntry.salon === "object") {
    return salonEntry.salon.id || salonEntry.salon._id || null;
  }
  return salonEntry.id || salonEntry._id || null;
}

export default function FavoriteBarberCard({
  availabilitySlot,
  availabilityStatus,
  barber,
  eligibleBooking,
  hasLoadedCardSummary,
  isRemovalPending,
  onBookAgain,
  onRemove,
  reviews,
  services,
  summaryReviewStats,
}) {
  const barberId = barber?.id || barber?._id;
  const approvedSalons = (barber?.approvedSalons || barber?.salons || [])
    .filter((salon) => salon?.status === "approved" || salon?.status === undefined);
  const singleSalonEntry = approvedSalons.length === 1 ? approvedSalons[0] : null;
  const singleLegacySalonId =
    !singleSalonEntry && barber?.salonStatus === "approved"
      ? getSalonEntryId(barber?.salon)
      : null;
  const bookingSalonId =
    getSalonEntryId(singleSalonEntry) || singleLegacySalonId || null;
  const bookingPath = bookingSalonId
    ? `/booking/${barberId}?salonId=${encodeURIComponent(bookingSalonId)}`
    : `/booking/${barberId}`;
  const startingPrice = getStartingPrice(services, barberId);
  const barberActiveServices = getActiveServicesForBarber(services, barberId);
  const mainServices = barberActiveServices.slice(0, 3);
  const displayCategoryEntries = getUniqueDisplayCategoryEntries(barberActiveServices);
  const nonOtherEntries = displayCategoryEntries.filter(
    ([key]) => !key.startsWith("system:other")
  );
  const showCategoryChips = nonOtherEntries.length > 0;
  const hasBookableServices = barberActiveServices.length > 0;
  const reviewStats =
    summaryReviewStats || getReviewStatsFromReviews(reviews, barberId);
  const availabilityTone =
    !hasBookableServices
      ? "services"
      : availabilityStatus === "loading"
        ? "services"
        : availabilityStatus === "unavailable"
          ? "none"
          : getAvailabilityTone(availabilitySlot);
  const availabilityClass = {
    today: "bg-emerald-50 text-emerald-700",
    future: "bg-amber-50 text-amber-700",
    none: "bg-red-50 text-red-700",
    services: "bg-neutral-100 text-neutral-600",
  }[availabilityTone];
  const availabilityLabel =
    !hasBookableServices
      ? "No services yet"
      : !availabilityStatus
        ? "Checking availability..."
        : availabilityStatus === "unavailable"
          ? "Schedule unavailable"
          : formatAvailabilityLabel(availabilitySlot);
  const showBookAgain = Boolean(eligibleBooking);

  return (
    <Card className="rounded-2xl shadow-card transition-shadow hover:shadow-card-hover sm:rounded-3xl">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="relative">
          {barber.imageUrl ? (
            <img
              alt={barber.name}
              className="aspect-[4/3] w-full rounded-2xl object-cover"
              decoding="async"
              loading="lazy"
              src={getMediaUrl(barber.imageUrl)}
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-neutral-100">
              <UserRound className="h-12 w-12 text-neutral-400" />
            </div>
          )}

          <Button
            aria-label="Remove favorite"
            className="absolute right-3 top-3 bg-white"
            disabled={isRemovalPending}
            onClick={onRemove}
            size="icon"
            variant="outline"
          >
            <Heart className="h-4 w-4 fill-red-500 text-red-500" />
          </Button>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold tracking-tight text-neutral-950">{barber.name}</h2>
            <p className="text-sm text-neutral-500">
              {barber.city || "City not set"}
            </p>
          </div>
          {reviewStats.average > 0 ? (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-sm font-semibold text-amber-700">
              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
              <span>{reviewStats.average.toFixed(1)}</span>
              <span className="text-xs font-medium text-amber-600">
                · {reviewStats.count} {reviewStats.count === 1 ? "review" : "reviews"}
              </span>
            </div>
          ) : (
            <div className="flex shrink-0 items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-500">
              No reviews yet
            </div>
          )}
        </div>

        {(() => {
          const display = getSpecialistProfessionDisplay(barber);
          if (!display) return null;
          return (
            <div className="flex items-center gap-1.5 text-sm">
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${display.className}`}>
                {display.icon} {display.label}
              </span>
            </div>
          );
        })()}

        <div className="flex items-center gap-2 rounded-xl bg-brand-50 p-3">
          {startingPrice ? (
            <>
              <span className="text-lg font-bold text-neutral-900">
                {formatCurrency(startingPrice)}
              </span>
              <span className="text-sm text-neutral-500">starting price</span>
            </>
          ) : (
            <span className="text-sm font-medium text-neutral-500">No services yet</span>
          )}
        </div>

        {mainServices.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Services">
            {mainServices.map((service) => (
              <span
                className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700"
                key={service?.id || service?._id}
              >
                {service?.name || "Service"}
              </span>
            ))}
          </div>
        )}

        {showCategoryChips && (
          <div className="flex flex-wrap gap-1.5" aria-label="Service categories">
            {nonOtherEntries.slice(0, 3).map(([key, label]) => (
              <span
                className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600"
                key={key}
              >
                {label}
              </span>
            ))}
          </div>
        )}

        {hasLoadedCardSummary && availabilityStatus !== undefined && (
          <div className={`rounded-xl px-3 py-2.5 text-sm font-medium ${availabilityClass}`}>
            {availabilityLabel}
          </div>
        )}

        {showBookAgain ? (
          <Button className="w-full" onClick={onBookAgain}>
            Book again
          </Button>
        ) : (
          <Button as={Link} state={{ barber }} to={bookingPath} className="w-full">
            Book appointment
          </Button>
        )}
        <Button
          as={Link}
          className="w-full"
          state={{ barber }}
          to={`/specialists/${barberId}/profile`}
          variant="outline"
        >
          View profile
        </Button>
        <Button
          as={Link}
          className="w-full"
          state={{ user: barber }}
          to={`/messages/${barberId}`}
          variant="outline"
        >
          <MessageCircle className="mr-2 h-4 w-4" />
          Message
        </Button>
      </CardContent>
    </Card>
  );
}
