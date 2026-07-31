import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

const delayOptions = [10, 20];
const FIELD_SELECTOR =
  "input:not([disabled]), select:not([disabled]), textarea:not([disabled])";
const FALLBACK_SELECTOR = "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

function focusFirstControl(dialogRef) {
  const firstControl =
    dialogRef.current?.querySelector(FIELD_SELECTOR) ||
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

export default function DelayBookingModal({
  booking,
  error = "",
  isSubmitting = false,
  onClose,
  onSubmit,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const lifecycleRef = useRef({ initialized: false, mounted: false, trigger: null });
  const latestOnCloseRef = useRef(onClose);
  const isSubmittingRef = useRef(isSubmitting);

  useEffect(() => {
    latestOnCloseRef.current = onClose;
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting, onClose]);

  useLayoutEffect(() => {
    const lifecycle = lifecycleRef.current;
    lifecycle.mounted = true;

    if (!lifecycle.initialized) {
      lifecycle.initialized = true;
      lifecycle.trigger =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      focusFirstControl(dialogRef);
    }

    return () => {
      lifecycle.mounted = false;
      queueMicrotask(() => {
        if (lifecycle.mounted || document.activeElement?.closest('[role="dialog"]')) {
          return;
        }
        if (canRestoreFocus(lifecycle.trigger)) lifecycle.trigger.focus();
        lifecycle.trigger = null;
      });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isSubmittingRef.current) {
        latestOnCloseRef.current?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmittingRef.current) {
          latestOnCloseRef.current?.();
        }
      }}
    >
      <div
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-md space-y-5 overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:max-h-[90vh] sm:rounded-3xl sm:p-6"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl" id={titleId}>
              Running late?
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {booking?.serviceName || "Service"} · {booking?.bookingDate || "No date"} {booking?.time || ""}
            </p>
          </div>

          <Button
            aria-label="Close delay booking modal"
            disabled={isSubmitting}
            onClick={() => {
              if (!isSubmittingRef.current) latestOnCloseRef.current?.();
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm text-neutral-600">
          You can delay this booking if the next time is available.
        </p>

        {error && (
          <p
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="grid gap-2">
          {delayOptions.map((delayMinutes) => (
            <Button
              disabled={isSubmitting}
              key={delayMinutes}
              onClick={() => onSubmit?.({ delayMinutes })}
              type="button"
            >
              {isSubmitting ? "Checking..." : `Delay ${delayMinutes} minutes`}
            </Button>
          ))}
        </div>

        <Button
          className="w-full"
          disabled={isSubmitting}
          onClick={() => {
            if (!isSubmittingRef.current) latestOnCloseRef.current?.();
          }}
          type="button"
          variant="outline"
        >
          Keep current time
        </Button>
      </div>
    </div>
  );
}
