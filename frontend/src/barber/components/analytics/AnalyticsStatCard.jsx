import { cn } from "@/shared/lib/utils";

export function StatCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-2 h-4 w-20 rounded-full bg-neutral-100" />
      <div className="h-7 w-16 rounded-lg bg-neutral-100" />
    </div>
  );
}

export default function AnalyticsStatCard({
  label,
  value,
  icon: Icon,
  accent = "neutral",
  subtitle = "",
  className = "",
}) {
  const accentMap = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    neutral: "border-neutral-200 bg-white text-neutral-700",
  };

  return (
    <div
      className={cn(
        "rounded-2xl border p-5 shadow-sm transition hover:shadow-md",
        accentMap[accent] || accentMap.neutral,
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest opacity-80">
          {label}
        </p>
        <Icon className="h-4 w-4 shrink-0 opacity-60" />
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {subtitle && (
        <p className="mt-0.5 text-xs font-medium opacity-70">{subtitle}</p>
      )}
    </div>
  );
}
