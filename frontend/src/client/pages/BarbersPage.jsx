import { SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import api from "@/shared/api/axios";
import Drawer from "@/shared/components/common/Drawer";
import BarbersFiltersPanel from "@/client/components/barbers/BarbersFiltersPanel";
import BarbersGrid from "@/client/components/barbers/BarbersGrid";
import { useBarberBrowse } from "@/client/hooks/useBarberBrowse";
import { Container } from "@/shared/components/ui/Container";
import { Button } from "@/shared/components/ui/button";
import { getServiceCategoryLabel } from "@/shared/data/serviceCategories";
import { getSpecialistProfessionDisplay } from "@/shared/data/professions";
import { addFavorite, removeFavorite, setFavorites } from "@/store/slices/favoritesSlice";
import { setServices } from "@/store/slices/servicesSlice";
import { setBarbers } from "@/store/slices/usersSlice";

const getBarberId = (barber) => barber?.id || barber?._id;
const getReviewStats = (reviews, barberId) => {
  const barberReviews = (reviews || []).filter((review) => String(review?.barberId) === String(barberId));
  const total = barberReviews.reduce((sum, review) => sum + Number(review?.rating || 0), 0);
  return { average: barberReviews.length ? total / barberReviews.length : 0, count: barberReviews.length };
};

export default function BarbersPage() {
  const dispatch = useDispatch();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedProfession, setSelectedProfession] = useState("");
  const [selectedBarberType, setSelectedBarberType] = useState("");
  const [priceRange, setPriceRange] = useState({ min: "", max: "" });
  const [discountFilter, setDiscountFilter] = useState("");
  const [rating, setRating] = useState("");
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [favoriteError, setFavoriteError] = useState("");
  const { currentUser } = useSelector((state) => state.auth);
  const favorites = useSelector((state) => state.favorites);
  const reviews = useSelector((state) => state.reviews);

  const filters = useMemo(() => ({
    name: searchTerm.trim(), city: selectedCity, serviceName: selectedService,
    category: selectedCategory, minPrice: priceRange.min, maxPrice: priceRange.max,
    discountOnly: Boolean(discountFilter), rating, profession: selectedProfession,
    barberType: selectedBarberType,
  }), [discountFilter, priceRange.max, priceRange.min, rating, searchTerm, selectedBarberType, selectedCategory, selectedCity, selectedProfession, selectedService]);
  const browse = useBarberBrowse(filters);

  useEffect(() => {
    dispatch(setBarbers(browse.barbers));
    if (browse.services.length) dispatch(setServices(browse.services));
  }, [browse.barbers, browse.services, dispatch]);

  useEffect(() => {
    let active = true;
    api.get("/favorites").then(({ data }) => active && dispatch(setFavorites(data))).catch(() => {});
    return () => { active = false; };
  }, [dispatch, currentUser?.id]);

  useEffect(() => {
    if (!isFilterDrawerOpen) return undefined;
    const closeOnEscape = (event) => event.key === "Escape" && setIsFilterDrawerOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isFilterDrawerOpen]);

  const cities = useMemo(() => Array.from(new Set(browse.barbers.map((barber) => barber.city).filter(Boolean))), [browse.barbers]);
  const serviceNames = useMemo(() => Array.from(new Set(browse.services.filter((service) => service?.active && service?.name).map((service) => service.name))).sort((a, b) => a.localeCompare(b)), [browse.services]);
  const updatePriceRange = (field, value) => setPriceRange((current) => ({ ...current, [field]: value }));
  const resetFilters = () => {
    setSearchTerm(""); setSelectedCity(""); setSelectedService(""); setSelectedCategory("");
    setSelectedProfession(""); setSelectedBarberType(""); setPriceRange({ min: "", max: "" });
    setDiscountFilter(""); setRating("");
  };
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const activeFiltersCount = [filters.name, filters.city, filters.serviceName, filters.category, filters.profession, filters.barberType, filters.minPrice || filters.maxPrice, filters.discountOnly, filters.rating].filter(Boolean).length;
  const filterChips = [
    filters.name && { label: filters.name, onRemove: () => setSearchTerm("") },
    filters.city && { label: filters.city, onRemove: () => setSelectedCity("") },
    filters.serviceName && { label: filters.serviceName, onRemove: () => setSelectedService("") },
    filters.category && { label: getServiceCategoryLabel(filters.category), onRemove: () => setSelectedCategory("") },
    filters.profession && { label: getSpecialistProfessionDisplay({ profession: filters.profession, barberType: filters.barberType || "" })?.label || filters.profession, onRemove: () => { setSelectedProfession(""); setSelectedBarberType(""); } },
    filters.barberType && filters.profession === "barber" && { label: getSpecialistProfessionDisplay({ profession: "barber", barberType: filters.barberType })?.label || filters.barberType, onRemove: () => setSelectedBarberType("") },
    filters.minPrice && { label: `Min ${filters.minPrice}`, onRemove: () => updatePriceRange("min", "") },
    filters.maxPrice && { label: `Max ${filters.maxPrice}`, onRemove: () => updatePriceRange("max", "") },
    filters.discountOnly && { label: "With discounts", onRemove: () => setDiscountFilter("") },
    filters.rating && { label: `${filters.rating}+ stars`, onRemove: () => setRating("") },
  ].filter(Boolean);
  const isFavorite = (barberId) => (favorites || []).some((favorite) => String(favorite?.clientId) === String(currentUser?.id) && String(favorite?.barberId) === String(barberId));

  const toggleFavorite = async (barber) => {
    const barberId = getBarberId(barber);
    if (!currentUser?.id || !barberId) return;
    setFavoriteError("");
    try {
      if (isFavorite(barberId)) {
        await api.delete(`/favorites/${barberId}`);
        dispatch(removeFavorite({ clientId: currentUser.id, barberId }));
      } else {
        const { data } = await api.post("/favorites", { barberId });
        dispatch(addFavorite(data));
      }
    } catch (requestError) {
      setFavoriteError(requestError.response?.data?.message || "Could not update favorites. Please try again.");
    }
  };

  const barbers = useMemo(() => browse.barbers.map((barber) => {
    const barberId = String(getBarberId(barber) || "");
    return {
      ...barber,
      firstAvailableSlot: browse.firstAvailableSlotByBarberId[barberId] || null,
      reviewStats: browse.reviewStatsByBarberId[barberId] || getReviewStats(reviews, barberId),
      availabilityStatus: browse.availabilityStatusByBarberId[barberId] || "ready",
    };
  }), [browse.availabilityStatusByBarberId, browse.barbers, browse.firstAvailableSlotByBarberId, browse.reviewStatsByBarberId, reviews]);
  const error = browse.error || favoriteError;

  return <Container size="wide"><div className="space-y-6">
    <div className="grid gap-4 sm:flex sm:items-end sm:justify-between"><div>
      <h1 className="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">Specialists</h1>
      <p className="mt-2 text-neutral-500">Find a specialist, then choose an available appointment time.</p>
    </div><div className="grid gap-2 sm:flex">
      <Button className="relative w-full sm:w-auto" onClick={() => setIsFilterDrawerOpen(true)} variant="outline"><SlidersHorizontal className="mr-2 h-4 w-4" />Filters{activeFiltersCount > 0 && <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">{activeFiltersCount}</span>}</Button>
      {hasActiveFilters && <Button className="w-full sm:w-auto" onClick={resetFilters} variant="outline">Clear Filters</Button>}
    </div></div>
    {browse.isLoading && barbers.length > 0 && <div className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500" />Refreshing specialists...</div>}
    {error && barbers.length > 0 && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <Drawer closeLabel="Close filters" description="Refine the specialist list instantly." footer={<><Button onClick={() => setIsFilterDrawerOpen(false)}>Apply filters</Button><Button onClick={resetFilters} variant="outline">Clear filters</Button></>} isOpen={isFilterDrawerOpen} onClose={() => setIsFilterDrawerOpen(false)} title="Filters">
      <BarbersFiltersPanel searchTerm={searchTerm} onSearchChange={setSearchTerm} selectedCity={selectedCity} onCityChange={setSelectedCity} cities={cities} selectedService={selectedService} onServiceChange={setSelectedService} serviceNames={serviceNames} selectedCategory={selectedCategory} onCategoryChange={setSelectedCategory} selectedProfession={selectedProfession} onProfessionChange={(value) => { setSelectedProfession(value); if (value !== "barber") setSelectedBarberType(""); }} selectedBarberType={selectedBarberType} onBarberTypeChange={setSelectedBarberType} priceRange={priceRange} onPriceRangeChange={updatePriceRange} discountFilter={discountFilter} onDiscountFilterChange={setDiscountFilter} rating={rating} onRatingChange={setRating} filterChips={filterChips} />
    </Drawer>
    <BarbersGrid barbers={barbers} isLoading={browse.isLoading} error={error} hasActiveFilters={hasActiveFilters} favorites={favorites} currentUser={currentUser} reviews={reviews} services={browse.services} onToggleFavorite={toggleFavorite} onResetFilters={resetFilters} />
    {browse.hasMore && barbers.length > 0 && <div className="flex justify-center"><Button disabled={browse.isLoading} onClick={browse.loadMore} variant="outline">{browse.isLoading ? "Loading specialists..." : "Load more"}</Button></div>}
  </div></Container>;
}
