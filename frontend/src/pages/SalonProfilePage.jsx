import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, useParams } from "react-router-dom";

import api from "@/shared/api/axios";
import BarberCard from "@/client/components/BarberCard";
import SalonProfileHero from "@/client/components/salons/SalonProfileHero";
import SalonOpenJobs from "@/features/jobs/components/SalonOpenJobs";
import SalonReviewSection from "@/shared/components/SalonReviewSection";
import EmptyState from "@/shared/components/common/EmptyState";
import {
  addFavorite,
  removeFavorite,
  setFavorites,
} from "@/store/slices/favoritesSlice";
import { setReviews } from "@/store/slices/reviewsSlice";
import { setServices } from "@/store/slices/servicesSlice";
import { serviceCategories } from "@/shared/data/serviceCategories";

function getIdString(value) {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
}

const hasActiveServiceInCategory = (services, barberId, category) =>
  !category ||
  (services || []).some(
    (service) =>
      service?.active &&
      String(service?.barberId) === String(barberId) &&
      (service?.category || "other") === category
  );

function getSalonList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.salons)) return data.salons;
  return [];
}

function isSalonOwnerOrAdmin(salon, userId) {
  const currentUserId = getIdString(userId);

  if (!salon || !currentUserId) return false;
  if (getIdString(salon.ownerId) === currentUserId) return true;

  return Array.isArray(salon.admins) &&
    salon.admins.some((adminId) => getIdString(adminId) === currentUserId);
}

