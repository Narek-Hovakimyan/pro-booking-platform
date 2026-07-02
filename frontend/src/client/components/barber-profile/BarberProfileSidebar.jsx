import { Award, BadgeCheck, Calendar, MapPin, Star } from "lucide-react";

import ReviewReplyBlock from "@/features/reviews/components/ReviewReplyBlock";
import { Card, CardContent } from "@/shared/components/ui/card";
import { getSpecialistProfessionDisplay } from "@/shared/data/professions";

export default function BarberProfileSidebar({
  barber,
  formatReviewDate,
  reviewStats,
  startingPrice,
  totalCerts,
}) {
  return (
    <div className="space-y-6">
      <Card className="rounded-2xl shadow-card sm:rounded-3xl">
        <CardContent className="space-y-5 p-5 sm:p-7">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <Star className="h-5 w-5 fill-amber-400 text-amber-500" />
              Reviews
            </h2>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    className={`h-4 w-4 ${
                      star <= Math.round(reviewStats.average || 0)
                        ? "fill-amber-400 text-amber-500"
                        : "text-neutral-200"
                    }`}
                    key={star}
                  />
                ))}
              </div>
              <p className="text-sm text-neutral-500">
                <span className="font-semibold text-neutral-900">
                  {reviewStats.average ? reviewStats.average.toFixed(1) : "0.0"}
                </span>
                {" · "}
                {reviewStats.count} {reviewStats.count === 1 ? "review" : "reviews"}
              </p>
            </div>
          </div>

          {reviewStats.reviews.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
              <Star className="h-8 w-8 text-neutral-300" />
              <p className="text-sm font-medium text-neutral-500">No reviews yet</p>
              <p className="text-xs text-neutral-400">Be the first to book and leave a review.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reviewStats.reviews.map((review) => {
                const rating = Math.max(
                  0,
                  Math.min(5, Math.round(Number(review?.rating || 0)))
                );

                return (
                  <div
                    className="rounded-xl border border-neutral-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                    key={review.id || review._id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-600">
                            {(review?.client?.name || review?.clientName || "C").charAt(0).toUpperCase()}
                          </div>
                          <span className="truncate font-semibold text-neutral-900">
                            {review?.client?.name || review?.clientName || "Client"}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                className={`h-3.5 w-3.5 ${
                                  star <= rating
                                    ? "fill-amber-400 text-amber-500"
                                    : "text-neutral-200"
                                }`}
                                key={star}
                              />
                            ))}
                          </div>
                          {review?.isVerified && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              <BadgeCheck className="h-3 w-3" />
                              Verified
                            </span>
                          )}
                        </div>
                      </div>
                      {review?.createdAt && (
                        <p className="shrink-0 text-[11px] text-neutral-400">
                          {formatReviewDate(review.createdAt)}
                        </p>
                      )}
                    </div>
                    {review?.comment ? (
                      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                        {review.comment}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm italic text-neutral-400">
                        No comment provided.
                      </p>
                    )}
                    <ReviewReplyBlock reply={review?.reply} />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-card sm:rounded-3xl">
        <CardContent className="space-y-4 p-5 sm:p-7">
          <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400">
            Quick info
          </h3>
          <div className="space-y-3">
            {(() => {
              const display = getSpecialistProfessionDisplay(barber);
              if (!display) return null;
              return (
                <div className="flex items-center gap-3 text-sm">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${display.className}`}>
                    {display.icon} {display.label}
                  </span>
                </div>
              );
            })()}
            {startingPrice && (
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 shrink-0 text-brand-600" />
                <span className="font-semibold text-brand-700">
                  From {startingPrice.toLocaleString()} դրամ
                </span>
              </div>
            )}
            {totalCerts > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <Award className="h-4 w-4 shrink-0 text-neutral-400" />
                <span className="text-neutral-700">
                  {totalCerts} {totalCerts === 1 ? "certification" : "certifications"}
                </span>
              </div>
            )}
            {barber?.city && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="h-4 w-4 shrink-0 text-neutral-400" />
                <span className="text-neutral-700">{barber.city}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
