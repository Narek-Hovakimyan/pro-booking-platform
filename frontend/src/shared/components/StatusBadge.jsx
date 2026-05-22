import { cn } from "@/shared/lib/utils";

const statusStyles = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-emerald-100 text-emerald-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
  completed: "bg-blue-100 text-blue-800",
  cancelled: "bg-neutral-200 text-neutral-600",
  expired: "bg-orange-100 text-orange-800",
  no_show: "bg-red-100 text-red-700",
  late_cancelled: "bg-orange-100 text-orange-800",
};

const statusLabels = {
  pending: "Pending confirmation",
  accepted: "Confirmed",
  confirmed: "Confirmed",
  rejected: "Rejected",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
  no_show: "No-show",
  late_cancelled: "Late cancellation",
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium",
        statusStyles[status] || statusStyles.pending
      )}
    >
      {statusLabels[status] || statusLabels.pending}
    </span>
  );
}