export default function SalonProfilePage() {
  const { salonId } = useParams();
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const services = useSelector((state) => state.services);
  const reviews = useSelector((state) => state.reviews);
  const favorites = useSelector((state) => state.favorites);
  const [salon, setSalon] = useState(null);
  const [salonReviews, setSalonReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [salonJobs, setSalonJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [canManageCurrentSalon, setCanManageCurrentSalon] = useState(false);
  const [selectedStaffCategory, setSelectedStaffCategory] = useState("");
  const currentUserId = currentUser?.id || currentUser?._id || "";

  useEffect(() => {
    let isMounted = true;

    async function loadSalon() {
      setIsLoading(true);
      setError("");
      setCanManageCurrentSalon(false);

      try {
        const { data } = await api.get(`/salons/${salonId}`);

        if (!isMounted) return;

        setSalon(data || null);
        setSalonReviews(data?.latestReviews || []);

        const barberList = data?.barbers || [];

        await Promise.all(
          barberList.map(async (barber) => {
            const barberKey = barber.id || barber._id;
            const [servicesResponse, reviewsResponse] = await Promise.all([
              api.get(`/services/${barberKey}`),
              api.get(`/reviews/${barberKey}`),
            ]);

            if (!isMounted) return;

            dispatch(
              setServices({
                barberId: barberKey,
                services: servicesResponse.data,
              })
            );
            dispatch(
              setReviews({
                barberId: barberKey,
                reviews: reviewsResponse.data,
              })
            );
          })
        );

        if (currentUserId) {
          try {
            const favoritesResponse = await api.get("/favorites");

            if (isMounted) {
              dispatch(setFavorites(favoritesResponse.data));
            }
          } catch {
            // Favorites are optional on the public salon page.
          }
        }

        try {
          const { data: salonReviewsData } = await api.get(
            `/salon-reviews/salon/${salonId}`
          );

          if (isMounted) {
            setSalonReviews(salonReviewsData?.reviews || []);
            setSalon((currentSalon) =>
              currentSalon
                ? {
                    ...currentSalon,
                    averageRating:
                      salonReviewsData?.averageRating ??
                      currentSalon.averageRating,
                    totalReviews:
                      salonReviewsData?.totalReviews ??
                      currentSalon.totalReviews,
                    reviewsCount:
                      salonReviewsData?.totalReviews ??
                      currentSalon.reviewsCount,
                  }
                : currentSalon
            );
          }
        } catch {
          // Salon profile still has review stats and latest reviews from /salons/:id.
        }

        // Check if the current user can manage this salon (owner/admin)
        if (currentUserId && currentUser?.role === "barber") {
          try {
            const { data: manageableSalons } = await api.get("/salons/mine/manageable");
            if (isMounted) {
              const salons = getSalonList(manageableSalons);
              const canManage = salons.some(
                (s) =>
                  getIdString(s) === String(salonId) &&
                  isSalonOwnerOrAdmin(s, currentUserId)
              );
              setCanManageCurrentSalon(canManage);
            }
          } catch {
            // Manageable check is optional; replies stay read-only.
          }
        }
      } catch (requestError) {
        if (isMounted) {
          setError(
            requestError.response?.data?.message ||
              "Could not load salon. Please try again."
          );
          setSalon(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }

      // ── Fetch active jobs for this salon (independent of main load) ──
      if (isMounted) {
        setJobsLoading(true);
      }

      try {
        const { data: jobsData } = await api.get("/salon-jobs", {
          params: { salonId },
        });
        if (isMounted) {
          setSalonJobs(Array.isArray(jobsData?.jobs) ? jobsData.jobs : Array.isArray(jobsData) ? jobsData : []);
        }
      } catch {
        // Fail silently – the section simply won't show.
      } finally {
        if (isMounted) {
          setJobsLoading(false);
        }
      }
    }

    if (salonId) {
      loadSalon();
    }

    return () => {
      isMounted = false;
    };
  }, [currentUser?.role, currentUserId, dispatch, salonId]);

  // ── Favorite handlers ─────────────────────────────────────────────

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

  const isSalonFavorited = (favorites || []).some(
    (favorite) =>
      favorite?.type === "salon" &&
      String(favorite?.clientId) === String(currentUser?.id) &&
      String(favorite?.salonId) === String(salonId)
  );

  const handleSalonFavorite = async () => {
    if (!currentUser?.id || currentUser?.role !== "client" || !salonId) return;

    try {
      if (isSalonFavorited) {
        await api.delete(`/favorites/salons/${salonId}`);
        dispatch({ type: "favorites/removeSalonFavorite", payload: { clientId: currentUser.id, salonId } });
        return;
      }

      const { data } = await api.post(`/favorites/salons/${salonId}`);
      dispatch({ type: "favorites/addSalonFavorite", payload: data });
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not update salon favorite. Please try again."
      );
    }
  };

  if (!isLoading && !salon) {
    return <Navigate to="/specialists" replace />;
  }

  const averageRating = Number(salon?.averageRating || 0);
  const reviewsCount = Number(salon?.totalReviews ?? salon?.reviewsCount ?? 0);
  const barbersList = salon?.barbers || [];
  const visibleBarbersList = barbersList.filter((barber) =>
    hasActiveServiceInCategory(
      services,
      barber.id || barber._id,
      selectedStaffCategory
    )
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {isLoading && (
        <div className="space-y-4">
          <div className="rounded-2xl sm:rounded-3xl">
            <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[320px_1fr]">
              <div className="aspect-[4/3] w-full animate-pulse rounded-2xl bg-neutral-100" />
              <div className="space-y-3">
                <div className="h-8 w-2/3 animate-pulse rounded-xl bg-neutral-100" />
                <div className="h-4 w-1/2 animate-pulse rounded-xl bg-neutral-100" />
                <div className="h-4 w-1/3 animate-pulse rounded-xl bg-neutral-100" />
              </div>
            </div>
          </div>
        </div>
      )}

      {salon && (
        <>
          <SalonProfileHero
            averageRating={averageRating}
            barbersCount={barbersList.length}
            currentUser={currentUser}
            isSalonFavorited={isSalonFavorited}
            onToggleFavorite={handleSalonFavorite}
            reviewsCount={reviewsCount}
            salon={salon}
          />

          <SalonReviewSection
            salonReviews={salonReviews}
            setSalonReviews={setSalonReviews}
            canManageCurrentSalon={canManageCurrentSalon}
            averageRating={averageRating}
            reviewsCount={reviewsCount}
          />

          <SalonOpenJobs jobs={salonJobs} isLoading={jobsLoading} salonId={salonId} />

          <div className="space-y-3">
            <div className="grid gap-3 sm:flex sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">Specialists at {salon?.name}</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Select a specialist to view their profile or book an appointment.
                </p>
              </div>
              <label className="grid gap-1.5 text-sm font-semibold sm:w-56">
                Service category
                <select
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-2 font-normal"
                  value={selectedStaffCategory}
                  onChange={(event) => setSelectedStaffCategory(event.target.value)}
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

            {!visibleBarbersList.length ? (
              <EmptyState
                description={
                  selectedStaffCategory
                    ? "No approved specialists in this salon have active services in this category."
                    : "This salon does not have approved specialists yet."
                }
                title={selectedStaffCategory ? "No matching specialists" : "No specialists in this salon"}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleBarbersList.map((barber) => (
                  <BarberCard
                    barber={barber}
                    bookingSalon={salon}
                    key={barber.id || barber._id}
                    currentUser={currentUser}
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                    reviews={reviews}
                    services={services}
                    showAvailability={false}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
