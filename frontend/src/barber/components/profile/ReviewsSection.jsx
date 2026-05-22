import { useState } from "react";
import { Card, CardContent } from "@/shared/components/ui/card";
import ReviewReplyBlock from "@/features/reviews/components/ReviewReplyBlock";
import { formatReviewDate } from "@/barber/utils/profileHelpers";
import api from "@/shared/api/axios";

function getReviewId(review) {
  return review?.id || review?._id || null;
}

function getClientId(review) {
  const client = review?.clientId;

  if (client && typeof client === "object") {
    return client.id || client._id || null;
  }

  return client || null;
}

function getReviewKey(review) {
  return (
    getReviewId(review) ||
    review?.bookingId ||
    `${review?.clientId || "client"}-${review?.createdAt || review?.comment || "review"}`
  );
}

function getDisplayRating(value) {
  const rating = Number(value || 0);

  if (!Number.isFinite(rating)) return 0;

  return Math.min(5, Math.max(0, Math.round(rating)));
}

function ReviewReplyEditor({
  editMessage,
  isSaving,
  onCancel,
  onMessageChange,
  onSave,
}) {
  return (
    <div className="mt-3 space-y-2">
      <textarea
        className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        rows={3}
        placeholder="Write your reply..."
        value={editMessage}
        onChange={(e) => onMessageChange(e.target.value)}
        disabled={isSaving}
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
        <button
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ReviewItem({
  review,
  client,
  editMessage,
  isDeleting,
  isEditing,
  isSaving,
  errorMessage,
  onCancelEdit,
  onDeleteReply,
  onEditMessageChange,
  onSaveReply,
  onStartAdd,
  onStartEdit,
}) {
  const reviewId = getReviewId(review);
  const rating = getDisplayRating(review?.rating);
  const hasReply =
    typeof review?.reply?.message === "string" &&
    review.reply.message.trim().length > 0;

  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">
            {review?.client?.name ||
              review?.clientId?.name ||
              review?.clientName ||
              client?.name ||
              "Client"}
          </div>
          {review?.isVerified && (
            <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              Verified booking
            </span>
          )}
          <div className="text-sm text-amber-600" aria-label={`${rating} out of 5 stars`}>
            {"★".repeat(rating)}
            {"☆".repeat(5 - rating)}
          </div>
        </div>
        {review?.createdAt && (
          <div className="shrink-0 text-xs text-neutral-500">
            {formatReviewDate(review.createdAt)}
          </div>
        )}
      </div>

      <p className="mt-2 text-sm text-neutral-600">
        {review?.comment || "No comment provided."}
      </p>

      <ReviewReplyBlock reply={review?.reply} />

      {errorMessage && (
        <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
      )}

      {isEditing ? (
        <ReviewReplyEditor
          editMessage={editMessage}
          isSaving={isSaving}
          onCancel={onCancelEdit}
          onMessageChange={onEditMessageChange}
          onSave={() => onSaveReply(reviewId)}
        />
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {!hasReply ? (
            <button
              className="text-xs font-medium text-amber-600 hover:text-amber-700 disabled:opacity-50"
              onClick={() => onStartAdd(reviewId)}
              disabled={!reviewId || isDeleting}
            >
              Add reply
            </button>
          ) : (
            <>
              <button
                className="text-xs font-medium text-amber-600 hover:text-amber-700 disabled:opacity-50"
                onClick={() => onStartEdit(reviewId, review?.reply?.message || "")}
                disabled={!reviewId || isDeleting}
              >
                Edit reply
              </button>
              <button
                className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                onClick={() => onDeleteReply(reviewId)}
                disabled={!reviewId || isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete reply"}
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

export default function ReviewsSection({
  reviews = [],
  reviewsAverage = 0,
  reviewsError = "",
  isReviewsLoading = false,
  clients = [],
}) {
  const [localReplies, setLocalReplies] = useState({});
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [editMessage, setEditMessage] = useState("");
  const [savingReviewId, setSavingReviewId] = useState(null);
  const [deletingReviewId, setDeletingReviewId] = useState(null);
  const [perReviewError, setPerReviewError] = useState(null);

  function getEffectiveReview(review) {
    const key = getReviewId(review);
    if (!key || !localReplies[key]) return review;

    const localReview = localReplies[key];

    return {
      ...review,
      ...localReview,
      id: localReview?.id || review?.id,
      _id: localReview?._id || review?._id,
    };
  }

  function handleStartAdd(reviewId) {
    if (!reviewId) return;
    setPerReviewError(null);
    setEditingReviewId(reviewId);
    setEditMessage("");
  }

  function handleStartEdit(reviewId, currentReplyMessage) {
    if (!reviewId) return;
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
    if (!reviewId) return;

    const trimmed = editMessage.trim();

    if (!trimmed) {
      setPerReviewError({ reviewId, message: "Reply message is required." });
      return;
    }

    setPerReviewError(null);
    setSavingReviewId(reviewId);

    try {
      const { data } = await api.put(`/reviews/${reviewId}/reply`, {
        message: trimmed,
      });

      setLocalReplies((prev) => ({
        ...prev,
        [reviewId]: data,
      }));

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
    if (!reviewId) return;
    if (!window.confirm("Delete this reply?")) return;

    setPerReviewError(null);
    setDeletingReviewId(reviewId);

    try {
      const { data } = await api.delete(`/reviews/${reviewId}/reply`);

      setLocalReplies((prev) => ({
        ...prev,
        [reviewId]: data,
      }));
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

  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="text-xl font-bold sm:text-2xl">Reviews</h2>
          <p className="mt-1 text-sm text-neutral-500">
            ⭐ {reviewsAverage ? reviewsAverage.toFixed(1) : "0.0"} ·{" "}
            {reviews.length} reviews
          </p>
        </div>

        {isReviewsLoading ? (
          <p className="text-neutral-500">Loading reviews...</p>
        ) : reviewsError ? (
          <p className="text-sm text-red-600">{reviewsError}</p>
        ) : reviews.length === 0 ? (
          <p className="text-neutral-500">No reviews yet</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => {
              const effectiveReview = getEffectiveReview(review);
              const clientId = getClientId(effectiveReview);
              const client = clients.find(
                (user) =>
                  String(user.id || user._id) === String(clientId)
              );
              const reviewId = getReviewId(effectiveReview);
              const isEditing = editingReviewId === reviewId;
              const isSaving = savingReviewId === reviewId;
              const isDeleting = deletingReviewId === reviewId;

              return (
                <ReviewItem
                  client={client}
                  editMessage={editMessage}
                  errorMessage={
                    perReviewError?.reviewId === reviewId
                      ? perReviewError.message
                      : ""
                  }
                  isDeleting={isDeleting}
                  isEditing={isEditing}
                  isSaving={isSaving}
                  key={getReviewKey(effectiveReview)}
                  review={effectiveReview}
                  onCancelEdit={handleCancelEdit}
                  onDeleteReply={handleDeleteReply}
                  onEditMessageChange={setEditMessage}
                  onSaveReply={handleSaveReply}
                  onStartAdd={handleStartAdd}
                  onStartEdit={handleStartEdit}
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
