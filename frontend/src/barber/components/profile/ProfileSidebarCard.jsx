import { Star } from "lucide-react";
import { Link } from "react-router-dom";

import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { getMediaUrl } from "@/shared/utils/media";

export default function ProfileSidebarCard({
  profile,
  currentUser,
  showSalonLink,
  salonName,
  salonId,
  salonRating,
  salonReviewsCount,
}) {
  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-4 sm:p-6">
        {profile.imageUrl ? (
          <img
            alt={profile.name || currentUser.name}
            className="aspect-[4/3] w-full rounded-2xl object-cover"
            src={getMediaUrl(profile.imageUrl)}
          />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
            No image
          </div>
        )}

        <div>
          <h2 className="text-2xl font-bold">
            {profile.name || currentUser.name}
          </h2>
          <p className="text-sm text-neutral-500">
            {profile.phone || "Phone"}
          </p>
          {showSalonLink && (
            <div className="mt-2">
              <Button
                as={Link}
                className="justify-start px-0 text-left text-sm font-semibold text-neutral-700"
                to={`/salons/${salonId}`}
                variant="ghost"
              >
                {salonName}
              </Button>
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

        <p className="text-sm text-neutral-600">
          {profile.bio || "Bio"}
        </p>
        <p className="text-sm text-neutral-500">
          {profile.city || "City"}
        </p>
        <p className="text-sm text-neutral-500">
          {profile.address || "Address"}
        </p>
        <p className="text-sm text-neutral-500">
          {profile.instagram || "Instagram"}
        </p>
      </CardContent>
    </Card>
  );
}
