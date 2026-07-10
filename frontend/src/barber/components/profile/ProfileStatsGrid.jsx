import { Star, BriefcaseBusiness, Scissors, Image } from "lucide-react";

function StatCard({ icon: Icon, label, value, helper }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-lg font-bold text-neutral-950">{value}</p>
          <p className="text-xs font-medium text-neutral-500">{label}</p>
        </div>
      </div>
      {helper && <p className="mt-2 text-xs text-neutral-400">{helper}</p>}
    </div>
  );
}

export default function ProfileStatsGrid({
  statRating,
  statReviews,
  statServices,
  statPortfolio,
  barberReviews,
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={Star}
        label="Rating"
        value={statRating}
        helper={barberReviews.length > 0 ? "Client average" : "Waiting for first review"}
      />
      <StatCard
        icon={BriefcaseBusiness}
        label="Reviews"
        value={statReviews}
      />
      <StatCard
        icon={Scissors}
        label="Services"
        value={statServices}
      />
      <StatCard
        icon={Image}
        label="Portfolio"
        value={statPortfolio}
      />
    </div>
  );
}