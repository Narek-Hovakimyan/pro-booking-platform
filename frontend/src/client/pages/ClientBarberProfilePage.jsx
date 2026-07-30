import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams } from "react-router-dom";

import BarberCertificationsSection from "@/client/components/barber-profile/BarberCertificationsSection";
import BarberGallerySection from "@/client/components/barber-profile/BarberGallerySection";
import BarberProfileHero from "@/client/components/barber-profile/BarberProfileHero";
import BarberProfileSidebar from "@/client/components/barber-profile/BarberProfileSidebar";
import {
  BarberProfileError,
  BarberProfileLoading,
  BarberProfileNotFound,
} from "@/client/components/barber-profile/BarberProfileStates";
import BarberServicesSection from "@/client/components/barber-profile/BarberServicesSection";
import BarberWorkHistorySection from "@/client/components/barber-profile/BarberWorkHistorySection";
import PortfolioSection from "@/client/components/barber-profile/PortfolioSection";
import api from "@/shared/api/axios";
import { Container } from "@/shared/components/ui/Container";
import {
  addFavorite,
  removeFavorite,
  setFavorites,
} from "@/store/slices/favoritesSlice";
import { setReviews } from "@/store/slices/reviewsSlice";
import { setServices } from "@/store/slices/servicesSlice";
import { setBarbers, updateBarberProfile } from "@/store/slices/usersSlice";

function getReviewStats(reviews, barberId) {
  const barberReviews = (reviews || []).filter(
    (review) => String(review.barberId) === String(barberId)
  );
  const total = barberReviews.reduce(
    (sum, review) => sum + Number(review?.rating || 0),
    0
  );

  return {
    average: barberReviews.length > 0 ? total / barberReviews.length : 0,
    count: barberReviews.length,
    reviews: barberReviews,
  };
}

function getStartingPrice(services) {
  const prices = (services || [])
    .filter((service) => service?.active)
    .map((service) => Number(service.price))
    .filter(Number.isFinite);

  return prices.length > 0 ? Math.min(...prices) : null;
}

function formatReviewDate(date) {
  if (!date) return "";

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

function formatMonthYear(date) {
  if (!date) return "";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) return "";

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
  }).format(parsedDate);
}

function createInitialRouteState(routeId) {
  return {
    routeId,
    isLoading: true,
    error: "",
    certifications: [],
    eventCertifications: [],
    salonRating: null,
  };
}

