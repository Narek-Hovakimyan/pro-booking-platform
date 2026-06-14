import { useState } from "react";
import { Heart, MapPin, MessageCircle, Store, UserRound, Star } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import SalonListModal from "@/client/components/SalonListModal";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { getUniqueDisplayCategoryEntries } from "@/client/utils/favoriteHelpers";
import { getSpecialistProfessionDisplay } from "@/shared/data/professions";
import { formatAvailabilityLabel, getAvailabilityTone } from "@/shared/utils/availability";
import { getMediaUrl } from "@/shared/utils/media";

function getBarberPrices(services, barberId) {
  return (services || [])
    .filter(
      (service) =>
        String(service?.barberId) === String(barberId) && service?.active
    )
    .map((service) => Number(service?.price))
    .filter(Number.isFinite);
}

function getReviewStats(reviews, barberId) {
  const barberReviews = (reviews || []).filter(
    (review) => String(review?.barberId) === String(barberId)
  );
  const total = barberReviews.reduce(
    (sum, review) => sum + Number(review?.rating || 0),
    0
  );

  return {
    average: barberReviews.length > 0 ? total / barberReviews.length : 0,
    count: barberReviews.length,
  };
}

function getBarberAvatarUrl(barber) {
  return barber?.avatarUrl || barber?.imageUrl || "";
}

