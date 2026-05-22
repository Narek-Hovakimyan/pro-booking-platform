import { Heart, MapPin, MessageCircle, Phone, Star, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";

import {
  canBookAgain,
  getBookingBarberId,
  getBookingSalonId,
  getEntityId,
  sortBookingsDescending,
} from "@/client/utils/bookingStatusUtils";

import api from "@/shared/api/axios";
import {
  BarberCardSkeleton,
  SalonCardSkeleton,
} from "@/shared/components/LoadingSkeletons";
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

const CACHE_TTL_MS = 60 * 1000;
const favoritesCacheByClientId = new Map();

const getFavoriteBarberId = (favorite) =>
  favorite?.barberId?.id || favorite?.barberId?._id || favorite?.barberId;

const getFavoriteSalonId = (favorite) =>
  favorite?.salonId?.id || favorite?.salonId?._id || favorite?.salonId;

const uniqueById = (items) => {
  const seenIds = new Set();

  return items.filter((item) => {
    const itemId = item?.id || item?._id;

    if (!itemId) return false;
    if (seenIds.has(String(itemId))) return false;

    seenIds.add(String(itemId));
    return true;
  });
};

function getStartingPrice(services, barberId) {
  const prices = services
    .filter(
      (service) =>
        String(service.barberId) === String(barberId) && service.active
    )
    .map((service) => Number(service.price))
    .filter(Number.isFinite);

  return prices.length > 0 ? Math.min(...prices) : null;
}

export default function FavoritesPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("barbers");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { currentUser } = useSelector((state) => state.auth);
  const users = useSelector((state) => state.users);
  const services = useSelector((state) => state.services);
  const favorites = useSelector((state) => state.favorites);
  const bookings = useSelector((state) => state.bookings);
  const hadFavoritesOnMount = useRef(
    favorites.some(
      (favorite) => String(favorite.clientId) === String(currentUser?.id)
    )
  );

  useEffect(() => {
    if (!currentUser?.id) return;

    let isMounted = true;

    async function loadFavorites() {
      const cachedEntry = favoritesCacheByClientId.get(String(currentUser.id));
      const cachedFavorites = cachedEntry?.barbers;
      const cachedSalonFavorites = cachedEntry?.salons;

      if (cachedFavorites && !hadFavoritesOnMount.current) {
        dispatch(setFavorites(cachedFavorites));
      }
      if (cachedSalonFavorites) {
        dispatch(setSalonFavorites(cachedSalonFavorites));
      }

      if (cachedEntry && Date.now() - cachedEntry.loadedAt < CACHE_TTL_MS) {
        setIsLoading(false);
        return;
      }

      setIsLoading(!cachedFavorites);
      setError("");

      try {
        const [barberFavoritesResponse, salonFavoritesResponse] =
          await Promise.all([
            api.get("/favorites"),
            api.get("/favorites/salons"),
          ]);

        if (isMounted) {
          favoritesCacheByClientId.set(String(currentUser.id), {
            barbers: barberFavoritesResponse.data,
            salons: salonFavoritesResponse.data,
            loadedAt: Date.now(),
          });
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

  const favoriteBarbers = uniqueById(
    (favorites || [])
      .filter(
        (favorite) =>
          favorite?.type !== "salon" &&
          String(favorite.clientId) === String(currentUser?.id)
      )
      .map((favorite) =>
        favorite.barber ||
        users.find(
          (user) =>
            user.role === "barber" &&
            String(user.id) === String(favorite.barberId)
        )
      )
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
      const cachedEntry = favoritesCacheByClientId.get(String(currentUser.id));

      if (cachedEntry) {
        favoritesCacheByClientId.set(String(currentUser.id), {
          ...cachedEntry,
          barbers: (cachedEntry.barbers || []).filter(
            (favorite) => String(getFavoriteBarberId(favorite)) !== String(barberId)
          ),
        });
      }
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
      const cachedEntry = favoritesCacheByClientId.get(String(currentUser.id));

      if (cachedEntry) {
        favoritesCacheByClientId.set(String(currentUser.id), {
          ...cachedEntry,
          salons: (cachedEntry.salons || []).filter(
            (favorite) => String(getFavoriteSalonId(favorite)) !== String(salonId)
          ),
        });
      }
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not remove salon favorite. Please try again."
      );
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Favorites</h1>
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
          Barbers
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
        <p className="text-sm text-neutral-500">Refreshing favorites...</p>
      )}

      {initialLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            activeTab === "barbers" ? (
              <BarberCardSkeleton key={item} />
            ) : (
              <SalonCardSkeleton key={item} />
            )
          ))}
        </div>
      ) : activeTab === "barbers" && favoriteBarbers.length === 0 ? (
        <Card className="rounded-2xl sm:rounded-3xl">
          <CardContent className="p-5 text-neutral-500 sm:p-6">
            No favorite barbers yet
          </CardContent>
        </Card>
      ) : activeTab === "salons" && favoriteSalons.length === 0 ? (
        <Card className="rounded-2xl sm:rounded-3xl">
          <CardContent className="p-5 text-neutral-500 sm:p-6">
            No favorite salons yet
          </CardContent>
        </Card>
      ) : activeTab === "barbers" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {favoriteBarbers.map((barber) => {
            const barberId = barber?.id || barber?._id;
            const startingPrice = getStartingPrice(services, barberId);
            const eligibleBooking = eligibleBookingByBarberId[barberId];
            const showBookAgain = Boolean(eligibleBooking);

            return (
              <Card key={barberId} className="rounded-2xl sm:rounded-3xl">
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

                  <div>
                    <h2 className="text-xl font-bold">{barber.name}</h2>
                    <p className="text-sm text-neutral-500">
                      {barber.city || "City not set"}
                    </p>
                  </div>

                  <p className="rounded-xl bg-neutral-50 p-3 text-sm font-semibold text-neutral-900">
                    {startingPrice
                      ? `Starting from ${startingPrice.toLocaleString()} դրամ`
                      : "No services yet"}
                  </p>

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
                    to={`/barbers/${barberId}/profile`}
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {favoriteSalons.map((salon) => {
            const salonId = salon?.id || salon?._id;
            const barbers = salon?.barbers || [];

            return (
              <Card className="rounded-2xl sm:rounded-3xl" key={salonId}>
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
                    <h2 className="text-xl font-bold">
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

                  <p className="rounded-xl bg-neutral-50 p-3 text-sm font-semibold text-neutral-900">
                    {barbers.length} {barbers.length === 1 ? "barber" : "barbers"}
                  </p>

                  <p className="text-sm text-neutral-600">
                    <Star className="mr-1 inline-block h-4 w-4 fill-amber-400 text-amber-500" />
                    {Number(salon?.averageRating || 0)
                      ? `${Number(salon.averageRating).toFixed(1)} (${
                          Number(salon?.totalReviews ?? salon?.reviewsCount ?? 0)
                        } reviews)`
                      : "No reviews yet"}
                  </p>

                  <Button
                    as={Link}
                    className="w-full"
                    to={`/salons/${salonId}`}
                    variant="outline"
                  >
                    View barbers
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
