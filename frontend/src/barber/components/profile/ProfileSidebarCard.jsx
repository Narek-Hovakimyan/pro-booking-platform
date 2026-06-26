import { MapPin, Star, AtSign } from "lucide-react";
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

  return (
    <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
      {/* Gradient header area */}
      {profile.imageUrl ? (
        <div className="relative">
          <img
            alt={displayName}
            className="aspect-[4/3] w-full object-cover"
            src={getMediaUrl(profile.imageUrl)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-purple-900/40 to-transparent" />
        </div>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100">
          <span className="text-4xl text-purple-300">
            {displayName.charAt(0).toUpperCase()}
          </span>
        </div>
      )}

      <CardContent className="space-y-4 p-5">
        {/* Name + headline */}
        <div>
          <h2 className="text-2xl font-bold text-neutral-950">{displayName}</h2>
          {headline && (
            <p className="mt-1 text-sm font-medium text-purple-600">{headline}</p>
          )}
        </div>

        {/* Rating */}
        {hasRating && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm">
            <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
            <span className="font-semibold text-amber-800">
              {reviewsAverage.toFixed(1)}
            </span>
            <span className="text-amber-600">
              ({reviewsCount} {reviewsCount === 1 ? "review" : "reviews"})
            </span>
          </div>
        )}

        {/* Salon link */}
        {showSalonLink && (
          <div className="rounded-xl border border-purple-100 bg-purple-50 p-3">
            <Link
              className="text-sm font-semibold text-purple-700 transition hover:text-purple-900"
              to={`/salons/${salonId}`}
            >
              {salonName}
            </Link>
            {salonRating !== null && (
              <p className="mt-0.5 text-xs text-purple-500">
                <Star className="mr-0.5 inline-block h-3 w-3 fill-amber-400 text-amber-500" />
                {salonRating ? salonRating.toFixed(1) : "0.0"} · {salonReviewsCount}{" "}
                {salonReviewsCount === 1 ? "review" : "reviews"}
              </p>
            )}
          </div>
        )}

        {/* Bio */}
        {profile.bio && (
          <p className="text-sm leading-6 text-neutral-600">{profile.bio}</p>
        )}

        {/* Details */}
        <div className="space-y-2 border-t border-neutral-100 pt-4 text-sm text-neutral-500">
          {(profile.city || profile.address) && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-neutral-400" />
              <span>{[profile.city, profile.address].filter(Boolean).join(", ")}</span>
            </div>
          )}
          {profile.instagram && (
            <div className="flex items-center gap-2">
              <AtSign className="h-3.5 w-3.5 text-neutral-400" />
              <span>{profile.instagram}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
