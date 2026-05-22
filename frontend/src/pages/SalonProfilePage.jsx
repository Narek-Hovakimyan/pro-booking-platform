import { BadgeCheck, Heart, MapPin, Phone, Star, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, useParams } from "react-router-dom";

import api from "@/shared/api/axios";
import BarberCard from "@/client/components/BarberCard";
import SalonOpenJobs from "@/features/jobs/components/SalonOpenJobs";
import ReviewReplyBlock from "@/features/reviews/components/ReviewReplyBlock";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import EmptyState from "@/shared/components/common/EmptyState";
import {
  addFavorite,
  removeFavorite,
  setFavorites,
} from "@/store/slices/favoritesSlice";
import { setReviews } from "@/store/slices/reviewsSlice";
import { setServices } from "@/store/slices/servicesSlice";
import { getMediaUrl } from "@/shared/utils/media";

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

function getIdString(value) {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
}

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

  // Per-review reply editor state
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [editMessage, setEditMessage] = useState("");
  const [savingReviewId, setSavingReviewId] = useState(null);
  const [deletingReviewId, setDeletingReviewId] = useState(null);
  const [perReviewError, setPerReviewError] = useState(null);
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

  // ── Reply editor handlers ─────────────────────────────────────────

  function handleStartAdd(reviewId) {
    setPerReviewError(null);
    setEditingReviewId(reviewId);
    setEditMessage("");
  }

  function handleStartEdit(reviewId, currentReplyMessage) {
    setPerReviewError(null);
    setEditingReviewId(reviewId);
    setEditMessage(currentReplyMessage || "");
  }

  function handleCancelEdit() {
    setEditingReviewId(null);
    setEditMessage("");
    setPerReviewError(null);
  }

  async function handleSaveReply(reviewId) {
    const trimmed = editMessage.trim();

    if (!trimmed) {
      setPerReviewError({ reviewId, message: "Reply message is required." });
      return;
    }

    setPerReviewError(null);
    setSavingReviewId(reviewId);

    try {
      const { data } = await api.put(`/salon-reviews/${reviewId}/reply`, {
        message: trimmed,
      });

      setSalonReviews((prev) =>
        prev.map((r) =>
          (r.id || r._id) === reviewId ? { ...r, ...data } : r
        )
      );

      setEditingReviewId(null);
      setEditMessage("");
    } catch (err) {
      setPerReviewError({
        reviewId,
        message:
          err.response?.data?.message || "Could not save reply. Please try again.",
      });
    } finally {
      setSavingReviewId(null);
    }
  }

  async function handleDeleteReply(reviewId) {
    if (!window.confirm("Delete this reply?")) return;

    setPerReviewError(null);
    setDeletingReviewId(reviewId);

    try {
      const { data } = await api.delete(`/salon-reviews/${reviewId}/reply`);

      setSalonReviews((prev) =>
        prev.map((r) =>
          (r.id || r._id) === reviewId ? { ...r, ...data } : r
        )
      );
    } catch (err) {
      setPerReviewError({
        reviewId,
        message:
          err.response?.data?.message ||
          "Could not delete reply. Please try again.",
      });
    } finally {
      setDeletingReviewId(null);
    }
  }

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
    return <Navigate to="/barbers" replace />;
  }

  const averageRating = Number(salon?.averageRating || 0);
  const reviewsCount = Number(salon?.totalReviews ?? salon?.reviewsCount ?? 0);
  const barbersList = salon?.barbers || [];

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
          <Card className="rounded-2xl sm:rounded-3xl">
            <CardContent className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[320px_1fr]">
              <div className="relative">
                {salon?.imageUrl ? (
                  <img
                    alt={salon?.name || "Salon image"}
                    className="aspect-[4/3] w-full rounded-2xl object-cover"
                    src={getMediaUrl(salon?.imageUrl)}
                  />
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-neutral-100">
                    <Store className="h-16 w-16 text-neutral-400" />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                      {salon?.name}
                    </h1>
                    <div className="mt-2 space-y-1 text-sm text-neutral-500">
                      {salon?.city && (
                        <p className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {salon?.city}
                        </p>
                      )}
                      {salon?.address && <p className="ml-6">{salon?.address}</p>}
                      {salon?.phone && (
                        <p className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          {salon?.phone}
                        </p>
                      )}
                    </div>
                  </div>

                  {currentUser?.role === "client" && salon && (
                    <Button
                      aria-label={
                        isSalonFavorited
                          ? "Remove salon from favorites"
                          : "Add salon to favorites"
                      }
                      onClick={handleSalonFavorite}
                      variant={isSalonFavorited ? "default" : "outline"}
                    >
                      <Heart
                        className={`mr-2 h-4 w-4 ${
                          isSalonFavorited ? "fill-white" : ""
                        }`}
                      />
                      {isSalonFavorited ? "Favorited" : "Add to favorites"}
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap gap-3">
                  <p className="inline-flex items-center gap-2 rounded-xl bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-900">
                    <Store className="h-4 w-4 text-neutral-500" />
                    {barbersList.length}{" "}
                    {barbersList.length === 1 ? "barber" : "barbers"}
                  </p>
                  <p className="inline-flex items-center gap-2 rounded-xl bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-900">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                    {averageRating
                      ? `${averageRating.toFixed(1)} (${reviewsCount} reviews)`
                      : "No reviews yet"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <div>
              <h2 className="text-xl font-bold">Reviews</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {averageRating
                  ? `${averageRating.toFixed(1)} average rating · ${reviewsCount} reviews`
                  : "No reviews yet"}
              </p>
            </div>

            {salonReviews.length === 0 ? (
              <EmptyState
                description="No salon reviews yet. Book an appointment with one of our barbers and leave a review!"
                title="No reviews yet"
              />
            ) : (
              <div className="space-y-3">
                {salonReviews.map((review) => {
                  const safeRating = Math.max(1, Math.min(5, Math.round(Number(review?.rating || 0))));
                  const reviewId = review?.id || review?._id;
                  const hasReply =
                    typeof review?.reply?.message === "string" &&
                    review.reply.message.trim().length > 0;
                  const isEditing = editingReviewId === reviewId;
                  const isSaving = savingReviewId === reviewId;
                  const isDeleting = deletingReviewId === reviewId;
                  const showError =
                    perReviewError && perReviewError.reviewId === reviewId;

                  return (
                    <div
                      className="rounded-2xl border border-neutral-200 bg-white p-4 transition hover:shadow-sm"
                      key={reviewId}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-sm font-bold text-neutral-600">
                            {getReviewClientAvatar(review) ? (
                              <img
                                alt={`${getReviewClientName(review)}'s avatar`}
                                className="h-full w-full object-cover"
                                src={getMediaUrl(getReviewClientAvatar(review))}
                              />
                            ) : (
                              <span className="text-neutral-500" aria-hidden="true">
                                {getInitial(getReviewClientName(review))}
                              </span>
                            )}
                          </span>
                          <div>
                            <p className="font-semibold text-neutral-950">
                              {getReviewClientName(review)}
                            </p>
                            {review?.isVerified && (
                              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                Verified
                              </span>
                            )}
                          </div>
                        </div>
                        {review?.createdAt && (
                          <time className="text-xs text-neutral-400" dateTime={review.createdAt}>
                            {formatReviewDate(review.createdAt)}
                          </time>
                        )}
                      </div>
                      <div className="mt-3 inline-flex items-center gap-0.5 text-amber-500" aria-label={`${safeRating} out of 5 stars`}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-3.5 w-3.5 ${star <= safeRating ? "fill-amber-400 text-amber-500" : "fill-none text-neutral-300"}`}
                            aria-hidden="true"
                          />
                        ))}
                      </div>
                      {review?.comment && (
                        <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                          {review.comment}
                        </p>
                      )}
                      <ReviewReplyBlock reply={review?.reply} />

                      {/* Inline error */}
                      {showError && (
                        <p className="mt-2 text-sm text-red-600">
                          {perReviewError.message}
                        </p>
                      )}

                      {/* Owner/admin reply editor */}
                      {canManageCurrentSalon && (
                        <>
                          {isEditing ? (
                            <div className="mt-3 space-y-2">
                              <textarea
                                className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                rows={3}
                                placeholder="Write your reply..."
                                value={editMessage}
                                onChange={(e) => setEditMessage(e.target.value)}
                                disabled={isSaving}
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                                  onClick={() => handleSaveReply(reviewId)}
                                  disabled={isSaving}
                                >
                                  {isSaving ? "Saving..." : "Save"}
                                </button>
                                <button
                                  className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                                  onClick={handleCancelEdit}
                                  disabled={isSaving}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 flex gap-2">
                              {!hasReply ? (
                                <button
                                  className="text-xs font-medium text-amber-600 hover:text-amber-700 disabled:opacity-50"
                                  onClick={() => handleStartAdd(reviewId)}
                                  disabled={isDeleting}
                                >
                                  Add reply
                                </button>
                              ) : (
                                <>
                                  <button
                                    className="text-xs font-medium text-amber-600 hover:text-amber-700 disabled:opacity-50"
                                    onClick={() =>
                                      handleStartEdit(
                                        reviewId,
                                        review?.reply?.message || ""
                                      )
                                    }
                                    disabled={isDeleting}
                                  >
                                    Edit reply
                                  </button>
                                  <button
                                    className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                                    onClick={() => handleDeleteReply(reviewId)}
                                    disabled={isDeleting}
                                  >
                                    {isDeleting ? "Deleting..." : "Delete reply"}
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <SalonOpenJobs jobs={salonJobs} isLoading={jobsLoading} salonId={salonId} />

          <div className="space-y-3">
            <div>
              <h2 className="text-xl font-bold">Barbers at {salon?.name}</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Select a barber to view their profile or book an appointment.
              </p>
            </div>

            {!barbersList.length ? (
              <EmptyState
                description="This salon does not have approved barbers yet."
                title="No barbers in this salon"
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {barbersList.map((barber) => (
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
