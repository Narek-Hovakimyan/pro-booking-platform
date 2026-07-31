import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

const maxReasonLength = 300;

function canRestoreFocus(element) {
  if (!(element instanceof HTMLElement) || !element.isConnected) {
    return false;
  }

  if (element.matches(":disabled")) {
    return false;
  }

  if (element.closest("[hidden], [aria-hidden='true']")) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export default function RejectBookingModal({
  booking,
  error = "",
  isSubmitting = false,
  onClose,
  onSubmit,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const latestOnCloseRef = useRef(onClose);
  const isSubmittingRef = useRef(isSubmitting);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const trimmedReason = reason.trim();
  const showRequiredError = touched && !trimmedReason;

  useEffect(() => {
    latestOnCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  useLayoutEffect(() => {
    triggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.querySelector("textarea:not([disabled])")?.focus();

    return () => {
      queueMicrotask(() => {
        if (canRestoreFocus(triggerRef.current)) {
          triggerRef.current.focus();
        }
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
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const submitRejection = (event) => {
    event.preventDefault();
    setTouched(true);

    if (!trimmedReason || isSubmitting) return;

    onSubmit({ rejectionReason: trimmedReason });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(event) => {
        if (!isSubmittingRef.current && event.target === event.currentTarget) {
          latestOnCloseRef.current?.();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92vh] w-full max-w-lg space-y-5 overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:max-h-[90vh] sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-xl font-bold sm:text-2xl">
              Reject booking
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {booking?.clientName || "Client"} · {booking?.bookingDate || "No date"} {booking?.time || ""}
            </p>
          </div>

          <Button
            aria-label="Close reject booking modal"
            disabled={isSubmitting}
            onClick={() => latestOnCloseRef.current?.()}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form className="space-y-4" onSubmit={submitRejection}>
          <label className="grid gap-2 text-sm font-semibold">
            Reason for rejection
            <textarea
              className="min-h-28 w-full rounded-2xl border bg-white p-3 font-normal"
              disabled={isSubmitting}
              maxLength={maxReasonLength}
              placeholder="Explain why you are rejecting this booking..."
              value={reason}
              onBlur={() => setTouched(true)}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>

          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-red-600">
              {showRequiredError ? "Please provide a rejection reason" : ""}
            </span>
            <span className="text-neutral-500">
              {reason.length}/{maxReasonLength}
            </span>
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="grid gap-2 sm:flex sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              disabled={isSubmitting}
              onClick={() => latestOnCloseRef.current?.()}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={isSubmitting || !trimmedReason}
              type="submit"
            >
              {isSubmitting ? "Rejecting..." : "Confirm reject"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
