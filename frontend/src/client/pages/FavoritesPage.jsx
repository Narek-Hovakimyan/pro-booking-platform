import { Heart, HeartCrack, MapPin, Phone, Star, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";

import { getBookingBarberId, getBookingSalonId, getEntityId } from "@/client/utils/bookingStatusUtils";
import { uniqueById } from "@/client/utils/favoriteHelpers";
import { getEligibleBookingByBarberId, getFavoriteRemovalKey, getVisibleFavoriteBarbers, normalizeFavoriteRemovalId, useFavoriteBarberSummaries } from "@/client/hooks/useFavoriteBarberSummaries";

import api from "@/shared/api/axios";
import FavoriteBarberCard from "@/client/components/favorites/FavoriteBarberCard";
import {
  BarberCardSkeleton,
  SalonCardSkeleton,
} from "@/shared/components/LoadingSkeletons";
import { Container } from "@/shared/components/ui/Container";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
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
  const tabIdBase = useId();
  const [activeTab, setActiveTab] = useState("barbers");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingFavoriteRemovals, setPendingFavoriteRemovals] = useState({});
  const { currentUser } = useSelector((state) => state.auth);
  const users = useSelector((state) => state.users);
  const services = useSelector((state) => state.services);
  const reviews = useSelector((state) => state.reviews);
  const favorites = useSelector((state) => state.favorites);
  const bookings = useSelector((state) => state.bookings);
  const pendingFavoriteRemovalsRef = useRef({});
  const currentUserRef = useRef(currentUser || null);
  const { availabilityStatusByBarberId, barbersById: summaryBarbersById, firstAvailableSlotByBarberId, hasLoadedCardSummary, reviewStatsByBarberId: summaryReviewStatsByBarberId, servicesByBarberId: summaryServicesByBarberId } = useFavoriteBarberSummaries({ favorites, clientId: currentUser?.id });

  useEffect(() => {
    currentUserRef.current = currentUser || null;
  }, [currentUser]);

  const isFavoriteRemovalPending = (type, entityId) => {
    const removalKey = getFavoriteRemovalKey(currentUser?.id, type, entityId);
    return removalKey ? Boolean(pendingFavoriteRemovals[removalKey]) : false;
  };

  const beginFavoriteRemoval = (clientId, type, entityId) => {
    const removalKey = getFavoriteRemovalKey(clientId, type, entityId);
    if (!removalKey || pendingFavoriteRemovalsRef.current[removalKey]) return null;
    const nextPendingRemovals = { ...pendingFavoriteRemovalsRef.current, [removalKey]: true };
    pendingFavoriteRemovalsRef.current = nextPendingRemovals;
    setPendingFavoriteRemovals(nextPendingRemovals);
    return removalKey;
  };

  const endFavoriteRemoval = (removalKey) => {
    if (!removalKey || !pendingFavoriteRemovalsRef.current[removalKey]) return;
    const nextPendingRemovals = { ...pendingFavoriteRemovalsRef.current };
    delete nextPendingRemovals[removalKey];
    pendingFavoriteRemovalsRef.current = nextPendingRemovals;
    setPendingFavoriteRemovals(nextPendingRemovals);
  };

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

  const favoriteBarbers = getVisibleFavoriteBarbers({ favorites, users, clientId: currentUser?.id, barbersById: summaryBarbersById, hasLoadedCardSummary });
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
  const specialistsTabId = `${tabIdBase}-specialists-tab`;
  const salonsTabId = `${tabIdBase}-salons-tab`;
  const specialistsPanelId = `${tabIdBase}-specialists-panel`;
  const salonsPanelId = `${tabIdBase}-salons-panel`;

  const eligibleBookingByBarberId = getEligibleBookingByBarberId(bookings, currentUser?.id);

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

    const rebookPath = selectedSalonId
      ? `/booking/${barberId}?salonId=${encodeURIComponent(selectedSalonId)}`
      : `/booking/${barberId}`;

    navigate(rebookPath, {
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
    if (!currentUser?.id) return;

    const initiatingClientId = normalizeFavoriteRemovalId(currentUser.id);
    const removalKey = beginFavoriteRemoval(initiatingClientId, "barber", barberId);
    if (!removalKey) return;

    setError("");

    try {
      await api.delete(`/favorites/${barberId}`);
      if (normalizeFavoriteRemovalId(currentUserRef.current?.id) !== initiatingClientId) {
        return;
      }

      dispatch(removeFavorite({ clientId: initiatingClientId, barberId }));
    } catch (requestError) {
      if (normalizeFavoriteRemovalId(currentUserRef.current?.id) !== initiatingClientId) {
        return;
      }

      setError(
        requestError.response?.data?.message ||
          "Could not remove favorite. Please try again."
      );
    } finally {
      endFavoriteRemoval(removalKey);
    }
  };

  const removeSavedSalonFavorite = async (salonId) => {
    if (!currentUser?.id) return;

    const initiatingClientId = normalizeFavoriteRemovalId(currentUser.id);
    const removalKey = beginFavoriteRemoval(initiatingClientId, "salon", salonId);
    if (!removalKey) return;

    setError("");

    try {
      await api.delete(`/favorites/salons/${salonId}`);
      if (normalizeFavoriteRemovalId(currentUserRef.current?.id) !== initiatingClientId) {
        return;
      }

      dispatch(removeSalonFavorite({ clientId: initiatingClientId, salonId }));
      dispatch(
        updateCurrentUser({
          favoriteSalons: (currentUserRef.current?.favoriteSalons || []).filter(
            (favoriteSalonId) => String(favoriteSalonId) !== String(salonId)
          ),
        })
      );
    } catch (requestError) {
      if (normalizeFavoriteRemovalId(currentUserRef.current?.id) !== initiatingClientId) {
        return;
      }

      setError(
        requestError.response?.data?.message ||
          "Could not remove salon favorite. Please try again."
      );
    } finally {
      endFavoriteRemoval(removalKey);
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
            Your saved specialists and salons, all in one place.
          </p>
        </div>

        <div
          aria-label="Favorite categories"
          className="inline-flex rounded-xl border border-neutral-200 bg-white p-1 shadow-sm"
          role="tablist"
        >
          <button
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "barbers"
                ? "bg-neutral-950 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
            aria-controls={specialistsPanelId}
            aria-selected={activeTab === "barbers"}
            onClick={() => setActiveTab("barbers")}
            id={specialistsTabId}
            role="tab"
            tabIndex={activeTab === "barbers" ? 0 : -1}
            type="button"
          >
            Specialists ({favoriteBarbers.length})
          </button>
          <button
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              activeTab === "salons"
                ? "bg-neutral-950 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
            aria-controls={salonsPanelId}
            aria-selected={activeTab === "salons"}
            onClick={() => setActiveTab("salons")}
            id={salonsTabId}
            role="tab"
            tabIndex={activeTab === "salons" ? 0 : -1}
            type="button"
          >
            Salons ({favoriteSalons.length})
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

        {activeTab === "barbers" ? (
          <div
            aria-labelledby={specialistsTabId}
            className="space-y-4"
            id={specialistsPanelId}
            role="tabpanel"
            tabIndex={0}
          >
            {initialLoading ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((item) => (
                  <BarberCardSkeleton key={item} />
                ))}
              </div>
            ) : favoriteBarbers.length === 0 ? (
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
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {favoriteBarbers.map((barber) => {
                  const barberId = barber?.id || barber?._id;

                  return (
                    <FavoriteBarberCard
                      availabilitySlot={firstAvailableSlotByBarberId[String(barberId)]}
                      availabilityStatus={availabilityStatusByBarberId[String(barberId)]}
                      barber={barber}
                      eligibleBooking={eligibleBookingByBarberId[barberId]}
                      hasLoadedCardSummary={hasLoadedCardSummary}
                      isRemovalPending={isFavoriteRemovalPending("barber", barberId)}
                      key={barberId}
                      onBookAgain={handleBookAgain(
                        barber,
                        eligibleBookingByBarberId[barberId]
                      )}
                      onRemove={() => removeSavedFavorite(barberId)}
                      reviews={reviews}
                      services={summaryServicesByBarberId[String(barberId)] || services}
                      summaryReviewStats={summaryReviewStatsByBarberId[String(barberId)]}
                    />
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div
            aria-labelledby={salonsTabId}
            className="space-y-4"
            id={salonsPanelId}
            role="tabpanel"
            tabIndex={0}
          >
            {initialLoading ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((item) => (
                  <SalonCardSkeleton key={item} />
                ))}
              </div>
            ) : favoriteSalons.length === 0 ? (
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
                          decoding="async"
                          loading="lazy"
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
                        disabled={isFavoriteRemovalPending("salon", salonId)}
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
        )}
      </div>
    </Container>
  );
}
