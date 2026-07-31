import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

export default function ManualBookingModal({
  manualBooking,
  activeServices,
  error = "",
  isAddingBooking,
  onClose,
  onSubmit,
  onUpdateManualBooking,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const lifecycleRef = useRef({ initialized: false, mounted: false, trigger: null });
  const latestOnCloseRef = useRef(onClose);
  const isAddingBookingRef = useRef(isAddingBooking);
  const errorMessage = error || manualBooking?.error || manualBooking?.errorMessage || "";

  useEffect(() => {
    latestOnCloseRef.current = onClose;
    isAddingBookingRef.current = isAddingBooking;
  }, [isAddingBooking, onClose]);

  useLayoutEffect(() => {
    const lifecycle = lifecycleRef.current;
    lifecycle.mounted = true;

    if (!lifecycle.initialized) {
      lifecycle.initialized = true;
      lifecycle.trigger =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialogRef.current?.querySelector("input:not([disabled])")?.focus();
    }

    return () => {
      lifecycle.mounted = false;
      queueMicrotask(() => {
        if (lifecycle.mounted || document.activeElement?.closest('[role="dialog"]')) {
          return;
        }
        const trigger = lifecycle.trigger;
        if (
          trigger instanceof HTMLElement &&
          trigger.isConnected &&
          !trigger.matches(":disabled") &&
          !trigger.closest("[hidden], [aria-hidden='true']")
        ) {
          const style = window.getComputedStyle(trigger);
          if (style.display !== "none" && style.visibility !== "hidden") {
            trigger.focus();
          }
        }
        lifecycle.trigger = null;
      });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isAddingBookingRef.current) {
        latestOnCloseRef.current?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isAddingBookingRef.current) {
          latestOnCloseRef.current?.();
        }
      }}
    >
      <div
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:p-6"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold" id={titleId}>Add Booking</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Create a walk-in or phone booking.
            </p>
          </div>
          <Button
            aria-label="Close"
            disabled={isAddingBooking}
            onClick={() => {
              if (!isAddingBookingRef.current) latestOnCloseRef.current?.();
            }}
            size="icon"
            variant="outline"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <label className="grid gap-2 text-sm font-semibold">
            Client name
            <input
              className="rounded-2xl border p-3 font-normal"
              disabled={isAddingBooking}
              required
              value={manualBooking.clientName}
              onChange={(event) =>
                onUpdateManualBooking("clientName", event.target.value)
              }
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            Client phone
            <input
              className="rounded-2xl border p-3 font-normal"
              disabled={isAddingBooking}
              value={manualBooking.clientPhone}
              onChange={(event) =>
                onUpdateManualBooking("clientPhone", event.target.value)
              }
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            Service
            <select
              className="rounded-2xl border bg-white p-3 font-normal"
              disabled={isAddingBooking}
              required
              value={manualBooking.serviceId}
              onChange={(event) =>
                onUpdateManualBooking("serviceId", event.target.value)
              }
            >
              <option value="">Select service</option>
              {activeServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {service.duration} min
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">
              Date
              <input
                className="rounded-2xl border p-3 font-normal"
                disabled={isAddingBooking}
                required
                type="date"
                value={manualBooking.bookingDate}
                onChange={(event) =>
                  onUpdateManualBooking("bookingDate", event.target.value)
                }
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold">
              Time
              <input
                className="rounded-2xl border p-3 font-normal"
                disabled={isAddingBooking}
                required
                type="time"
                value={manualBooking.time}
                onChange={(event) =>
                  onUpdateManualBooking("time", event.target.value)
                }
              />
            </label>
          </div>

          {errorMessage && (
            <p
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {errorMessage}
            </p>
          )}

          <div className="grid gap-2 sm:flex sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              disabled={isAddingBooking}
              onClick={() => {
                if (!isAddingBookingRef.current) latestOnCloseRef.current?.();
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" disabled={isAddingBooking} type="submit">
              {isAddingBooking ? "Adding..." : "Add Booking"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