export default function ClientBarberProfilePage() {
  const { barberId } = useParams();
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.auth);
  const users = useSelector((state) => state.users);
  const services = useSelector((state) => state.services);
  const reviews = useSelector((state) => state.reviews);
  const favorites = useSelector((state) => state.favorites);
  const [routeState, setRouteState] = useState(() =>
    createInitialRouteState(barberId)
  );
  const requestIdRef = useRef(0);
  const currentUserId = currentUser?.id || currentUser?._id || "";
  const activeBarberIdRef = useRef(barberId);
  const activeUserIdRef = useRef(currentUserId);
  const isCurrentRouteState = routeState.routeId === barberId;
  const isLoading = !isCurrentRouteState || routeState.isLoading;
  const error = isCurrentRouteState ? routeState.error : "";
  const certifications = isCurrentRouteState ? routeState.certifications : [];
  const eventCertifications = isCurrentRouteState
    ? routeState.eventCertifications
    : [];
  const salonRating = isCurrentRouteState ? routeState.salonRating : null;
  activeBarberIdRef.current = barberId;
  activeUserIdRef.current = currentUserId;

  const isCurrentFavoriteMutation = (routeIdSnapshot, userIdSnapshot) =>
    activeBarberIdRef.current === routeIdSnapshot &&
    activeUserIdRef.current === userIdSnapshot;

  const barber = (users || []).find(
    (user) =>
      user?.role === "barber" &&
      String(user?.id || user?._id) === String(barberId)
  );
  const profileBarberId = barber?.id || barber?._id || barberId;
  const barberServices = (services || []).filter(
    (service) =>
      String(service?.barberId) === String(profileBarberId) && service?.active
  );
  const reviewStats = getReviewStats(reviews, profileBarberId);
  const startingPrice = getStartingPrice(barberServices);
  const gallery =
    barber?.galleryImages || barber?.gallery || [];
  const galleryImages = Array.isArray(gallery) ? gallery : [];
  // Get approved salons from new salons array, fallback to legacy
  const approvedSalons = (barber?.approvedSalons || barber?.salons || [])
    .filter((s) => s?.status === "approved" || s?.status === undefined);
  const primarySalon = barber?.primarySalon || approvedSalons.find((s) => s?.isPrimary) || approvedSalons[0];
  const legacySalon = barber?.salonStatus === "approved" ? barber?.salon : null;

  // Build salon display
  let salonName = "";
  let salonId = null;
  let showSalonLink = false;

  if (approvedSalons.length > 1) {
    const primaryName = primarySalon?.name || "";
    const extraCount = approvedSalons.length - 1;
    salonName = `${primaryName} + ${extraCount} more`;
    salonId = primarySalon?.id || primarySalon?._id;
    showSalonLink = Boolean(primaryName && salonId);
  } else if (approvedSalons.length === 1) {
    const salon = approvedSalons[0];
    salonName = salon?.name || "";
    salonId = salon?.id || salon?._id;
    showSalonLink = Boolean(salonName && salonId);
  } else if (legacySalon) {
    salonName = legacySalon?.name || "";
    salonId = legacySalon?.id || legacySalon?._id;
    showSalonLink = Boolean(salonName && salonId);
  }
  const workHistory = (Array.isArray(barber?.workHistory)
    ? barber.workHistory
    : []
  )
    .filter(
      (history) => history?.salonName || history?.salon || history?.startDate
    )
    .sort((first, second) => {
      if (Boolean(first?.isCurrent) !== Boolean(second?.isCurrent)) {
        return first?.isCurrent ? -1 : 1;
      }

      return (
        new Date(second?.startDate || 0).getTime() -
        new Date(first?.startDate || 0).getTime()
      );
    });
  const isFavorite = (favorites || []).some(
    (favorite) =>
      String(favorite?.clientId) === String(currentUser?.id) &&
      String(favorite?.barberId) === String(profileBarberId)
  );

  useEffect(() => {
    let isMounted = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isCurrentRequest = () =>
      isMounted && requestIdRef.current === requestId;

    async function loadProfile() {
      setRouteState(createInitialRouteState(barberId));

      try {
        const [barbersResponse, profileResponse] = await Promise.all([
          api.get("/users/barbers"),
          api.get(`/barbers/profile/${barberId}`),
        ]);

        if (!isCurrentRequest()) return;

        dispatch(setBarbers(barbersResponse.data));
        if (profileResponse.data) {
          dispatch(
            updateBarberProfile({
              barberId,
              profile: profileResponse.data,
            })
          );
        }

        const optionalRequests = [
          api.get(`/services/${barberId}`),
          api.get(`/reviews/${barberId}`),
          currentUser?.id ? api.get("/favorites") : Promise.resolve(null),
          api.get(`/barbers/${barberId}/certifications`),
          api.get(`/barbers/${barberId}/event-certificates`),
        ];
        const [
          servicesResult,
          reviewsResult,
          favoritesResult,
          certificationsResult,
          eventCertificationsResult,
        ] = await Promise.allSettled(optionalRequests);

        if (!isCurrentRequest()) return;

        if (servicesResult.status === "fulfilled") {
          dispatch(
            setServices({
              barberId,
              services: servicesResult.value.data,
            })
          );
        }
        if (reviewsResult.status === "fulfilled") {
          dispatch(
            setReviews({
              barberId,
              reviews: reviewsResult.value.data,
            })
          );
        }
        if (favoritesResult.status === "fulfilled" && favoritesResult.value) {
          dispatch(setFavorites(favoritesResult.value.data));
        }
        if (certificationsResult.status === "fulfilled") {
          setRouteState((currentState) =>
            !isCurrentRequest()
              ? currentState
              : {
                  ...currentState,
                  certifications: certificationsResult.value.data || [],
                }
          );
        }
        if (eventCertificationsResult.status === "fulfilled") {
          setRouteState((currentState) =>
            !isCurrentRequest()
              ? currentState
              : {
                  ...currentState,
                  eventCertifications:
                    eventCertificationsResult.value.data || [],
                }
          );
        }

        // Fetch salon review stats if barber belongs to approved salons
        const barberData = barbersResponse.data?.find(
          (b) => String(b?.id || b?._id) === String(barberId)
        );
        const barberApprovedSalons = (barberData?.approvedSalons || barberData?.salons || [])
          .filter((s) => s?.status === "approved" || s?.status === undefined);
        const barberPrimarySalon = barberData?.primarySalon || barberApprovedSalons.find((s) => s?.isPrimary) || barberApprovedSalons[0];
        const barberLegacySalon = barberData?.salonStatus === "approved" ? barberData?.salon : null;
        const barberSalonId = barberPrimarySalon?.id || barberPrimarySalon?._id || barberLegacySalon?.id || barberLegacySalon?._id;

        if (barberSalonId && isCurrentRequest()) {
          try {
            const { data: salonData } = await api.get(`/salons/${barberSalonId}`);
            if (isCurrentRequest()) {
              setRouteState((currentState) => ({
                ...currentState,
                salonRating: Number(salonData?.averageRating || 0),
              }));
            }
          } catch {
            // Salon stats are optional
          }
        }

      } catch (requestError) {
        if (isCurrentRequest()) {
          setRouteState((currentState) => ({
            ...currentState,
            error:
              requestError.response?.data?.message ||
              "Could not load specialist profile. Please try again.",
            certifications: [],
            eventCertifications: [],
            salonRating: null,
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
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [barberId, currentUser?.id, dispatch]);

  const toggleFavorite = async () => {
    if (!currentUser?.id || !profileBarberId) return;
    const routeIdSnapshot = barberId;
    const userIdSnapshot = currentUserId;

    try {
      if (isFavorite) {
        await api.delete(`/favorites/${profileBarberId}`);
        if (!isCurrentFavoriteMutation(routeIdSnapshot, userIdSnapshot)) return;
        dispatch(
          removeFavorite({ clientId: currentUser.id, barberId: profileBarberId })
        );
        return;
      }

      const { data } = await api.post("/favorites", { barberId: profileBarberId });
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

  if (!isLoading && !barber && !error) {
    return <Container size="wide"><BarberProfileNotFound /></Container>;
  }

  const totalCerts = certifications.length + eventCertifications.length;

  return (
    <Container size="wide">
      <div className="space-y-8 pb-12">
      <BarberProfileError error={error} />

      {isLoading && <BarberProfileLoading />}

      {barber && (
        <>
          <BarberProfileHero
            barber={barber}
            currentUser={currentUser}
            isFavorite={isFavorite}
            profileBarberId={profileBarberId}
            reviewStats={reviewStats}
            salonId={salonId}
            salonName={salonName}
            salonRating={salonRating}
            showSalonLink={showSalonLink}
            startingPrice={startingPrice}
            toggleFavorite={toggleFavorite}
            totalCerts={totalCerts}
          />

          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              <BarberServicesSection
                barber={barber}
                barberServices={barberServices}
                profileBarberId={profileBarberId}
              />

              <BarberGallerySection
                barber={barber}
                galleryImages={galleryImages}
              />

              <PortfolioSection barberId={profileBarberId} />

              <BarberWorkHistorySection
                formatMonthYear={formatMonthYear}
                workHistory={workHistory}
              />

              <BarberCertificationsSection
                certifications={certifications}
                eventCertifications={eventCertifications}
                formatMonthYear={formatMonthYear}
                totalCerts={totalCerts}
              />
            </div>

            <BarberProfileSidebar
              barber={barber}
              formatReviewDate={formatReviewDate}
              reviewStats={reviewStats}
              startingPrice={startingPrice}
              totalCerts={totalCerts}
            />
          </div>
        </>
      )}
      </div>
    </Container>
  );
}
