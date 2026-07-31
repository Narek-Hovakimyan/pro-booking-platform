import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";

const SALON_OPTION_SELECTOR = "[data-salon-option]:not([disabled])";
const FALLBACK_SELECTOR = "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

function focusFirstControl(dialogRef) {
  const firstControl =
    dialogRef.current?.querySelector(SALON_OPTION_SELECTOR) ||
    dialogRef.current?.querySelector(FALLBACK_SELECTOR);
  firstControl?.focus();
}

function canRestoreFocus(element) {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  if (element.matches(":disabled")) return false;
  if (element.closest("[hidden], [aria-hidden='true']")) return false;

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export default function SalonListModal({
  salons = [],
  barberName = "",
  isOpen = false,
  onClose = () => {},
  onSelectSalon = () => {},
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const lifecycleRef = useRef({ mounted: false, open: false, trigger: null });
  const isOpenRef = useRef(isOpen);
  const latestOnCloseRef = useRef(onClose);

  useEffect(() => {
    isOpenRef.current = isOpen;
    latestOnCloseRef.current = onClose;
  }, [isOpen, onClose]);

  useLayoutEffect(() => {
    const lifecycle = lifecycleRef.current;
    lifecycle.mounted = true;

    return () => {
      lifecycle.mounted = false;
      if (!lifecycle.open) return;

      queueMicrotask(() => {
        if (lifecycle.mounted || isOpenRef.current || document.activeElement?.closest('[role="dialog"]')) {
          return;
        }
        if (canRestoreFocus(lifecycle.trigger)) lifecycle.trigger.focus();
        lifecycle.open = false;
        lifecycle.trigger = null;
      });
    };
  }, []);

  useLayoutEffect(() => {
    const lifecycle = lifecycleRef.current;

    if (!isOpen) {
      if (!lifecycle.open) return;

      lifecycle.open = false;
      queueMicrotask(() => {
        if (isOpenRef.current || document.activeElement?.closest('[role="dialog"]')) {
          return;
        }
        if (canRestoreFocus(lifecycle.trigger)) lifecycle.trigger.focus();
        lifecycle.trigger = null;
      });
      return;
    }

    if (lifecycle.open) return;

    lifecycle.open = true;
    lifecycle.trigger =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusFirstControl(dialogRef);
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && isOpenRef.current) {
        latestOnCloseRef.current?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          latestOnCloseRef.current?.();
        }
      }}
    >
      <div
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl"
        role="dialog"
      >
        <button
          aria-label="Close salon list modal"
          className="absolute right-4 top-4 rounded-full p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          onClick={() => latestOnCloseRef.current?.()}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-bold text-neutral-950" id={titleId}>
          {barberName ? `${barberName}'s salons` : "Select salon"}
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          Choose a salon to view details
        </p>

        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {(salons || []).length === 0 ? (
            <p className="py-4 text-center text-sm text-neutral-400">
              No salons available
            </p>
          ) : (
            (salons || []).map((entry) => {
              const salonData = entry?.salon || entry;
              const salonId = salonData?.id || salonData?._id;
              const salonName = salonData?.name || "Salon";
              const isPrimary = entry?.isPrimary;
              const rating = Number(salonData?.averageRating || 0);
              const reviewCount = Number(salonData?.totalReviews ?? salonData?.reviewsCount ?? 0);

              return (
                <button
                  key={salonId}
                  data-salon-option="true"
                  onClick={() => onSelectSalon(salonId)}
                  className="flex w-full items-center gap-3 rounded-xl border border-neutral-100 p-3 text-left transition hover:bg-neutral-50"
                  type="button"
                >
                  {salonData?.image || salonData?.imageUrl ? (
                    <img
                      alt={salonName}
                      className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                      src={salonData.image || salonData.imageUrl}
                    />
                  ) : (
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 font-semibold text-white">
                      {salonName.charAt(0)}
                    </div>
                  )}

                  {/* Salon info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-neutral-900">
                        {salonName}
                      </p>
                      {isPrimary && (
                        <span className="inline-flex flex-shrink-0 items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          Primary
                        </span>
                      )}
                    </div>
                    {salonData?.city && (
                      <p className="truncate text-xs text-neutral-500">
                        {salonData.city}
                        {salonData?.address ? `, ${salonData.address}` : ""}
                      </p>
                    )}
                    <p className="text-xs text-yellow-600">
                      ⭐ {rating > 0 ? rating.toFixed(1) : "New"}
                      {reviewCount > 0 && ` (${reviewCount})`}
                    </p>
                  </div>

                  <span className="flex-shrink-0 text-neutral-400">→</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
