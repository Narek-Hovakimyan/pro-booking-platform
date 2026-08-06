import { Button } from "@/shared/components/ui/button";

export function BillingAlerts({ error, success, selectedSalonId, loadingDetails, onRetry }) {
  return (
    <>
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            {selectedSalonId && (
              <Button
                disabled={loadingDetails}
                onClick={onRetry}
                size="sm"
                variant="outline"
              >
                Retry
              </Button>
            )}
          </div>
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 shadow-sm">
          {success}
        </div>
      )}
    </>
  );
}
