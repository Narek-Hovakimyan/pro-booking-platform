import { Heart, MapPin, Phone, Star, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import BarberCard from "@/client/components/BarberCard";
import SalonReviewsList from "@/client/components/salons/SalonReviewsList";
import EmptyState from "@/shared/components/common/EmptyState";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { serviceCategories } from "@/shared/data/serviceCategories";
import { getMediaUrl } from "@/shared/utils/media";

const getBarberId = (barber) => barber?.id || barber?._id;

const hasActiveServiceInCategory = (services, barberId, category) =>
  !category ||
  (services || []).some(
    (service) =>
      service?.active &&
      String(service?.barberId) === String(barberId) &&
      (service?.category || "other") === category
  );

export default function SelectedSalonView({
  currentUser,
  favorites,
  formatReviewDate,
  getId,
  getInitial,
  getReviewClientAvatar,
  getReviewClientName,
  isSalonFavorite,
  onBack,
  onToggleBarberFavorite,
  onToggleSalonFavorite,
  reviews,
  selectedBarbers,
  selectedSalon,
  selectedSalonRating,
  selectedSalonReviews,
  selectedSalonReviewsCount,
  services,
}) {
  const [selectedCategory, setSelectedCategory] = useState("");
  const visibleBarbers = useMemo(
    () =>
      selectedBarbers.filter((barber) =>
        hasActiveServiceInCategory(services, getBarberId(barber), selectedCategory)
      ),
    [selectedBarbers, selectedCategory, services]
  );

  return (
    <div className="space-y-5">
      <Button variant="outline" onClick={onBack}>
        Back to salons
      </Button>

      <Card className="rounded-2xl sm:rounded-3xl">
        <CardContent className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[320px_1fr]">
          <div className="relative">
            {selectedSalon?.imageUrl ? (
              <img
                alt={selectedSalon?.name || "Salon image"}
                className="aspect-[4/3] w-full rounded-2xl object-cover"
                src={getMediaUrl(selectedSalon.imageUrl)}
              />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-neutral-100">
                <UserRound className="h-16 w-16 text-neutral-400" />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {selectedSalon?.name}
                </h2>
                {selectedSalon?.city && (
                  <p className="mt-2 flex items-center gap-2 text-sm text-neutral-500">
                    <MapPin className="h-4 w-4" />
                    {selectedSalon.city}
                  </p>
                )}
                {selectedSalon?.address && (
                  <p className="mt-1 text-sm text-neutral-500">
                    {selectedSalon.address}
                  </p>
                )}
                {selectedSalon?.phone && (
                  <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
                    <Phone className="h-4 w-4" />
                    {selectedSalon.phone}
                  </p>
                )}
              </div>

              {currentUser?.role === "client" && selectedSalon && (
                <Button
                  aria-label={
                    isSalonFavorite(getId(selectedSalon))
                      ? "Remove salon from favorites"
                      : "Add salon to favorites"
                  }
                  onClick={() => onToggleSalonFavorite(selectedSalon)}
                  variant={isSalonFavorite(getId(selectedSalon)) ? "default" : "outline"}
                >
                  <Heart
                    className={`mr-2 h-4 w-4 ${
                      isSalonFavorite(getId(selectedSalon))
                        ? "fill-white"
                        : ""
                    }`}
                  />
                  {isSalonFavorite(getId(selectedSalon))
                    ? "Favorited"
                    : "Add to favorites"}
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <p className="inline-flex items-center gap-2 rounded-xl bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-900">
                <UserRound className="h-4 w-4 text-neutral-500" />
                {selectedBarbers.length}{" "}
                {selectedBarbers.length === 1 ? "specialist" : "specialists"}
              </p>

              <p className="inline-flex items-center gap-2 rounded-xl bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-900">
                <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                {selectedSalonRating
                  ? `${selectedSalonRating.toFixed(1)} (${selectedSalonReviewsCount} reviews)`
                  : "No reviews yet"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div>
          <h2 className="text-xl font-bold">Salon Reviews</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {selectedSalonRating
              ? `${selectedSalonRating.toFixed(1)} average rating · ${selectedSalonReviewsCount} reviews`
              : "No reviews yet"}
          </p>
        </div>
        <SalonReviewsList
          formatReviewDate={formatReviewDate}
          getInitial={getInitial}
          getReviewClientAvatar={getReviewClientAvatar}
          getReviewClientName={getReviewClientName}
          reviews={selectedSalonReviews}
        />
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 sm:flex sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">Specialists at {selectedSalon?.name}</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Select a specialist to view their profile or book an appointment directly.
            </p>
          </div>
          <label className="grid gap-1.5 text-sm font-semibold sm:w-56">
            Service category
            <select
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 font-normal"
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
            >
              <option value="">All categories</option>
              {serviceCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {visibleBarbers.length === 0 ? (
          <EmptyState
            description={
              selectedCategory
                ? "No approved specialists in this salon have active services in this category."
                : "This salon does not have approved specialists yet."
            }
            title={selectedCategory ? "No matching specialists" : "No specialists in this salon"}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleBarbers.map((barber) => (
              <BarberCard
                barber={barber}
                bookingSalon={selectedSalon}
                currentUser={currentUser}
                favorites={favorites}
                key={barber?.id || barber?._id}
                onToggleFavorite={onToggleBarberFavorite}
                reviews={reviews}
                services={services}
                showAvailability={false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
