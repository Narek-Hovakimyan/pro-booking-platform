import { ChevronRight } from "lucide-react";

export default function AnalyticsQuickActionButton({ icon: Icon, label, onClick }) {
  return (
    <button
      className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 text-left text-sm font-medium text-neutral-700 shadow-sm transition-all duration-150 hover:border-neutral-300 hover:bg-neutral-50 hover:shadow-md active:scale-[0.98]"
      onClick={onClick}
      type="button"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600">
        <Icon className="h-4 w-4" />
      </div>
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-neutral-300" />
    </button>
  );
}
