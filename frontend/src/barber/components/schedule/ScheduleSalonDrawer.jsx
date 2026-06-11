import { useEffect } from "react";
import EmptyState from "@/shared/components/common/EmptyState";
import { cn } from "@/shared/lib/utils";
import {
  getSalonAddressFromEntry,
  getSalonIdFromEntry,
  getSalonNameFromEntry,
} from "@/barber/utils/scheduleHelpers";

export default function ScheduleSalonDrawer({
  isOpen,
  onClose,
  salons,
  selectedId,
  onSelect,
  isLoading,
}) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSelect = (salonId) => {
    onSelect(salonId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <div
        className="fixed left-0 top-0 z-50 flex h-full w-full flex-col bg-white shadow-xl sm:w-[380px]"
        role="dialog"
        aria-modal="true"
        aria-label="Select salon schedule"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <h2 className="text-lg font-bold">Select salon schedule</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Close drawer"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
              ))}
            </div>
          ) : salons.length === 0 ? (
            <EmptyState
              title="No salons available"
              description="No salons available for schedule management."
            />
          ) : (
            <div className="space-y-2">
              {salons.map((salon) => {
                const salonId = getSalonIdFromEntry(salon);
                const isSelected = String(salonId) === String(selectedId);
                const displayName = getSalonNameFromEntry(salon);
                const displayAddress = getSalonAddressFromEntry(salon);
                const roleLabel = salon._role || salon.role || salon.status || "";

                return (
                  <button
                    key={salonId}
                    onClick={() => handleSelect(salonId)}
                    className={cn(
                      "w-full rounded-2xl border border-neutral-200 p-4 text-left transition",
                      "hover:border-neutral-300 hover:shadow-sm",
                      "focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:ring-offset-2",
                      isSelected && "border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900"
                    )}
                    aria-label={`Select ${displayName}${displayAddress ? `, ${displayAddress}` : ""}`}
                    aria-current={isSelected ? "true" : undefined}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-neutral-900">
                          {displayName}
                        </p>
                        {displayAddress && (
                          <p className="mt-0.5 truncate text-xs text-neutral-400">
                            {displayAddress}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {roleLabel && (
                          <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                            {roleLabel}
                          </span>
                        )}
                        {isSelected && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-xs text-white">
                            ✓
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
