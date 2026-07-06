import { Briefcase } from "lucide-react";

import { Card, CardContent } from "@/shared/components/ui/card";

export default function BarberWorkHistorySection({
  formatMonthYear,
  workHistory,
}) {
  if (workHistory.length === 0) return null;

  return (
    <Card className="rounded-2xl shadow-card sm:rounded-3xl">
      <CardContent className="space-y-4 p-5 sm:p-7">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Briefcase className="h-5 w-5" />
          Work history
        </h2>

        <div className="space-y-3">
          {workHistory.map((history, index) => {
            const startDate = formatMonthYear(history?.startDate);
            const endDate = formatMonthYear(history?.endDate);
            const label =
              history?.salonName ||
              history?.salon?.name ||
              "Salon";
            const range = history?.isCurrent
              ? startDate
                ? `Since ${startDate}`
                : "Current"
              : [startDate, endDate || "Present"]
                  .filter(Boolean)
                  .join(" – ");

            return (
              <div
                className="flex items-start gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
                key={`${history?.salon || label}-${history?.startDate || index}`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50">
                  <Briefcase className="h-5 w-5 text-brand-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-neutral-900">
                    {history?.isCurrent ? `${label}` : label}
                  </div>
                  {range && (
                    <div className="mt-0.5 text-sm text-neutral-500">
                      {range}
                    </div>
                  )}
                  {history?.isCurrent && (
                    <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      Current
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
