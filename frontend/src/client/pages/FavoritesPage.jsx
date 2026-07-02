import { Heart, HeartCrack, MapPin, MessageCircle, Phone, Star, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";

import {
  canBookAgain,
  getBookingBarberId,
  getBookingSalonId,
  getEntityId,
  sortBookingsDescending,
} from "@/client/utils/bookingStatusUtils";
import {
  AVAILABILITY_STATUS,
  uniqueById,
  getStartingPrice,
  getBarberId,
  mapByBarberId,
  getReviewStatsFromReviews,
  getActiveServicesForBarber,
} from "@/client/utils/favoriteHelpers";

import api from "@/shared/api/axios";
import { getSpecialistProfessionDisplay } from "@/shared/data/professions";
import {
  BarberCardSkeleton,
  SalonCardSkeleton,
} from "@/shared/components/LoadingSkeletons";
import { Container } from "@/shared/components/ui/Container";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { getUniqueDisplayCategoryEntries } from "@/client/utils/favoriteHelpers";
import { formatAvailabilityLabel, getAvailabilityTone } from "@/shared/utils/availability";
import {
  removeFavorite,
  removeSalonFavorite,
  setFavorites,
  setSalonFavorites,
} from "@/store/slices/favoritesSlice";
import { fetchClientBookings } from "@/store/slices/bookingsSlice";
import { updateCurrentUser } from "@/store/slices/authSlice";
import { getMediaUrl } from "@/shared/utils/media";

export default function FavoritesPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("barbers");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [firstAvailableSlotByBarberId, setFirstAvailableSlotByBarberId] = useState({});
  const [availabilityStatusByBarberId, setAvailabilityStatusByBarberId] = useState({});
  const [summaryBarbersById, setSummaryBarbersById] = useState({});
  const [summaryServicesByBarberId, setSummaryServicesByBarberId] = useState({});
  const [summaryReviewStatsByBarberId, setSummaryReviewStatsByBarberId] = useState({});
  const [hasLoadedCardSummary, setHasLoadedCardSummary] = useState(false);
  const { currentUser } = useSelector((state) => state.auth);
  const users = useSelector((state) => state.users);
  const services = useSelector((state) => state.services);
  const reviews = useSelector((state) => state.reviews);
  const favorites = useSelector((state) => state.favorites);
  const bookings = useSelector((state) => state.bookings);

  useEffect(() => {
    if (!currentUser?.id) return;

    let isMounted = true;

    async function loadFavorites() {
      setIsLoading(true);
      setError("");

      try {
        const [barberFavoritesResponse, salonFavoritesResponse] =
          await Promise.all([
            api.get("/favorites"),
            api.get("/favorites/salons"),
          ]);

        if (isMounted) {
          dispatch(setFavorites(barberFavoritesResponse.data));
          dispatch(setSalonFavorites(salonFavoritesResponse.data));
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Could not load favorites. Please try again."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadFavorites();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, dispatch]);

  // Non-blocking fetch of client bookings for "Book again" inference
  useEffect(() => {
    if (!currentUser?.id) return;

    dispatch(fetchClientBookings(currentUser.id));
  }, [currentUser?.id, dispatch]);

  // Non-blocking card-summary fetch for enriched barber data, services, review stats, and availability
  useEffect(() => {
    if (!currentUser?.id) return;

    let isMounted = true;

    async function fetchCardSummaryForFavorites() {
      try {
        const { data } = await api.get("/barbers/card-summary");
        if (!isMounted) return;

        // Build barber map by id for merging with favorite barbers
        const barbersById = {};
        (data.barbers || []).forEach((barber) => {
          const bid = String(getBarberId(barber) || "");
          if (bid) barbersById[bid] = barber;
        });
        setSummaryBarbersById(barbersById);

        // Build services map by barberId
        const servicesByBarberId = {};
        (data.services || []).forEach((service) => {
          const bid = String(service.barberId || "");
          if (!bid) return;
          if (!servicesByBarberId[bid]) servicesByBarberId[bid] = [];
          servicesByBarberId[bid].push(service);
        });
        setSummaryServicesByBarberId(servicesByBarberId);

        // Build review stats map by barberId
        const reviewStatsByBarberId = {};
        (data.reviewStats || []).forEach((stat) => {
          const bid = String(stat.barberId || "");
          if (bid) reviewStatsByBarberId[bid] = stat;
        });
        setSummaryReviewStatsByBarberId(reviewStatsByBarberId);

        // Build availability maps
        const availabilityItems = mapByBarberId(data.availability || []);
        setFirstAvailableSlotByBarberId(
          Object.fromEntries(
            Object.entries(availabilityItems).map(([barberId, item]) => [
              barberId,
              item?.firstAvailableSlot || null,
            ])
          )
        );
        setAvailabilityStatusByBarberId(
          Object.fromEntries(
            (data.barbers || [])
              .map((barber) => {
                const bid = String(getBarberId(barber) || "");
                if (!bid) return null;
                return [bid, availabilityItems[bid]?.status || AVAILABILITY_STATUS.READY];
              })
              .filter(Boolean)
          )
        );
      } catch {
        // Card-summary is best-effort enrichment; fall through silently.
      } finally {
        if (isMounted) {
          setHasLoadedCardSummary(true);
        }
      }
    }

    fetchCardSummaryForFavorites();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);

  const favoriteBarbers = uniqueById(
    (favorites || [])
      .filter(
        (favorite) =>
          favorite?.type !== "salon" &&
          String(favorite.clientId) === String(currentUser?.id)
      )
      .map((favorite) => {
        const barberFromFavorite = favorite.barber;
        const barberFromRedux = users.find(
          (user) =>
            user.role === "barber" &&
            String(user.id) === String(favorite.barberId)
        );
        const barberId = barberFromFavorite?.id || barberFromFavorite?._id || barberFromRedux?.id || barberFromRedux?._id || String(favorite.barberId);
        const summaryBarber = summaryBarbersById[String(barberId)];
        // Merge: card-summary data is always freshest, fallback to favorite, then Redux
        return { ...(barberFromFavorite || barberFromRedux), ...summaryBarber, id: summaryBarber?.id || summaryBarber?._id || barberId };
      })
      .filter(Boolean)
  );
  const favoriteSalons = uniqueById(
    (favorites || [])
      .filter(
        (favorite) =>
          favorite?.type === "salon" &&
          String(favorite.clientId) === String(currentUser?.id)
      )
      .map((favorite) => favorite.salon)
      .filter(Boolean)
  );
  const activeItems =
    activeTab === "barbers" ? favoriteBarbers : favoriteSalons;
  const initialLoading = isLoading && activeItems.length === 0;
  const refreshing = isLoading && activeItems.length > 0;

  // Derive latest eligible booking per barber for "Book again" CTA
  const clientBookings = (currentUser?.id
    ? (bookings || []).filter(
        (booking) => String(booking.clientId) === String(currentUser.id)
      )
    : []
  ).filter(canBookAgain);
  const sortedEligibleBookings = [...clientBookings].sort(sortBookingsDescending);
  const eligibleBookingByBarberId = {};
  for (const booking of sortedEligibleBookings) {
    const barberId = getBookingBarberId(booking);
    if (barberId && !eligibleBookingByBarberId[barberId]) {
      eligibleBookingByBarberId[barberId] = booking;
    }
  }

  const handleBookAgain = (barber, eligibleBooking) => (event) => {
    event.preventDefault();

    const barberId = barber?.id || getBookingBarberId(eligibleBooking);
    const service =
      eligibleBooking.service && typeof eligibleBooking.service === "object"
        ? eligibleBooking.service
        : null;
    const serviceId =
      eligibleBooking.serviceId || getEntityId(eligibleBooking.service);
    const selectedSalonId =
      getBookingSalonId(eligibleBooking) || undefined;
    const salon =
      eligibleBooking.salon && typeof eligibleBooking.salon === "object"
        ? eligibleBooking.salon
        : null;

    navigate(`/booking/${barberId}`, {
      state: {
        rebook: true,
        barber,
        barberId,
        service,
        serviceId,
        selectedSalonId,
        salon,
      },
    });
  };

  const removeSavedFavorite = async (barberId) => {
    setError("");

    try {
      await api.delete(`/favorites/${barberId}`);
      dispatch(removeFavorite({ clientId: currentUser.id, barberId }));
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not remove favorite. Please try again."
      );
    }
  };

  const removeSavedSalonFavorite = async (salonId) => {
    setError("");

    try {
      await api.delete(`/favorites/salons/${salonId}`);
      dispatch(removeSalonFavorite({ clientId: currentUser.id, salonId }));
      dispatch(
        updateCurrentUser({
          favoriteSalons: (currentUser?.favoriteSalons || []).filter(
            (favoriteSalonId) => String(favoriteSalonId) !== String(salonId)
          ),
        })
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not remove salon favorite. Please try again."
      );
    }
  };

  return (
    <Container size="wide">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            Favorites
          </h1>
          <p className="mt-2 text-neutral-500">
            Քո պահպանած վարսահարդարներն ու սրահները։
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-neutral-200 bg-white p-1 shadow-sm">
          <button
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "barbers"
                ? "bg-neutral-950 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
            onClick={() => setActiveTab("barbers")}
            type="button"
          >
            Specialists
          </button>
          <button
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "salons"
                ? "bg-neutral-950 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
            onClick={() => setActiveTab("salons")}
            type="button"
          >
            Salons
          </button>
        </div>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {refreshing && (
          <div className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500" />
            Refreshing favorites...
          </div>
        )}

        {initialLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              activeTab === "barbers" ? (
                <BarberCardSkeleton key={item} />
              ) : (
                <SalonCardSkeleton key={item} />
              )
            ))}
          </div>
        ) : activeTab === "barbers" && favoriteBarbers.length === 0 ? (
          <Card className="rounded-2xl text-center shadow-card sm:rounded-3xl">
            <CardContent className="space-y-4 p-8">
              <HeartCrack className="mx-auto h-10 w-10 text-neutral-300" />
              <div>
                <h3 className="font-semibold text-neutral-950">No favorite specialists yet</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Start browsing and save your favorite specialists for quick access.
                </p>
              </div>
              <Button as={Link} to="/specialists" size="lg">
                Browse specialists
              </Button>
            </CardContent>
          </Card>
        ) : activeTab === "salons" && favoriteSalons.length === 0 ? (
          <Card className="rounded-2xl text-center shadow-card sm:rounded-3xl">
            <CardContent className="space-y-4 p-8">
              <HeartCrack className="mx-auto h-10 w-10 text-neutral-300" />
              <div>
                <h3 className="font-semibold text-neutral-950">No favorite salons yet</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Discover salons and save your favorites for later.
                </p>
              </div>
              <Button as={Link} to="/salons" size="lg">
                Browse salons
              </Button>
            </CardContent>
          </Card>
        ) : activeTab === "barbers" ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {favoriteBarbers.map((barber) => {
              const barberId = barber?.id || barber?._id;
              const bid = String(barberId);
              const favServices = summaryServicesByBarberId[bid] || services;
              const startingPrice = getStartingPrice(favServices, barberId);
              const eligibleBooking = eligibleBookingByBarberId[barberId];
              const showBookAgain = Boolean(eligibleBooking);
              const barberActiveServices = getActiveServicesForBarber(favServices, barberId);
              const mainServices = barberActiveServices.slice(0, 3);
              const displayCategoryEntries = getUniqueDisplayCategoryEntries(barberActiveServices);
              const nonOtherEntries = displayCategoryEntries.filter(
                ([key]) => !key.startsWith("system:other")
              );
              const showCategoryChips = nonOtherEntries.length > 0;
              const hasBookableServices = barberActiveServices.length > 0;
              const reviewStats = summaryReviewStatsByBarberId[bid] || getReviewStatsFromReviews(reviews, barberId);
              const availabilitySlot = firstAvailableSlotByBarberId[String(barberId)];
              const availStatus = availabilityStatusByBarberId[String(barberId)];
              const availabilityTone =
                !hasBookableServices
                  ? "services"
                  : availStatus === "loading"
                    ? "services"
                    : availStatus === "unavailable"
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
                  : !availStatus
                    ? "Checking availability..."
                    : availStatus === "unavailable"
                      ? "Schedule unavailable"
                      : formatAvailabilityLabel(availabilitySlot);

              return (
                <Card key={barberId} className="rounded-2xl shadow-card transition-shadow hover:shadow-card-hover sm:rounded-3xl">
                  <CardContent className="space-y-4 p-4 sm:p-6">
                    <div className="relative">
                      {barber.imageUrl ? (
                        <img
                          alt={barber.name}
                          className="aspect-[4/3] w-full rounded-2xl object-cover"
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
                        onClick={() => removeSavedFavorite(barberId)}
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

                    {/* Pricing */}
                    <div className="flex items-center gap-2 rounded-xl bg-brand-50 p-3">
                      {startingPrice ? (
                        <>
                          <span className="text-lg font-bold text-neutral-900">
                            {startingPrice.toLocaleString()} դրամ
                          </span>
                          <span className="text-sm text-neutral-500">starting price</span>
                        </>
                      ) : (
                        <span className="text-sm font-medium text-neutral-500">No services yet</span>
                      )}
                    </div>

                    {/* Service chips */}
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

                    {/* Category chips — brand accent */}
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

                    {/* Availability widget — only show after card-summary loads */}
                    {hasLoadedCardSummary && availStatus !== undefined && (
                      <div className={`rounded-xl px-3 py-2.5 text-sm font-medium ${availabilityClass}`}>
                        {availabilityLabel}
                      </div>
                    )}

                    {/* Actions */}
                    {showBookAgain ? (
                      <Button
                        className="w-full"
                        onClick={handleBookAgain(barber, eligibleBooking)}
                      >
                        Book again
                      </Button>
                    ) : (
                      <Button
                        as={Link}
                        state={{ barber }}
                        to={`/booking/${barberId}`}
                        className="w-full"
                      >
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
                      View Profile
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
            })}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {favoriteSalons.map((salon) => {
              const salonId = salon?.id || salon?._id;
              const barbers = salon?.barbers || [];

              return (
                <Card className="rounded-2xl shadow-card transition-shadow hover:shadow-card-hover sm:rounded-3xl" key={salonId}>
                  <CardContent className="space-y-4 p-4 sm:p-6">
                    <div className="relative">
                      {salon?.imageUrl ? (
                        <img
                          alt={salon?.name || "Salon"}
                          className="aspect-[4/3] w-full rounded-2xl object-cover"
                          src={getMediaUrl(salon.imageUrl)}
                        />
                      ) : (
                        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-neutral-100">
                          <UserRound className="h-12 w-12 text-neutral-400" />
                        </div>
                      )}

                      <Button
                        aria-label="Remove salon favorite"
                        className="absolute right-3 top-3 bg-white"
                        onClick={() => removeSavedSalonFavorite(salonId)}
                        size="icon"
                        variant="outline"
                      >
                        <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                      </Button>
                    </div>

                    <div>
                      <h2 className="text-xl font-bold tracking-tight text-neutral-950">
                        {salon?.name || "Salon"}
                      </h2>
                      {salon?.city && (
                        <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
                          <MapPin className="h-4 w-4" />
                          {salon.city}
                        </p>
                      )}
                      {salon?.address && (
                        <p className="mt-1 text-sm text-neutral-500">
                          {salon.address}
                        </p>
                      )}
                      {salon?.phone && (
                        <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
                          <Phone className="h-4 w-4" />
                          {salon.phone}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 rounded-xl bg-brand-50 p-3">
                      <span className="text-lg font-bold text-neutral-900">
                        {barbers.length}
                      </span>
                      <span className="text-sm text-neutral-500">{barbers.length === 1 ? "specialist" : "specialists"}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-sm text-neutral-600">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                      {Number(salon?.averageRating || 0)
                        ? (
                          <span>
                            <span className="font-semibold text-neutral-900">
                              {Number(salon.averageRating).toFixed(1)}
                            </span>
                            <span className="text-neutral-400">
                              {" · "}{Number(salon?.totalReviews ?? salon?.reviewsCount ?? 0)} review{(salon?.totalReviews ?? salon?.reviewsCount ?? 0) !== 1 ? "s" : ""}
                            </span>
                          </span>
                        ) : (
                          <span className="text-neutral-400">No reviews yet</span>
                        )}
                    </div>

                    <Button
                      as={Link}
                      className="w-full"
                      to={`/salons/${salonId}`}
                      variant="outline"
                    >
                      View specialists
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Container>
  );
}
