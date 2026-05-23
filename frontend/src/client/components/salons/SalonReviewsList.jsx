import { BadgeCheck, Star } from "lucide-react";

import ReviewReplyBlock from "@/features/reviews/components/ReviewReplyBlock";
import EmptyState from "@/shared/components/common/EmptyState";
import { getMediaUrl } from "@/shared/utils/media";

function StarRating({ rating = 0 }) {
  const safeRating = Math.max(1, Math.min(5, Math.round(Number(rating || 0))));
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`${safeRating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-3.5 w-3.5 ${star <= safeRating ? "fill-amber-400 text-amber-500" : "fill-none text-neutral-300"}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export default function SalonReviewsList({
  formatReviewDate,
  getInitial,
  getReviewClientAvatar,
  getReviewClientName,
  reviews = [],
}) {
  if (!reviews.length) {
    return (
      <EmptyState
        description="No salon reviews yet. Book an appointment with one of our specialists and leave a review!"
        title="No reviews yet"
      />
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => {
        return (
          <div
            className="rounded-2xl border border-neutral-200 bg-white p-4 transition hover:shadow-sm"
            key={review?.id || review?._id}
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
            <div className="mt-3">
              <StarRating rating={review?.rating} />
            </div>
            {review?.comment && (
              <p className="mt-2 text-sm leading-relaxed text-neutral-700">{review.comment}</p>
            )}
            <ReviewReplyBlock reply={review?.reply} />
          </div>
        );
      })}
    </div>
  );
}
