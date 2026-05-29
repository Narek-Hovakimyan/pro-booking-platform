import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Gift } from "lucide-react";
import { getMyLoyaltyProgress } from "@/shared/api/loyalty";

export default function LoyaltyBanner() {
  const { currentUser } = useSelector((state) => state.auth);
  const canViewLoyalty = Boolean(currentUser?.id && currentUser?.role === "client");
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canViewLoyalty) {
      return;
    }

    let mounted = true;

    getMyLoyaltyProgress()
      .then((data) => {
        if (mounted) setProgress(data);
      })
      .catch(() => {
        // silently ignore
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [canViewLoyalty]);

  if (!canViewLoyalty || loading || progress.length === 0) return null;

  return (
    <div className="space-y-3">
      {progress.map((entry) => {
        const program = entry.programId;
        if (!program) return null;

        const remaining = program.requiredVisits - (entry.punchCount % program.requiredVisits);
        const totalVisits = entry.punchCount;
        const rewardsEarned = entry.rewardsEarned;

        return (
          <div
            key={String(entry._id)}
            className="flex items-center gap-3 rounded-xl border border-pink-200 bg-pink-50/60 p-4"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 text-pink-600">
              <Gift className="h-5 w-5" />
            </div>
            <div className="flex-1 text-sm">
              <p className="font-medium text-pink-800">{program.title}</p>
              <p className="text-pink-600">
                {totalVisits} / {program.requiredVisits} visits —{" "}
                {rewardsEarned > 0 ? (
                  <span className="font-semibold text-pink-700">
                    {rewardsEarned} reward{rewardsEarned > 1 ? "s" : ""} earned!
                  </span>
                ) : (
                  <span>{remaining} more visit{remaining > 1 ? "s" : ""} to earn reward</span>
                )}
              </p>
              {rewardsEarned === 0 && (
                <p className="mt-0.5 text-xs text-pink-500">{program.rewardText}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
