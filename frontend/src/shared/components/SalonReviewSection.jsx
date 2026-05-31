import { BadgeCheck, Star } from "lucide-react";
import { useState } from "react";

import ReviewReplyBlock from "@/features/reviews/components/ReviewReplyBlock";
import api from "@/shared/api/axios";
import EmptyState from "@/shared/components/common/EmptyState";
import { getMediaUrl } from "@/shared/utils/media";

// ── Helpers ────────────────────────────────────────────────────────

function formatReviewDate(date) {
  if (!date) return "";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function getReviewClientName(review) {
  return (
    review?.clientId?.name ||
    review?.client?.name ||
    review?.clientName ||
    "Client"
  );
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

// ── Component ──────────────────────────────────────────────────────

export default function SalonReviewSection({
  salonReviews,
  setSalonReviews,
  canManageCurrentSalon,
  averageRating,
  reviewsCount,
}) {
  // Per-review reply editor state
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [editMessage, setEditMessage] = useState("");
  const [savingReviewId, setSavingReviewId] = useState(null);
  const [deletingReviewId, setDeletingReviewId] = useState(null);
  const [perReviewError, setPerReviewError] = useState(null);

  // ── Reply editor handlers ──────────────────────────────────────

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
          err.response?.data?.message ||
          "Could not save reply. Please try again.",
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

  // ── Render ──────────────────────────────────────────────────────

  return (
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
          description="No salon reviews yet. Book an appointment with one of our specialists and leave a review!"
          title="No reviews yet"
        />
      ) : (
        <div className="space-y-3">
          {salonReviews.map((review) => {
            const safeRating = Math.max(
              1,
              Math.min(5, Math.round(Number(review?.rating || 0)))
            );
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
                    <time
                      className="text-xs text-neutral-400"
                      dateTime={review.createdAt}
                    >
                      {formatReviewDate(review.createdAt)}
                    </time>
                  )}
                </div>
                <div
                  className="mt-3 inline-flex items-center gap-0.5 text-amber-500"
                  aria-label={`${safeRating} out of 5 stars`}
                >
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
  );
}
