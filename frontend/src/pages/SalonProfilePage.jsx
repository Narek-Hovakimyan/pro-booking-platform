import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, useParams } from "react-router-dom";

import api from "@/shared/api/axios";
import SalonProfileHero from "@/client/components/salons/SalonProfileHero";
import SalonSpecialistsSection from "@/client/components/salons/SalonSpecialistsSection";
import SalonOpenJobs from "@/features/jobs/components/SalonOpenJobs";
import SalonReviewSection from "@/shared/components/SalonReviewSection";
import {
  addFavorite,
  removeFavorite,
  setFavorites,
} from "@/store/slices/favoritesSlice";
import { setReviews } from "@/store/slices/reviewsSlice";
import { setServices } from "@/store/slices/servicesSlice";

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

function createInitialRouteState(routeId) {
  return {
    routeId,
    salon: null,
    salonReviews: [],
    isLoading: true,
    error: "",
    salonJobs: [],
    jobsLoading: false,
    canManageCurrentSalon: false,
  };
}

export default function SalonProfilePage() {
  const { salonId } = useParams();
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const services = useSelector((state) => state.services);
  const reviews = useSelector((state) => state.reviews);
  const favorites = useSelector((state) => state.favorites);
  const [routeState, setRouteState] = useState(() =>
    createInitialRouteState(salonId)
  );
  const [selectedStaffCategory, setSelectedStaffCategory] = useState("");
  const currentUserId = currentUser?.id || currentUser?._id || "";
  const requestIdRef = useRef(0);
  const activeSalonIdRef = useRef(salonId);
  const activeUserIdRef = useRef(currentUserId);
  const isCurrentRouteState = routeState.routeId === salonId;
  const salon = isCurrentRouteState ? routeState.salon : null;
  const salonReviews = isCurrentRouteState ? routeState.salonReviews : [];
  const isLoading = !isCurrentRouteState || routeState.isLoading;
  const error = isCurrentRouteState ? routeState.error : "";
  const salonJobs = isCurrentRouteState ? routeState.salonJobs : [];
  const jobsLoading = isCurrentRouteState ? routeState.jobsLoading : false;
  const canManageCurrentSalon = isCurrentRouteState
    ? routeState.canManageCurrentSalon
    : false;
  activeSalonIdRef.current = salonId;
  activeUserIdRef.current = currentUserId;

  const isCurrentFavoriteMutation = (routeIdSnapshot, userIdSnapshot) =>
    activeSalonIdRef.current === routeIdSnapshot &&
    activeUserIdRef.current === userIdSnapshot;

  useEffect(() => {
    let isMounted = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isCurrentRequest = () =>
      isMounted && requestIdRef.current === requestId;

    async function loadSalon() {
      setRouteState(createInitialRouteState(salonId));

      try {
        const { data } = await api.get(`/salons/${salonId}`);

        if (!isCurrentRequest()) return;

        setRouteState((currentState) =>
          !isCurrentRequest()
            ? currentState
            : {
                ...currentState,
                salon: data || null,
                salonReviews: data?.latestReviews || [],
              }
        );

        const barberList = data?.barbers || [];

        await Promise.all(
          barberList.map(async (barber) => {
            const barberKey = barber.id || barber._id;
            const [servicesResult, reviewsResult] = await Promise.allSettled([
              api.get(`/services/${barberKey}`),
              api.get(`/reviews/${barberKey}`),
            ]);

            if (!isCurrentRequest()) return;

            if (servicesResult.status === "fulfilled") {
              dispatch(
                setServices({
                  barberId: barberKey,
                  services: servicesResult.value.data,
                })
              );
            }
            if (reviewsResult.status === "fulfilled") {
              dispatch(
                setReviews({
                  barberId: barberKey,
                  reviews: reviewsResult.value.data,
                })
              );
            }
          })
        );

        if (currentUserId) {
          try {
            const favoritesResponse = await api.get("/favorites");

            if (isCurrentRequest()) {
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

          if (isCurrentRequest()) {
            setRouteState((currentState) =>
              !isCurrentRequest()
                ? currentState
                : {
                    ...currentState,
                    salonReviews: salonReviewsData?.reviews || [],
                    salon: currentState.salon
                      ? {
                          ...currentState.salon,
                          averageRating:
                            salonReviewsData?.averageRating ??
                            currentState.salon.averageRating,
                          totalReviews:
                            salonReviewsData?.totalReviews ??
                            currentState.salon.totalReviews,
                          reviewsCount:
                            salonReviewsData?.totalReviews ??
                            currentState.salon.reviewsCount,
                        }
                      : currentState.salon,
                  }
            );
          }
        } catch {
          // Salon profile still has review stats and latest reviews from /salons/:id.
        }

        // Check if the current user can manage this salon (owner/admin)
        if (currentUserId && currentUser?.role === "barber") {
          try {
            const { data: manageableSalons } = await api.get("/salons/mine/manageable");
            if (isCurrentRequest()) {
              const salons = getSalonList(manageableSalons);
              const canManage = salons.some(
                (s) =>
                  getIdString(s) === String(salonId) &&
                  isSalonOwnerOrAdmin(s, currentUserId)
              );
              setRouteState((currentState) =>
                !isCurrentRequest()
                  ? currentState
                  : { ...currentState, canManageCurrentSalon: canManage }
              );
            }
          } catch {
            // Manageable check is optional; replies stay read-only.
          }
        }
      } catch (requestError) {
        if (isCurrentRequest()) {
          setRouteState((currentState) => ({
            ...currentState,
            error:
              requestError.response?.data?.message ||
              "Could not load salon. Please try again.",
            salon: null,
            salonReviews: [],
            salonJobs: [],
            canManageCurrentSalon: false,
          }));
        }
      } finally {
        if (isCurrentRequest()) {
          setRouteState((currentState) => ({
            ...currentState,
            isLoading: false,
          }));
        }
      }

      if (isCurrentRequest()) {
        setRouteState((currentState) => ({
          ...currentState,
          salonJobs: [],
          jobsLoading: true,
        }));
      }

      try {
        const { data: jobsData } = await api.get("/salon-jobs", {
          params: { salonId },
        });
        if (isCurrentRequest()) {
          setRouteState((currentState) => ({
            ...currentState,
            salonJobs: Array.isArray(jobsData?.jobs)
              ? jobsData.jobs
              : Array.isArray(jobsData)
                ? jobsData
                : [],
          }));
        }
      } catch {
        if (isCurrentRequest()) {
          setRouteState((currentState) => ({
            ...currentState,
            salonJobs: [],
          }));
        }
      } finally {
        if (isCurrentRequest()) {
          setRouteState((currentState) => ({
            ...currentState,
            jobsLoading: false,
          }));
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
    const routeIdSnapshot = salonId;
    const userIdSnapshot = currentUserId;

    try {
      const barberId = barber.id || barber._id;
      const isFavorited = favorites.some(
        (favorite) =>
          String(favorite.clientId) === String(currentUser.id) &&
          String(favorite.barberId) === String(barberId)
      );

      if (isFavorited) {
        await api.delete(`/favorites/${barberId}`);
        if (!isCurrentFavoriteMutation(routeIdSnapshot, userIdSnapshot)) return;
        dispatch(removeFavorite({ clientId: currentUser.id, barberId }));
        return;
      }

      const { data } = await api.post("/favorites", { barberId });
      if (!isCurrentFavoriteMutation(routeIdSnapshot, userIdSnapshot)) return;
      dispatch(addFavorite(data));
    } catch (requestError) {
      if (!isCurrentFavoriteMutation(routeIdSnapshot, userIdSnapshot)) return;
      setRouteState((currentState) => ({
        ...currentState,
        error:
          requestError.response?.data?.message ||
          "Could not update favorite. Please try again.",
      }));
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
    const routeIdSnapshot = salonId;
    const userIdSnapshot = currentUserId;

    try {
      if (isSalonFavorited) {
        await api.delete(`/favorites/salons/${salonId}`);
        if (!isCurrentFavoriteMutation(routeIdSnapshot, userIdSnapshot)) return;
        dispatch({ type: "favorites/removeSalonFavorite", payload: { clientId: currentUser.id, salonId } });
        return;
      }

      const { data } = await api.post(`/favorites/salons/${salonId}`);
      if (!isCurrentFavoriteMutation(routeIdSnapshot, userIdSnapshot)) return;
      dispatch({ type: "favorites/addSalonFavorite", payload: data });
    } catch (requestError) {
      if (!isCurrentFavoriteMutation(routeIdSnapshot, userIdSnapshot)) return;
      setRouteState((currentState) => ({
        ...currentState,
        error:
          requestError.response?.data?.message ||
          "Could not update salon favorite. Please try again.",
      }));
    }
  };

  if (!isLoading && !salon && !error) {
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
            setSalonReviews={(nextReviews) =>
              setRouteState((currentState) => ({
                ...currentState,
                salonReviews:
                  typeof nextReviews === "function"
                    ? nextReviews(currentState.salonReviews)
                    : nextReviews,
              }))
            }
            canManageCurrentSalon={canManageCurrentSalon}
            averageRating={averageRating}
            reviewsCount={reviewsCount}
          />

          <SalonOpenJobs jobs={salonJobs} isLoading={jobsLoading} salonId={salonId} />

          <SalonSpecialistsSection
            currentUser={currentUser}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            reviews={reviews}
            salon={salon}
            selectedCategory={selectedStaffCategory}
            services={services}
            setSelectedCategory={setSelectedStaffCategory}
            specialists={visibleBarbersList}
          />
        </>
      )}
    </div>
  );
}
