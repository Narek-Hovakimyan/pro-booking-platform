import { SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import api from "@/shared/api/axios";
import Drawer from "@/shared/components/common/Drawer";
import BarbersFiltersPanel from "@/client/components/barbers/BarbersFiltersPanel";
import BarbersGrid from "@/client/components/barbers/BarbersGrid";
import { Button } from "@/shared/components/ui/button";
import { getServiceCategoryLabel } from "@/shared/data/serviceCategories";
import {
  addFavorite,
  removeFavorite,
  setFavorites,
} from "@/store/slices/favoritesSlice";
import { setServices } from "@/store/slices/servicesSlice";
import { setBarbers } from "@/store/slices/usersSlice";

const getId = (item) =>
  typeof item === "string" ? item : item?.id || item?._id;

const AVAILABILITY_STATUS = {
  LOADING: "loading",
  READY: "ready",
  UNAVAILABLE: "unavailable",
};

const CARD_SUMMARY_CACHE_TTL_MS = 60 * 1000;
let barbersCardSummaryCache = null;

function getTodayDateKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getServiceCacheKey(serviceName, category) {
  return `${serviceName || ""}:${category || ""}`;
}

function isFreshCardSummaryCache(serviceName, category) {
  if (!barbersCardSummaryCache) return false;

  const now = Date.now();

  return (
    now - barbersCardSummaryCache.fetchedAt < CARD_SUMMARY_CACHE_TTL_MS &&
    barbersCardSummaryCache.dateKey === getTodayDateKey() &&
    barbersCardSummaryCache.serviceName === getServiceCacheKey(serviceName, category)
  );
}

function getBarberId(barber) {
  return barber?.id || barber?._id;
}

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

function mapByBarberId(items = []) {
  return Object.fromEntries(
    items
      .map((item) => [String(item?.barberId || ""), item])
      .filter(([barberId]) => Boolean(barberId))
  );
}

function normalizeCardSummary(summary = {}) {
  const nextBarbers = Array.isArray(summary.barbers)
    ? summary.barbers
    : [];
  const nextAvailability = mapByBarberId(summary.availability || []);
  const nextReviewStats = mapByBarberId(summary.reviewStats || []);

  return {
    barbers: nextBarbers,
    services: summary.services || [],
    reviewStatsByBarberId: nextReviewStats,
    firstAvailableSlotByBarberId: Object.fromEntries(
      Object.entries(nextAvailability).map(([barberId, item]) => [
        barberId,
        item?.firstAvailableSlot || null,
      ])
    ),
    availabilityStatusByBarberId: Object.fromEntries(
      nextBarbers
        .map((barber) => {
          const barberId = String(getBarberId(barber) || "");
          const availabilityStatus =
            nextAvailability[barberId]?.status || AVAILABILITY_STATUS.READY;

          return [barberId, availabilityStatus];
        })
        .filter(([barberId]) => Boolean(barberId))
    ),
  };
}

export default function BarbersPage() {

  const dispatch = useDispatch();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("");
  const [priceRange, setPriceRange] = useState({ min: "", max: "" });
  const [rating, setRating] = useState("");
  const initialCardSummary = useMemo(
    () =>
      isFreshCardSummaryCache(selectedService, selectedCategory)
        ? normalizeCardSummary(barbersCardSummaryCache.data)
        : null,
    [selectedCategory, selectedService]
  );
  const [isLoading, setIsLoading] = useState(!initialCardSummary);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [error, setError] = useState("");
  const [availabilityStatusByBarberId, setAvailabilityStatusByBarberId] = useState(
    initialCardSummary?.availabilityStatusByBarberId || {}
  );
  const [firstAvailableSlotByBarberId, setFirstAvailableSlotByBarberId] = useState(
    initialCardSummary?.firstAvailableSlotByBarberId || {}
  );
  const [reviewStatsByBarberId, setReviewStatsByBarberId] = useState(
    initialCardSummary?.reviewStatsByBarberId || {}
  );
  const { currentUser } = useSelector((state) => state.auth);
  const services = useSelector((state) => state.services);
  const favorites = useSelector((state) => state.favorites);
  const reviews = useSelector((state) => state.reviews);
  const users = useSelector((state) => state.users);
  const barbers = useMemo(
    () => (users || []).filter((user) => user?.role === "barber"),
    [users]
  );
  const hadBarbersOnMount = useRef(barbers.length > 0);
  const availabilityRequestId = useRef(0);
  const initialBarbersRef = useRef(barbers);
  const cities = useMemo(
    () =>
      Array.from(
        new Set(barbers.map((barber) => barber.city).filter(Boolean))
    ),
    [barbers]
  );
  const serviceNames = useMemo(
    () =>
      Array.from(
        new Set(
          (services || [])
            .filter((service) => service?.active && service?.name)
            .map((service) => service.name)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [services]
  );
  const servicesByBarberId = useMemo(() => {
    const nextServicesByBarberId = new Map();

    (services || []).forEach((service) => {
      const barberId = String(service?.barberId || "");

      if (!barberId) return;

      nextServicesByBarberId.set(barberId, [
        ...(nextServicesByBarberId.get(barberId) || []),
        service,
      ]);
    });

    return nextServicesByBarberId;
  }, [services]);
  useEffect(() => {
    let isMounted = true;
    const requestId = availabilityRequestId.current + 1;
    availabilityRequestId.current = requestId;
    const serviceName = getServiceCacheKey(selectedService, selectedCategory);

    function applyCardSummary(summary) {
      const normalizedSummary = normalizeCardSummary(summary);

      dispatch(setBarbers(normalizedSummary.barbers));
      dispatch(setServices(normalizedSummary.services));
      setReviewStatsByBarberId(normalizedSummary.reviewStatsByBarberId);
      setFirstAvailableSlotByBarberId(
        normalizedSummary.firstAvailableSlotByBarberId
      );
      setAvailabilityStatusByBarberId(
        normalizedSummary.availabilityStatusByBarberId
      );
    }

    async function fetchBarbers() {
      if (isFreshCardSummaryCache(selectedService, selectedCategory)) {
        applyCardSummary(barbersCardSummaryCache.data);
        setIsLoading(false);
        setError("");

        try {
          const favoritesResponse = await api.get("/favorites");

          if (isMounted && availabilityRequestId.current === requestId) {
            dispatch(setFavorites(favoritesResponse.data));
          }
        } catch {
          // Cached card summaries are display-only; favorites can refresh next visit.
        }

        return;
      }

      setIsLoading(!hadBarbersOnMount.current);
      setError("");

      if (initialBarbersRef.current.length > 0) {
        setAvailabilityStatusByBarberId(
          Object.fromEntries(
            initialBarbersRef.current
              .map((barber) => getBarberId(barber))
              .filter(Boolean)
              .map((barberId) => [String(barberId), AVAILABILITY_STATUS.LOADING])
          )
        );
      }

      try {
        const [summaryResponse, favoritesResponse] = await Promise.all([
          api.get("/barbers/card-summary", {
            params: {
              ...(selectedService ? { serviceName: selectedService } : {}),
              ...(selectedCategory ? { category: selectedCategory } : {}),
            },
          }),
          api.get("/favorites"),
        ]);
        const summary = summaryResponse.data || {};

        if (isMounted && availabilityRequestId.current === requestId) {
          barbersCardSummaryCache = {
            data: summary,
            fetchedAt: Date.now(),
            dateKey: getTodayDateKey(),
            serviceName,
          };

          applyCardSummary(summary);
          dispatch(setFavorites(favoritesResponse.data));
        }
      } catch (requestError) {
        if (isMounted && availabilityRequestId.current === requestId) {
          setError(
            requestError.response?.data?.message ||
              "Could not load specialists. Please try again."
          );
        }
      } finally {
        if (isMounted && availabilityRequestId.current === requestId) {
          setIsLoading(false);
        }
      }
    }

    fetchBarbers();

    return () => {
      isMounted = false;
      availabilityRequestId.current += 1;
    };
  }, [dispatch, selectedCategory, selectedService]);

  const updatePriceRange = (field, value) => {
    setPriceRange((currentRange) => ({ ...currentRange, [field]: value }));
  };

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedCity("");
    setSelectedService("");
    setSelectedCategory("");
    setSelectedSpecialty("");
    setPriceRange({ min: "", max: "" });
    setRating("");
  };
  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    Boolean(selectedCity) ||
    Boolean(selectedService) ||
    Boolean(selectedCategory) ||
    Boolean(selectedSpecialty) ||
    Boolean(priceRange.min) ||
    Boolean(priceRange.max) ||
    Boolean(rating);
  const activeFiltersCount =
    (searchTerm.trim() ? 1 : 0) +
    (selectedCity ? 1 : 0) +
    (selectedService ? 1 : 0) +
    (selectedCategory ? 1 : 0) +
    (selectedSpecialty ? 1 : 0) +
    (priceRange.min || priceRange.max ? 1 : 0) +
    (rating ? 1 : 0);
  const filterChips = [
    searchTerm.trim()
      ? { label: searchTerm.trim(), onRemove: () => setSearchTerm("") }
      : null,
    selectedCity
      ? { label: selectedCity, onRemove: () => setSelectedCity("") }
      : null,
    selectedService
      ? { label: selectedService, onRemove: () => setSelectedService("") }
      : null,
    selectedCategory
      ? { label: getServiceCategoryLabel(selectedCategory), onRemove: () => setSelectedCategory("") }
      : null,
    selectedSpecialty
      ? { label: selectedSpecialty === "men" ? "Men's barber" : selectedSpecialty === "women" ? "Women's hairdresser" : "Unisex", onRemove: () => setSelectedSpecialty("") }
      : null,
    priceRange.min
      ? { label: `Min ${priceRange.min}`, onRemove: () => updatePriceRange("min", "") }
      : null,
    priceRange.max
      ? { label: `Max ${priceRange.max}`, onRemove: () => updatePriceRange("max", "") }
      : null,
    rating ? { label: `${rating}+ stars`, onRemove: () => setRating("") } : null,
  ].filter(Boolean);

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

  const isFavorite = (barberId) =>
    (favorites || []).some(
      (favorite) =>
        String(favorite?.clientId) === String(currentUser?.id) &&
        String(favorite?.barberId) === String(barberId)
    );
  const favoriteBarberIds = useMemo(() => {
    const userFavoriteIds = [
      ...(currentUser?.favoriteBarbers || []),
      ...(currentUser?.favorites || []),
    ].map((favorite) => getId(favorite?.barberId) || getId(favorite));
    const stateFavoriteIds = (favorites || [])
      .filter(
        (favorite) =>
          String(favorite?.clientId) === String(currentUser?.id) &&
          favorite?.type !== "salon"
      )
      .map((favorite) => getId(favorite?.barberId) || getId(favorite?.barber));

    return new Set(
      [...userFavoriteIds, ...stateFavoriteIds]
        .filter(Boolean)
        .map((id) => String(id))
    );
  }, [currentUser?.favoriteBarbers, currentUser?.favorites, currentUser?.id, favorites]);
  const toggleFavorite = async (barber) => {
    const barberId = barber?.id || barber?._id;

    if (!currentUser?.id || !barberId) return;

    try {
      if (isFavorite(barberId)) {
        await api.delete(`/favorites/${barberId}`);
        dispatch(removeFavorite({ clientId: currentUser.id, barberId }));
        return;
      }

      const { data } = await api.post("/favorites", { barberId });
      dispatch(addFavorite(data));
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not update favorites. Please try again."
      );
    }
  };

  const filteredBarbers = useMemo(
    () =>
      barbers.filter((barber) => {
        const normalizedSearch = searchTerm.toLowerCase().trim();
        const barberName = barber?.name?.toLowerCase() || "";
        const searchMatches =
          !normalizedSearch || barberName.includes(normalizedSearch);
        const cityMatches = !selectedCity || barber?.city === selectedCity;
        const barberId = barber?.id || barber?._id;
        const barberServices =
          servicesByBarberId.get(String(barberId)) || [];
        const serviceMatches =
          !selectedService ||
          barberServices.some(
            (service) => service?.active && service?.name === selectedService
          );
        const categoryMatches =
          !selectedCategory ||
          barberServices.some(
            (service) =>
              service?.active &&
              (service?.category || "other") === selectedCategory
          );
        const prices = getBarberPrices(barberServices, barberId);
        const minPrice = Number(priceRange.min);
        const maxPrice = Number(priceRange.max);
        const minRating = Number(rating);
        const reviewStats =
          reviewStatsByBarberId[String(barberId)] ||
          getReviewStats(reviews, barberId);
        const minMatches =
          !priceRange.min || prices.some((price) => price >= minPrice);
        const maxMatches =
          !priceRange.max || prices.some((price) => price <= maxPrice);
        const ratingMatches =
          !rating || reviewStats.average >= minRating;
        const specialtyMatches =
          !selectedSpecialty || barber?.specialty === selectedSpecialty;

        return (
          searchMatches &&
          cityMatches &&
          serviceMatches &&
          categoryMatches &&
          minMatches &&
          maxMatches &&
          ratingMatches &&
          specialtyMatches
        );
      }),
    [barbers, priceRange.max, priceRange.min, rating, reviewStatsByBarberId, reviews, searchTerm, selectedCategory, selectedCity, selectedService, selectedSpecialty, servicesByBarberId]
  );
  const barbersWithAvailability = useMemo(
    () =>
      filteredBarbers.map((barber) => {
        const barberId = String(getBarberId(barber) || "");
        const availabilityStatus =
          availabilityStatusByBarberId[barberId] || AVAILABILITY_STATUS.READY;

        return {
          ...barber,
          firstAvailableSlot: firstAvailableSlotByBarberId[barberId] || null,
          reviewStats: reviewStatsByBarberId[barberId] || getReviewStats(reviews, barberId),
          availabilityStatus,
        };
      }),
    [
      availabilityStatusByBarberId,
      firstAvailableSlotByBarberId,
      filteredBarbers,
      reviewStatsByBarberId,
      reviews,
    ]
  );
  const sortedBarbers = useMemo(() => {
    return [...barbersWithAvailability].sort((a, b) => {
      const aFav = favoriteBarberIds.has(String(getId(a)));
      const bFav = favoriteBarberIds.has(String(getId(b)));

      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;

      const aSlot = a.firstAvailableSlot;
      const bSlot = b.firstAvailableSlot;

      if (aSlot && !bSlot) return -1;
      if (!aSlot && bSlot) return 1;
      if (!aSlot && !bSlot) return 0;

      const aValue = `${aSlot.dateKey} ${aSlot.time}`;
      const bValue = `${bSlot.dateKey} ${bSlot.time}`;

      return aValue.localeCompare(bValue);
    });
  }, [barbersWithAvailability, favoriteBarberIds]);
  const refreshing = isLoading && barbers.length > 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="grid gap-3 sm:flex sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Specialists
          </h1>
          <p className="mt-2 text-neutral-500">
            Find a specialist, then choose an available appointment time.
          </p>
        </div>

        <div className="grid gap-2 sm:flex">
          <Button
            className="relative w-full sm:w-auto"
            onClick={() => setIsFilterDrawerOpen(true)}
            variant="outline"
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                {activeFiltersCount}
              </span>
            )}
          </Button>
          {hasActiveFilters && (
            <Button
              className="w-full sm:w-auto"
              onClick={resetFilters}
              variant="outline"
            >
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {refreshing && (
        <p className="rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
          Refreshing specialists...
        </p>
      )}

      {error && barbers.length > 0 && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <Drawer
        closeLabel="Close filters"
        description="Refine the specialist list instantly."
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
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        title="Filters"
      >
        <BarbersFiltersPanel
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          selectedCity={selectedCity}
          onCityChange={setSelectedCity}
          cities={cities}
          selectedService={selectedService}
          onServiceChange={setSelectedService}
          serviceNames={serviceNames}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          selectedSpecialty={selectedSpecialty}
          onSpecialtyChange={setSelectedSpecialty}
          priceRange={priceRange}
          onPriceRangeChange={updatePriceRange}
          rating={rating}
          onRatingChange={setRating}
          filterChips={filterChips}
        />
      </Drawer>

      <BarbersGrid
        barbers={sortedBarbers}
        isLoading={isLoading}
        error={error}
        hasActiveFilters={hasActiveFilters}
        favorites={favorites}
        currentUser={currentUser}
        reviews={reviews}
        services={services}
        onToggleFavorite={toggleFavorite}
        onResetFilters={resetFilters}
      />
    </div>
  );
}
