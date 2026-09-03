import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/shared/components/ui/button";
import { formatTimeInput } from "@/shared/utils/time";
import api from "@/shared/api/axios";

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

export default function WaitlistForm({
  barberId,
  salonId,
  serviceId,
  date,
  onClose,
  onSuccess,
}) {
  const contextKey = JSON.stringify([barberId, salonId, serviceId, date]);
  const [preferredStartTime, setPreferredStartTime] = useState("");
  const [preferredEndTime, setPreferredEndTime] = useState("");
  const [note, setNote] = useState("");
  const [submittingContextKey, setSubmittingContextKey] = useState(null);
  const [errorState, setErrorState] = useState({ contextKey: null, message: "" });
  const titleId = useId();
  const dialogRef = useRef(null);
  const lifecycleRef = useRef({ initialized: false, mounted: false, trigger: null });
  const latestOnCloseRef = useRef(onClose);
  const latestOnSuccessRef = useRef(onSuccess);
  const isSubmittingRef = useRef(false);
  const contextRef = useRef(contextKey);
  const requestRef = useRef({ id: 0, contextKey: null });
  const isSubmitting = submittingContextKey === contextKey;
  const error =
    errorState.contextKey === contextKey ? errorState.message : "";

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
      requestRef.current = { id: requestRef.current.id + 1, contextKey: null };
      isSubmittingRef.current = false;
      queueMicrotask(() => {
        if (lifecycle.mounted || document.activeElement?.closest('[role="dialog"]')) {
          return;
        }
        if (canRestoreFocus(lifecycle.trigger)) lifecycle.trigger.focus();
        lifecycle.trigger = null;
      });
    };
  }, []);

  useLayoutEffect(() => {
    latestOnCloseRef.current = onClose;
    latestOnSuccessRef.current = onSuccess;

    if (contextRef.current !== contextKey) {
      contextRef.current = contextKey;
      requestRef.current = { id: requestRef.current.id + 1, contextKey: null };
      isSubmittingRef.current = false;
    }
  }, [contextKey, onClose, onSuccess]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isSubmittingRef.current) {
        latestOnCloseRef.current?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;

    const request = {
      id: requestRef.current.id + 1,
      contextKey,
    };
    requestRef.current = request;
    isSubmittingRef.current = true;
    setSubmittingContextKey(contextKey);
    setErrorState({ contextKey, message: "" });

    const ownsRequest = () =>
      lifecycleRef.current.mounted &&
      isSubmittingRef.current &&
      requestRef.current.id === request.id &&
      requestRef.current.contextKey === request.contextKey &&
      contextRef.current === request.contextKey;

    try {
      const payload = {
        barberId,
        serviceId,
        date,
      };

      if (salonId) payload.salonId = salonId;
      if (preferredStartTime) payload.preferredStartTime = preferredStartTime;
      if (preferredEndTime) payload.preferredEndTime = preferredEndTime;
      if (note.trim()) payload.note = note.trim();

      await api.post("/waitlist", payload);

      if (ownsRequest()) latestOnSuccessRef.current?.();
    } catch (requestError) {
      if (!ownsRequest()) return;
      const message =
        requestError.response?.data?.message ||
        "Could not join waitlist. Please try again.";

      setErrorState({ contextKey: request.contextKey, message });
    } finally {
      if (ownsRequest()) {
        isSubmittingRef.current = false;
        requestRef.current = { id: request.id, contextKey: null };
        setSubmittingContextKey(null);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4"
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
        className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl sm:rounded-3xl sm:p-6"
        role="dialog"
      >
        <div className="mb-4">
          <h3 className="text-lg font-bold sm:text-xl" id={titleId}>
            Notify me when a time opens
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            We'll notify you if a slot may open.
          </p>
        </div>

        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Joining the waitlist does not reserve a time.
        </p>

        {error && (
          <p
            aria-atomic="true"
            aria-live="assertive"
            className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold">
              Preferred start time (optional)
              <input
                className="rounded-xl border p-2.5 font-normal font-mono tabular-nums"
                inputMode="numeric"
                pattern="[0-9]{2}:[0-9]{2}"
                placeholder="HH:mm"
                value={preferredStartTime}
                onChange={(event) =>
                  setPreferredStartTime(
                    formatTimeInput(event.target.value, preferredStartTime)
                  )
                }
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold">
              Preferred end time (optional)
              <input
                className="rounded-xl border p-2.5 font-normal font-mono tabular-nums"
                inputMode="numeric"
                pattern="[0-9]{2}:[0-9]{2}"
                placeholder="HH:mm"
                value={preferredEndTime}
                onChange={(event) =>
                  setPreferredEndTime(
                    formatTimeInput(event.target.value, preferredEndTime)
                  )
                }
              />
            </label>
          </div>

          <label className="grid gap-1.5 text-sm font-semibold">
            Note (optional)
            <textarea
              className="rounded-xl border p-2.5 font-normal"
              maxLength={500}
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Any preferences or info..."
            />
          </label>

          <div className="grid gap-2 sm:flex sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              disabled={isSubmitting}
              onClick={() => {
                if (!isSubmittingRef.current) latestOnCloseRef.current?.();
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Saving..." : "Notify me when a time opens"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
