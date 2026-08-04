import { Building2 } from "lucide-react";

import { Card, CardContent } from "@/shared/components/ui/card";

import SalonReportSections from "./SalonReportSections";
import SalonReportsFilters from "./SalonReportsFilters";
import SalonReportsHeader from "./SalonReportsHeader";
import { useSalonReportsData } from "./useSalonReportsData";

export default function SalonReportsPage() {
  const {
    salons,
    selectedSalonId,
    reports,
    loadingSalons,
    loadingReports,
    exportingCsv,
    error,
    errorCode,
    exportError,
    fromDate,
    toDate,
    selectedBarberId,
    staffOptions,
    setFromDate,
    setToDate,
    setSelectedBarberId,
    handleSalonChange,
    handleRefresh,
    handleExportCsv,
  } = useSalonReportsData();

  return (
    <div className="space-y-5 sm:space-y-6">
      <SalonReportsHeader
        exportingCsv={exportingCsv}
        loadingReports={loadingReports}
        onExportCsv={handleExportCsv}
        onRefresh={handleRefresh}
        selectedSalonId={selectedSalonId}
        fromDate={fromDate}
        toDate={toDate}
      />

      {error && errorCode !== "SALON_SUBSCRIPTION_REQUIRED" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {exportError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {exportError}
        </div>
      )}

      {loadingSalons ? (
        <Card>
          <CardContent className="text-sm text-neutral-500">
            Loading salons...
          </CardContent>
        </Card>
      ) : salons.length === 0 ? (
        <Card>
          <CardContent>
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-neutral-300" />
              <div>
                <h2 className="text-lg font-semibold text-neutral-950">
                  No manageable salons
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Salon reports appear after you own or administer a salon.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <SalonReportsFilters
            salons={salons}
            selectedSalonId={selectedSalonId}
            fromDate={fromDate}
            toDate={toDate}
            selectedBarberId={selectedBarberId}
            staffOptions={staffOptions}
            onSalonChange={handleSalonChange}
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
            onBarberChange={setSelectedBarberId}
          />

          <SalonReportSections
            reports={reports}
            loadingReports={loadingReports}
            errorCode={errorCode}
          />
        </>
      )}
    </div>
  );
}