export default function BarberCard({
  barber,
  bookingSalon = null,
  services = [],
  reviews = [],
  favorites = [],
  currentUser = null,
  onToggleFavorite = null,
  reviewStats: reviewStatsOverride = null,
  availabilityResult = null,
  availabilityStatus = "ready",
  showAvailability = true,
}) {
  const navigate = useNavigate();
  const [showSalonsModal, setShowSalonsModal] = useState(false);

  if (!barber) return null;

  const barberId = barber.id || barber._id;
  const safeServices = services || [];
  const safeReviews = reviews || [];
  const safeFavorites = favorites || [];
  const prices = getBarberPrices(safeServices, barberId);
  const reviewStats = reviewStatsOverride || getReviewStats(safeReviews, barberId);
  const activeServices = safeServices.filter(
    (service) => String(service?.barberId) === String(barberId) && service?.active
  );
  const mainServices = activeServices.slice(0, 3);

  // Category chips: use display category entries (handles both system and custom categories)
  const displayCategoryEntries = getUniqueDisplayCategoryEntries(activeServices);
  const nonOtherEntries = displayCategoryEntries.filter(
    ([key]) => !key.startsWith("system:other")
  );
  const showCategoryChips = nonOtherEntries.length > 0;

  const hasBookableServices = activeServices.length > 0;
  const barberAvatarUrl = getBarberAvatarUrl(barber);
  const availabilityTone =
    !hasBookableServices
      ? "services"
      : availabilityStatus === "loading"
      ? "services"
      : availabilityStatus === "unavailable"
        ? "none"
        : getAvailabilityTone(availabilityResult);
  const availabilityClass = {
    today: "bg-emerald-50 text-emerald-700",
    future: "bg-amber-50 text-amber-700",
    none: "bg-red-50 text-red-700",
    services: "bg-neutral-100 text-neutral-600",
  }[availabilityTone];
  const availabilityLabel =
    !hasBookableServices
      ? "No services yet"
      : availabilityStatus === "loading"
      ? "Checking availability..."
      : availabilityStatus === "unavailable"
        ? "Schedule unavailable"
        : formatAvailabilityLabel(availabilityResult);
  const isFavorite = safeFavorites.some(
    (favorite) =>
      String(favorite?.clientId) === String(currentUser?.id) &&
      String(favorite?.barberId) === String(barberId)
  );
  // Get approved salons from new salons array, fallback to legacy
  const approvedSalons = (barber?.approvedSalons || barber?.salons || [])
    .filter((s) => s?.status === "approved" || s?.status === undefined);
  const primarySalon = barber?.primarySalon || approvedSalons.find((s) => s?.isPrimary) || approvedSalons[0];
  const legacySalon = barber?.salonStatus === "approved" ? barber?.salon : null;

  // Build salon display — use bookingSalon first if provided (e.g. from salon page context)
  let salonName = "";
  let salonId = null;
  let showSalonLink = false;
  const hasMultipleSalons = approvedSalons.length > 1;

  if (bookingSalon) {
    // When viewing barbers from a specific salon page, show that salon context
    salonName = bookingSalon?.name || "";
    salonId = bookingSalon?.id || bookingSalon?._id;
    showSalonLink = Boolean(salonName && salonId);
  } else if (hasMultipleSalons) {
    // Multiple salons
    const primaryName = primarySalon?.name || "";
    const extraCount = approvedSalons.length - 1;
    salonName = `${primaryName} + ${extraCount} more`;
    salonId = primarySalon?.id || primarySalon?._id;
    showSalonLink = Boolean(primaryName && salonId);
  } else if (approvedSalons.length === 1) {
    // Single salon from new array
    const salon = approvedSalons[0];
    salonName = salon?.name || "";
    salonId = salon?.id || salon?._id;
    showSalonLink = Boolean(salonName && salonId);
  } else if (legacySalon) {
    // Legacy fallback
    salonName = legacySalon?.name || barber?.salonName || "";
    salonId = legacySalon?.id || legacySalon?._id;
    showSalonLink = Boolean(salonName && salonId);
  }

  const handleSalonClick = () => {
    if (hasMultipleSalons && !bookingSalon) {
      setShowSalonsModal(true);
    } else if (salonId) {
      navigate(`/salons/${salonId}`);
    }
  };

  const handleSelectSalon = (selectedSalonId) => {
    setShowSalonsModal(false);
    navigate(`/salons/${selectedSalonId}`);
  };

  const handleFavorite = () => {
    if (!onToggleFavorite) return;

    onToggleFavorite(barber);
  };
  const bookingSalonId = bookingSalon?.id || bookingSalon?._id || null;
  const bookingState = bookingSalonId
    ? { barber, selectedSalonId: bookingSalonId, salon: bookingSalon }
    : { barber };
  const bookingPath = bookingSalonId
    ? `/booking/${barberId}?salonId=${encodeURIComponent(bookingSalonId)}`
    : `/booking/${barberId}`;

  return (
    <Card className="rounded-2xl transition-shadow hover:shadow-md sm:rounded-3xl">
      <CardContent className="space-y-4 p-4 sm:p-6">
        {/* Image section */}
        <div className="relative">
          {barberAvatarUrl ? (
            <img
              alt={barber?.name || "Specialist"}
              className="aspect-[4/3] w-full rounded-2xl object-cover"
              src={getMediaUrl(barberAvatarUrl)}
              loading="lazy"
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-neutral-100">
              <UserRound className="h-12 w-12 text-neutral-400" aria-hidden="true" />
              <span className="sr-only">Specialist image placeholder</span>
            </div>
          )}

          {onToggleFavorite && (
            <Button
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              className="absolute right-3 top-3 bg-white"
              onClick={handleFavorite}
              size="icon"
              variant="outline"
            >
              <Heart
                className={`h-4 w-4 ${isFavorite ? "fill-red-500 text-red-500" : ""}`}
              />
            </Button>
          )}
        </div>

        {/* Name and contact */}
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-950">
            {barber?.name || "Specialist"}
          </h2>
          {barber?.phone && (
            <p className="mt-0.5 text-sm text-neutral-500">{barber.phone}</p>
          )}
        </div>

        {/* Location */}
        {barber?.city && (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{barber.city}</span>
          </p>
        )}

        {/* Profession / specialty badge */}
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

        {/* Salon link */}
        {showSalonLink && (
          <button
            className="flex w-full cursor-pointer items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-left text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            onClick={handleSalonClick}
            type="button"
            aria-label={`View salon: ${salonName}`}
          >
            <Store className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{salonName}</span>
          </button>
        )}

        {/* Pricing */}
        <div className="flex items-center gap-2 rounded-xl bg-neutral-50 p-3">
          {prices.length > 0 ? (
            <>
              <span className="text-lg font-bold text-neutral-900">
                {Math.min(...prices).toLocaleString()} դրամ
              </span>
              <span className="text-sm text-neutral-500">starting price</span>
            </>
          ) : (
            <span className="text-sm font-medium text-neutral-500">No services yet</span>
          )}
        </div>

        {/* Rating row */}
        <div className="flex items-center gap-1.5 text-sm text-neutral-600">
          <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />
          {reviewStats.average ? (
            <span>
              <span className="font-semibold text-neutral-900">{reviewStats.average.toFixed(1)}</span>
              <span className="text-neutral-400"> · {reviewStats.count} {reviewStats.count === 1 ? "review" : "reviews"}</span>
            </span>
          ) : (
            <span className="text-neutral-400">No reviews yet</span>
          )}
        </div>

        {/* Service tags */}
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

        {/* Category chips — handles both system and custom categories */}
        {showCategoryChips && (
          <div className="flex flex-wrap gap-1.5" aria-label="Service categories">
            {nonOtherEntries.slice(0, 3).map(([key, label]) => (
              <span
                className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
                key={key}
              >
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Availability */}
        {showAvailability && (
          <div className={`rounded-xl px-3 py-2.5 text-sm font-medium ${availabilityClass}`} aria-live="polite">
            {availabilityLabel}
          </div>
        )}

        {/* Actions */}
        {barberId ? (
          <div className="flex flex-col gap-2">
            <Button
              as={Link}
              to={`/specialists/${barberId}/profile`}
              className="w-full sm:w-full"
              variant="outline"
            >
              <UserRound className="mr-2 h-4 w-4" aria-hidden="true" />
              View Profile
            </Button>

            {hasBookableServices ? (
              <Button as={Link} className="w-full" state={bookingState} to={bookingPath}>
                Book now
              </Button>
            ) : (
              <Button className="w-full" disabled title="No active services available">
                No services yet
              </Button>
            )}

            <Button
              as={Link}
              className="w-full"
              state={{ user: barber }}
              to={`/messages/${barberId}`}
              variant="outline"
            >
              <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              Message
            </Button>
          </div>
        ) : (
          <Button className="w-full" disabled>
            Profile unavailable
          </Button>
        )}
        {showSalonsModal && (
          <SalonListModal
            barberName={barber?.name || ""}
            isOpen={showSalonsModal}
            onClose={() => setShowSalonsModal(false)}
            onSelectSalon={handleSelectSalon}
            salons={approvedSalons}
          />
        )}
      </CardContent>
    </Card>
  );
}
