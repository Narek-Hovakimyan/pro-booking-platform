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

function sortWorkHistoryRows(workHistoryRows) {
  return [...workHistoryRows].sort((a, b) => {
    if (a.entry?.isCurrent && !b.entry?.isCurrent) return -1;
    if (!a.entry?.isCurrent && b.entry?.isCurrent) return 1;

    const aEnd = a.entry?.endDate ? new Date(a.entry.endDate).getTime() : 0;
    const bEnd = b.entry?.endDate ? new Date(b.entry.endDate).getTime() : 0;

    return bEnd - aEnd;
  });
}

function getWorkHistoryKeyBase(entry, sourceIndex) {
  const rawId = entry?._id;

  if (typeof rawId === "string" && rawId.trim()) {
    return `id:${rawId}`;
  }

  return `legacy:${sourceIndex}`;
}

function buildWorkHistoryRows(workHistory) {
  if (!Array.isArray(workHistory)) {
    return [];
  }

  const rows = workHistory.map((entry, sourceIndex) => ({
    entry,
    keyBase: getWorkHistoryKeyBase(entry, sourceIndex),
  }));
  const keyTotals = new Map();
  const keyOccurrences = new Map();

  rows.forEach(({ keyBase }) => {
    keyTotals.set(keyBase, (keyTotals.get(keyBase) || 0) + 1);
  });

  return rows.map((row) => {
    const occurrence = keyOccurrences.get(row.keyBase) || 0;
    keyOccurrences.set(row.keyBase, occurrence + 1);

    return {
      ...row,
      key:
        keyTotals.get(row.keyBase) === 1
          ? row.keyBase
          : `${row.keyBase}:dup:${occurrence}`,
    };
  });
}

export default function ProfileWorkHistorySection({ currentUser, savedProfile }) {
  const workHistory = currentUser?.workHistory || savedProfile?.workHistory || [];
  const workHistoryRows = buildWorkHistoryRows(workHistory);

  return (
    <SettingsCard
      title="Work History"
      description="Your past and present salon affiliations."
    >
      {!Array.isArray(workHistory) || workHistory.length === 0 ? (
        <p className="text-sm text-neutral-500">No work history yet</p>
      ) : (
        <div className="space-y-3">
          {sortWorkHistoryRows(workHistoryRows).map(({ entry, key }) => {
            const salonName = entry?.salonName || entry?.salon?.name || "Salon";
            const startLabel = formatDate(entry.startDate);
            const endLabel = entry.isCurrent
              ? "current"
              : formatDate(entry.endDate);

            return (
              <div
                className="flex items-center gap-3 rounded-2xl border border-neutral-200 p-4"
                key={key}
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
