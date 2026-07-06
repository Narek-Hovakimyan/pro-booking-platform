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
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{error}</span>
          <Button
            aria-label="Retry loading notifications"
            className="shrink-0"
            onClick={onRetry}
            size="icon"
            variant="ghost"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      )}

      {refreshing && (
        <p className="rounded-xl bg-neutral-50 px-3 py-2 text-center text-sm text-neutral-500">
          Refreshing notifications…
        </p>
      )}

      {initialLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <NotificationSkeleton key={item} />
          ))}
        </div>
      )}
    </>
  );
}
