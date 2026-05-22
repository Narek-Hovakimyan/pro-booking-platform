import SettingsCard from "@/barber/components/settings/SettingsCard";

function formatDate(dateValue) {
  if (!dateValue) return "";

  try {
    return new Date(dateValue).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function sortWorkHistory(workHistory) {
  return [...workHistory].sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;

    const aEnd = a.endDate ? new Date(a.endDate).getTime() : 0;
    const bEnd = b.endDate ? new Date(b.endDate).getTime() : 0;

    return bEnd - aEnd;
  });
}

export default function ProfileWorkHistorySection({ currentUser, savedProfile }) {
  const workHistory = currentUser?.workHistory || savedProfile?.workHistory || [];

  return (
    <SettingsCard
      title="Work History"
      description="Your past and present salon affiliations."
    >
      {!Array.isArray(workHistory) || workHistory.length === 0 ? (
        <p className="text-sm text-neutral-500">No work history yet</p>
      ) : (
        <div className="space-y-3">
          {sortWorkHistory(workHistory).map((entry, index) => {
            const salonName = entry?.salonName || entry?.salon?.name || "Salon";
            const startLabel = formatDate(entry.startDate);
            const endLabel = entry.isCurrent
              ? "current"
              : formatDate(entry.endDate);

            return (
              <div
                className="flex items-center gap-3 rounded-2xl border border-neutral-200 p-4"
                key={index}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base">
                  {entry.isCurrent ? "🟢" : "⚪"}
                </span>
                <div>
                  <div className="font-semibold text-neutral-950">
                    {salonName}
                  </div>
                  <div className="mt-0.5 text-sm text-neutral-500">
                    {entry.isCurrent
                      ? `Since ${startLabel}`
                      : `${startLabel} – ${endLabel}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SettingsCard>
  );
}
