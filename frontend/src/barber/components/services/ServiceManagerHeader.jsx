import { AlertCircle, Plus, Scissors, Settings } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

export default function ServiceManagerHeader({
  servicesCount,
  activeCount,
  inactiveCount,
  error,
  isLoading,
  isSaving,
  isEmpty,
  onAdd,
  fullPage = false,
  children,
}) {
  return (
    <Card
      className={`overflow-hidden rounded-3xl border-purple-100 bg-gradient-to-br from-purple-50/80 via-white to-pink-50/60 shadow-lg shadow-purple-100/40 ${
        fullPage ? "lg:col-span-3" : ""
      }`}
    >
      <CardContent className="space-y-6 p-4 sm:p-6">
        {/* Header + stats */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-purple-700 shadow-sm ring-1 ring-purple-100">
                <Settings className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-2xl font-bold text-neutral-950 sm:text-3xl">Services</h2>
                <p className="mt-1 max-w-2xl text-sm text-neutral-600">
                  Manage service prices, duration, categories, and booking options clients see when booking.
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white bg-white/80 p-2 text-center shadow-sm">
            <div className="px-2">
              <p className="text-lg font-bold text-neutral-950">{servicesCount}</p>
              <p className="text-[11px] font-semibold uppercase text-neutral-400">Total</p>
            </div>
            <div className="px-2">
              <p className="text-lg font-bold text-emerald-700">{activeCount}</p>
              <p className="text-[11px] font-semibold uppercase text-neutral-400">Active</p>
            </div>
            <div className="px-2">
              <p className="text-lg font-bold text-neutral-500">{inactiveCount}</p>
              <p className="text-[11px] font-semibold uppercase text-neutral-400">Inactive</p>
            </div>
          </div>
        </div>

        {/* Global error */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="grid gap-3 xl:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse rounded-3xl border border-purple-100 bg-white p-5 shadow-sm">
                <div className="mb-4 h-4 w-36 rounded-full bg-purple-100" />
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <div className="h-10 rounded-2xl bg-neutral-100" />
                  <div className="h-10 rounded-2xl bg-neutral-100" />
                </div>
                <div className="h-3 w-2/3 rounded-full bg-neutral-100" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && isEmpty && (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-purple-200 bg-white/80 p-8 text-center shadow-sm sm:p-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50 text-purple-700">
              <Scissors className="h-7 w-7" />
            </div>
            <div>
              <p className="text-lg font-bold text-neutral-900">No services yet</p>
              <p className="mt-1 max-w-md text-sm text-neutral-500">
                Add your first service so clients can choose a price, duration, and booking option.
              </p>
            </div>
            <Button
              onClick={onAdd}
              className="rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 px-5 py-2.5 font-semibold text-white shadow-md shadow-purple-200 hover:from-purple-700 hover:to-pink-600"
            >
              <Plus className="mr-2 h-5 w-5" />
              Add your first service
            </Button>
          </div>
        )}

        {/* Add button bar + service list (passed as children) */}
        {!isLoading && !isEmpty && (
          <>
            <div className="flex flex-col gap-3 rounded-3xl border border-white bg-white/80 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-neutral-600">
                Services remain visible here whether active or inactive.
              </p>
              <Button
                onClick={onAdd}
                disabled={isSaving}
                className="w-full rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 px-4 py-2 font-semibold text-white shadow-md shadow-purple-200 hover:from-purple-700 hover:to-pink-600 sm:w-auto"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Service
              </Button>
            </div>
            {children}
          </>
        )}
      </CardContent>
    </Card>
  );
}