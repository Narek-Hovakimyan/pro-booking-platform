import { Download, RefreshCw } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

export default function SalonReportsHeader({
  exportingCsv,
  loadingReports,
  onExportCsv,
  onRefresh,
  selectedSalonId,
  fromDate,
  toDate,
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Salon Reports
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Date-range analytics for salon-managed staff.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          className="gap-2"
          disabled={
            !selectedSalonId || !fromDate || !toDate || loadingReports || exportingCsv
          }
          onClick={onExportCsv}
          variant="outline"
        >
          <Download className={`h-4 w-4 ${exportingCsv ? "animate-pulse" : ""}`} />
          {exportingCsv ? "Exporting..." : "Export CSV"}
        </Button>
        <Button
          className="gap-2"
          disabled={!selectedSalonId || loadingReports}
          onClick={onRefresh}
          variant="outline"
        >
          <RefreshCw className={`h-4 w-4 ${loadingReports ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
    </div>
  );
}
