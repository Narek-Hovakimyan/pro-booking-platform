import { Star } from "lucide-react";
import { Link } from "react-router-dom";

import { Card, CardContent } from "@/shared/components/ui/card";
import { getMediaUrl } from "@/shared/utils/media";

const professionLabels = {
  barber: "Barber",
  hair_stylist: "Hair stylist",
  nail_master: "Nail master",
  makeup_artist: "Makeup artist",
  cosmetologist: "Cosmetologist",
  lash_brow: "Lash & Brow",
  massage: "Massage therapist",
  other: "Specialist",
};

const barberTypeLabels = {
  men: "Men's barber",
  women: "Women's hairdresser",
  unisex: "Unisex",
};

export default function ProfileSidebarCard({
  profile,
  currentUser,
  showSalonLink,
  salonName,
  salonId,
  reviewsAverage = 0,
  reviewsCount = 0,
  salonRating,
  salonReviewsCount,
}) {
  const displayName = profile.name || currentUser.name || "";
  const professionLabel = professionLabels[profile.profession] || "";
  const barberTypeLabel =
    profile.profession === "barber" ? barberTypeLabels[profile.barberType] : "";
  const headline = [professionLabel, barberTypeLabel].filter(Boolean).join(" · ");
  const hasRating = reviewsCount > 0 && reviewsAverage > 0;
  const profileDetails = [
    profile.city,
    profile.address,
    profile.instagram,
  ].filter(Boolean);

  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-4 sm:p-6">
        {profile.imageUrl ? (
          <img
            alt={displayName}
            className="aspect-[4/3] w-full rounded-2xl object-cover"
            src={getMediaUrl(profile.imageUrl)}
          />
        ) : null}

        <div className="space-y-2">
          {displayName && (
            <h2 className="text-2xl font-bold text-neutral-950">
              {displayName}
            </h2>
          )}
          {headline && (
            <p className="text-sm font-medium text-neutral-600">
              {headline}
            </p>
          )}
          {hasRating && (
            <p className="text-sm text-neutral-600">
              <Star className="mr-1 inline-block h-4 w-4 fill-amber-400 text-amber-500" />
              {reviewsAverage.toFixed(1)} · {reviewsCount}{" "}
              {reviewsCount === 1 ? "review" : "reviews"}
            </p>
          )}
          {showSalonLink && (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              <Link
                className="text-sm font-semibold text-neutral-800 transition hover:text-neutral-950"
                to={`/salons/${salonId}`}
              >
                {salonName}
              </Link>
              {salonRating !== null && (
                <p className="mt-0.5 text-xs text-neutral-500">
                  <Star className="mr-0.5 inline-block h-3 w-3 fill-amber-400 text-amber-500" />
                  {salonRating ? salonRating.toFixed(1) : "0.0"} ·{" "}
                  {salonReviewsCount} reviews
                </p>
              )}
            </div>
          )}
        </div>

        {profile.bio && (
          <p className="text-sm leading-6 text-neutral-600">
            {profile.bio}
          </p>
        )}

        {profileDetails.length > 0 && (
          <div className="space-y-1 border-t border-neutral-100 pt-4 text-sm text-neutral-500">
            {profile.city && <p>{profile.city}</p>}
            {profile.address && <p>{profile.address}</p>}
            {profile.instagram && <p>{profile.instagram}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
