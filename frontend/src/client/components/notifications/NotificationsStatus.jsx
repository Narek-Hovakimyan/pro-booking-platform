import { RefreshCw } from "lucide-react";

import { NotificationSkeleton } from "@/shared/components/LoadingSkeletons";
import { Button } from "@/shared/components/ui/button";

export default function NotificationsStatus({
  error,
  initialLoading,
  onRetry,
  refreshing,
}) {
  return (
    <>
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          <span className="min-w-0 leading-6">{error}</span>
          <Button
            aria-label="Retry loading notifications"
            className="shrink-0 text-red-700 hover:bg-red-100"
            onClick={onRetry}
            size="icon"
            variant="ghost"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      )}

      {refreshing && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-brand-100 bg-brand-50 px-3 py-2 text-center text-sm font-medium text-brand-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
          Refreshing notifications…
        </div>
      )}

      {initialLoading && (
        <div className="space-y-3 rounded-3xl border border-neutral-100 bg-white p-3 shadow-card sm:p-4">
          {[0, 1, 2].map((item) => (
            <NotificationSkeleton key={item} />
          ))}
        </div>
      )}
    </>
  );
}
