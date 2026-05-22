import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import StatusBadge from "@/shared/components/StatusBadge";
import { Button } from "@/shared/components/ui/button";

export default function AnalyticsBookingRow({
  booking,
  linkTo,
  getClientName,
  getServiceName,
  getBookingTime,
  getBookingPrice,
}) {
  const navigate = useNavigate();
  const status = booking?.status || "pending";

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-900">
            {getClientName(booking)}
          </span>
          <StatusBadge status={status} />
        </div>
        <p className="mt-0.5 text-sm text-neutral-500">
          {getServiceName(booking)}
          {getBookingTime(booking) ? ` · ${getBookingTime(booking)}` : ""}
          {getBookingPrice(booking) ? ` · ${getBookingPrice(booking)} AMD` : ""}
        </p>
        {booking?.note && (
          <p className="mt-0.5 text-xs text-neutral-400">Note: {booking.note}</p>
        )}
      </div>

      {linkTo && (
        <Button
          className="shrink-0 text-xs"
          onClick={() => navigate(linkTo)}
          size="default"
          variant="outline"
        >
          View
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
