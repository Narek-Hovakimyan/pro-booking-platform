import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";

export default function ProfileSalonCard({
  showSalonLink,
  salonName,
  salonId,
  salonRating,
  salonReviewsCount,
}) {
  return (
    <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
      <div className="bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-4">
        <h2 className="font-bold text-white">Salon & work</h2>
      </div>
      <CardContent className="p-5">
        {showSalonLink ? (
          <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
            <Link
              className="font-semibold text-purple-700 hover:text-purple-900"
              to={`/salons/${salonId}`}
            >
              {salonName}
            </Link>
            {salonRating !== null && (
              <p className="mt-1 text-sm text-purple-500">
                <Star className="mr-0.5 inline-block h-3 w-3 fill-amber-400 text-amber-500" />
                {salonRating ? salonRating.toFixed(1) : "0.0"} ·{" "}
                {salonReviewsCount} {salonReviewsCount === 1 ? "review" : "reviews"}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No salon connected yet.</p>
        )}
      </CardContent>
    </Card>
  );
}