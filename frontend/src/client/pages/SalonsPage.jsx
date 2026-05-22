import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import api from "@/shared/api/axios";
import Drawer from "@/shared/components/common/Drawer";
import SalonsFiltersPanel from "@/client/components/salons/SalonsFiltersPanel";
import SalonsListContent from "@/client/components/salons/SalonsListContent";
import SalonsPageHeader from "@/client/components/salons/SalonsPageHeader";
import SalonsStatusMessages from "@/client/components/salons/SalonsStatusMessages";
import SelectedSalonView from "@/client/components/salons/SelectedSalonView";
import { Button } from "@/shared/components/ui/button";
import {
  addFavorite,
  addSalonFavorite,
  removeFavorite,
  removeSalonFavorite,
  setFavorites,
  setSalonFavorites,
} from "@/store/slices/favoritesSlice";
import { updateCurrentUser } from "@/store/slices/authSlice";
import { setReviews } from "@/store/slices/reviewsSlice";
import { setServices } from "@/store/slices/servicesSlice";

let salonsCache = [];
let salonsLoadedAt = 0;
const CACHE_TTL_MS = 60 * 1000;

const getId = (item) =>
  typeof item === "string" ? item : item?.id || item?._id;

function formatReviewDate(date) {
  if (!date) return "";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function getReviewClientName(review) {
  return review?.clientId?.name || review?.client?.name || review?.clientName || "Client";
}

function getReviewClientAvatar(review) {
  return (
    review?.clientId?.avatarUrl ||
    review?.client?.avatarUrl ||
    review?.clientAvatarUrl ||
    ""
  );
}

function getInitial(name = "Client") {
  return name.trim().charAt(0).toUpperCase() || "C";
}

export default function SalonsPage() {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const services = useSelector((state) => state.services);
  const reviews = useSelector((state) => state.reviews);
  const favorites = useSelector((state) => state.favorites);
  const [salons, setSalons] = useState(salonsCache);
  const [selectedSalon, setSelectedSalon] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedAddress, setSelectedAddress] = useState("");
  const [salonReviewsById, setSalonReviewsById] = useState({});
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(salonsCache.length === 0);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadSalons() {
      if (Date.now() - salonsLoadedAt < CACHE_TTL_MS) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const { data } = await api.get("/salons");
        const nextSalons = data || [];
        const approvedBarbers = nextSalons.flatMap(
          (salon) => salon?.barbers || []
        );

        if (!isMounted) return;

        salonsCache = nextSalons;
        salonsLoadedAt = Date.now();
        setSalons(nextSalons);
        setIsLoading(false);

        void Promise.allSettled(
          approvedBarbers.map(async (barber) => {
            const barberId = barber?.id || barber?._id;

            if (!barberId) return;

            const [servicesResponse, reviewsResponse] = await Promise.all([
              api.get(`/services/${barberId}`),
              api.get(`/reviews/${barberId}`),
            ]);

            if (!isMounted) return;

            dispatch(
              setServices({
                barberId,
                services: servicesResponse.data,
              })
            );
            dispatch(
              setReviews({
                barberId,
                reviews: reviewsResponse.data,
              })
            );
          })
        );

        if (currentUser?.id) {
          void Promise.all([api.get("/favorites"), api.get("/favorites/salons")])
            .then(([favoritesResponse, salonFavoritesResponse]) => {
              if (isMounted) {
                dispatch(setFavorites(favoritesResponse.data));
                dispatch(setSalonFavorites(salonFavoritesResponse.data));
              }
            })
            .catch(() => {});
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Could not load salons. Please try again."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadSalons();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, dispatch]);

  useEffect(() => {
    const salonId = getId(selectedSalon);

    if (!salonId || salonReviewsById[String(salonId)]) return undefined;

    let isMounted = true;

    api
      .get(`/salon-reviews/salon/${salonId}`)
      .then(({ data }) => {
        if (isMounted) {
          setSalonReviewsById((currentReviews) => ({
            ...currentReviews,
            [String(salonId)]: data?.reviews || [],
          }));
          setSelectedSalon((currentSalon) =>
            String(getId(currentSalon)) === String(salonId)
              ? {
                  ...currentSalon,
                  averageRating: data?.averageRating ?? currentSalon?.averageRating,
                  totalReviews: data?.totalReviews ?? currentSalon?.totalReviews,
                  reviewsCount: data?.totalReviews ?? currentSalon?.reviewsCount,
                }
              : currentSalon
          );
        }
      })
      .catch(() => {
        if (isMounted) {
          setSalonReviewsById((currentReviews) => ({
            ...currentReviews,
            [String(salonId)]: selectedSalon?.latestReviews || [],
          }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSalon, salonReviewsById]);

  const cities = useMemo(
    () =>
      Array.from(new Set(salons.map((salon) => salon?.city).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b)),
    [salons]
  );
  const addresses = useMemo(
    () =>
      Array.from(
        new Set(salons.map((salon) => salon?.address).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b)),
    [salons]
  );
  const filteredSalons = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return salons.filter((salon) => {
      const salonName = salon?.name?.toLowerCase() || "";
      const searchMatches = !searchTerm || salonName.includes(searchTerm);
      const cityMatches = !selectedCity || salon?.city === selectedCity;
      const addressMatches =
        !selectedAddress || salon?.address === selectedAddress;

      return searchMatches && cityMatches && addressMatches;
    });
  }, [salons, search, selectedAddress, selectedCity]);
  const favoriteSalonIds = useMemo(() => {
    const userFavoriteIds = (currentUser?.favoriteSalons || []).map(getId);
    const stateFavoriteIds = (favorites || [])
      .filter(
        (favorite) =>
          favorite?.type === "salon" &&
          String(favorite?.clientId) === String(currentUser?.id)
      )
      .map((favorite) => getId(favorite?.salonId) || getId(favorite?.salon));

    return new Set(
      [...userFavoriteIds, ...stateFavoriteIds]
        .filter(Boolean)
        .map((id) => String(id))
    );
  }, [currentUser?.favoriteSalons, currentUser?.id, favorites]);
  const favoriteBarberIds = useMemo(() => {
    const userFavoriteIds = [
      ...(currentUser?.favoriteBarbers || []),
      ...(currentUser?.favorites || []),
    ].map((favorite) => getId(favorite?.barberId) || getId(favorite));
    const stateFavoriteIds = (favorites || [])
      .filter(
        (favorite) =>
          favorite?.type !== "salon" &&
          String(favorite?.clientId) === String(currentUser?.id)
      )
      .map((favorite) => getId(favorite?.barberId) || getId(favorite?.barber));

    return new Set(
      [...userFavoriteIds, ...stateFavoriteIds]
        .filter(Boolean)
        .map((id) => String(id))
    );
  }, [currentUser?.favoriteBarbers, currentUser?.favorites, currentUser?.id, favorites]);
  const sortedSalons = useMemo(
    () =>
      [...filteredSalons].sort((a, b) => {
        const aFav = favoriteSalonIds.has(String(getId(a)));
        const bFav = favoriteSalonIds.has(String(getId(b)));

        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;

        return 0;
      }),
    [favoriteSalonIds, filteredSalons]
  );

  const resetFilters = () => {
    setSearch("");
    setSelectedCity("");
    setSelectedAddress("");
  };
  const hasActiveFilters =
    Boolean(search.trim()) || Boolean(selectedCity) || Boolean(selectedAddress);
  const activeFiltersCount =
    (search.trim() ? 1 : 0) + (selectedCity ? 1 : 0) + (selectedAddress ? 1 : 0);
  const filterChips = [
    search.trim()
      ? { label: search.trim(), onRemove: () => setSearch("") }
      : null,
    selectedCity
      ? { label: selectedCity, onRemove: () => setSelectedCity("") }
      : null,
    selectedAddress
      ? { label: selectedAddress, onRemove: () => setSelectedAddress("") }
      : null,
  ].filter(Boolean);
  const refreshing = isLoading && salons.length > 0;

  useEffect(() => {
    if (!isFilterDrawerOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setIsFilterDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isFilterDrawerOpen]);

  const selectedBarbers = useMemo(() => {
    const salonId = selectedSalon?.id || selectedSalon?._id;

    return (selectedSalon?.barbers || [])
      .filter((barber) => {
        const barberSalonId =
          barber?.salon?.id || barber?.salon?._id || barber?.salon;

        return (
          barber?.salonStatus === "approved" &&
          (!salonId ||
            !barberSalonId ||
            String(barberSalonId) === String(salonId))
        );
      })
      .sort((a, b) => {
        const aFav = favoriteBarberIds.has(String(getId(a)));
        const bFav = favoriteBarberIds.has(String(getId(b)));

        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;

        return 0;
      });
  }, [favoriteBarberIds, selectedSalon]);
  const selectedSalonId = getId(selectedSalon);
  const selectedSalonReviews =
    salonReviewsById[String(selectedSalonId)] || selectedSalon?.latestReviews || [];
  const selectedSalonRating = Number(selectedSalon?.averageRating || 0);
  const selectedSalonReviewsCount = Number(
    selectedSalon?.totalReviews ?? selectedSalon?.reviewsCount ?? 0
  );

  const toggleFavorite = async (barber) => {
    if (!currentUser?.id || !barber) return;

    try {
      const barberId = barber.id || barber._id;
      const isFavorited = favorites.some(
        (favorite) =>
          String(favorite.clientId) === String(currentUser.id) &&
          String(favorite.barberId) === String(barberId)
      );

      if (isFavorited) {
        await api.delete(`/favorites/${barberId}`);
        dispatch(removeFavorite({ clientId: currentUser.id, barberId }));
        return;
      }

      const { data } = await api.post("/favorites", { barberId });
      dispatch(addFavorite(data));
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not update favorite. Please try again."
      );
    }
  };

  const isSalonFavorite = (salonId) =>
    (favorites || []).some(
      (favorite) =>
        favorite?.type === "salon" &&
        String(favorite?.clientId) === String(currentUser?.id) &&
        String(favorite?.salonId) === String(salonId)
    );

  const toggleSalonFavorite = async (salon) => {
    const salonId = salon?.id || salon?._id;

    if (!currentUser?.id || currentUser?.role !== "client" || !salonId) return;

    setError("");

    try {
      if (isSalonFavorite(salonId)) {
        await api.delete(`/favorites/salons/${salonId}`);
        dispatch(removeSalonFavorite({ clientId: currentUser.id, salonId }));
        dispatch(
          updateCurrentUser({
            favoriteSalons: (currentUser?.favoriteSalons || []).filter(
              (favoriteSalonId) => String(favoriteSalonId) !== String(salonId)
            ),
          })
        );
        return;
      }

      const { data } = await api.post(`/favorites/salons/${salonId}`);
      dispatch(addSalonFavorite(data));
      dispatch(
        updateCurrentUser({
          favoriteSalons: Array.from(
            new Set([...(currentUser?.favoriteSalons || []), salonId])
          ),
        })
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not update salon favorite. Please try again."
      );
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <SalonsPageHeader
        activeFiltersCount={activeFiltersCount}
        hasActiveFilters={hasActiveFilters}
        selectedSalon={selectedSalon}
        onOpenFilters={() => setIsFilterDrawerOpen(true)}
        onResetFilters={resetFilters}
      />

      <Drawer
        closeLabel="Close filters"
        description="Refine the salon list instantly."
        footer={
          <>
            <Button onClick={() => setIsFilterDrawerOpen(false)}>
              Apply filters
            </Button>
            <Button onClick={resetFilters} variant="outline">
              Clear filters
            </Button>
          </>
        }
        isOpen={!selectedSalon && isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        title="Filters"
      >
        <SalonsFiltersPanel
          searchTerm={search}
          onSearchChange={setSearch}
          selectedCity={selectedCity}
          onCityChange={setSelectedCity}
          cities={cities}
          selectedAddress={selectedAddress}
          onAddressChange={setSelectedAddress}
          addresses={addresses}
          filterChips={filterChips}
        />
      </Drawer>

      <SalonsStatusMessages
        error={error}
        refreshing={refreshing}
        selectedSalon={selectedSalon}
      />

      {selectedSalon ? (
        <SelectedSalonView
          currentUser={currentUser}
          favorites={favorites}
          formatReviewDate={formatReviewDate}
          getId={getId}
          getInitial={getInitial}
          getReviewClientAvatar={getReviewClientAvatar}
          getReviewClientName={getReviewClientName}
          isSalonFavorite={isSalonFavorite}
          reviews={reviews}
          selectedBarbers={selectedBarbers}
          selectedSalon={selectedSalon}
          selectedSalonRating={selectedSalonRating}
          selectedSalonReviews={selectedSalonReviews}
          selectedSalonReviewsCount={selectedSalonReviewsCount}
          services={services}
          onBack={() => setSelectedSalon(null)}
          onToggleBarberFavorite={toggleFavorite}
          onToggleSalonFavorite={toggleSalonFavorite}
        />
      ) : (
        <SalonsListContent
          currentUser={currentUser}
          filteredSalons={filteredSalons}
          hasActiveFilters={hasActiveFilters}
          isLoading={isLoading}
          isSalonFavorite={isSalonFavorite}
          salons={salons}
          sortedSalons={sortedSalons}
          onResetFilters={resetFilters}
          onToggleFavorite={toggleSalonFavorite}
          onViewSalon={setSelectedSalon}
        />
      )}
    </div>
  );
}
