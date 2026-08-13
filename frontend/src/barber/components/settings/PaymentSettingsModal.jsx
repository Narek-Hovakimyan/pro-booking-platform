import { useEffect, useId, useLayoutEffect, useRef } from "react";

import { Button } from "@/shared/components/ui/button";

const paymentTypeOptions = [
  { value: "none", label: "Not configured" },
  { value: "commission", label: "Commission split" },
  { value: "fixed", label: "Fixed pay" },
];

const fixedPeriodOptions = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const commissionPresets = [
  { label: "50/50", staff: 50, salon: 50 },
  { label: "60/40", staff: 60, salon: 40 },
  { label: "70/30", staff: 70, salon: 30 },
];

function focusFirstModalControl(dialogRef) {
  const firstField =
    dialogRef.current?.querySelector(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
    ) || dialogRef.current?.querySelector("button:not([disabled])");
  firstField?.focus();
}

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

export default function PaymentSettingsModal({
  draft,
  error,
  isSaving,
  staffName,
  onChange,
  onClose,
  onSave,
}) {
  const modalId = useId();
  const titleId = `${modalId}-title`;
  const typeId = `${modalId}-payment-type`;
  const staffPercentId = `${modalId}-staff-percent`;
  const salonPercentId = `${modalId}-salon-percent`;
  const amountId = `${modalId}-amount`;
  const periodId = `${modalId}-period`;
  const notesId = `${modalId}-notes`;
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const latestOnCloseRef = useRef(onClose);
  const isSavingRef = useRef(isSaving);
  const commissionTotal =
    Number(draft.commissionStaffPercent || 0) +
    Number(draft.commissionSalonPercent || 0);
  const hasCommissionError =
    draft.type === "commission" && commissionTotal !== 100;
  const hasFixedError =
    draft.type === "fixed" &&
    (!Number(draft.fixedAmount) || Number(draft.fixedAmount) <= 0);

  useEffect(() => {
    latestOnCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  useLayoutEffect(() => {
    triggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    focusFirstModalControl(dialogRef);

    return () => {
      if (canRestoreFocus(triggerRef.current)) {
        triggerRef.current.focus();
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isSavingRef.current) {
        latestOnCloseRef.current?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center"
      onClick={(event) => {
        if (!isSavingRef.current && event.target === event.currentTarget) {
          latestOnCloseRef.current?.();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id={titleId} className="text-base font-semibold text-neutral-950">
              Pay terms
            </h3>
            <p className="mt-0.5 text-sm text-neutral-500">{staffName}</p>
          </div>
          <Button
            disabled={isSaving}
            onClick={() => latestOnCloseRef.current?.()}
            size="sm"
            variant="outline"
          >
            Close
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="grid gap-1 text-sm font-semibold text-neutral-800">
            Payment type
            <select
              id={typeId}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 font-normal"
              disabled={isSaving}
              value={draft.type}
              onChange={(event) => onChange("type", event.target.value)}
            >
              {paymentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {draft.type === "commission" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {commissionPresets.map((preset) => (
                  <Button
                    disabled={isSaving}
                    key={preset.label}
                    onClick={() => {
                      onChange("commissionStaffPercent", preset.staff);
                      onChange("commissionSalonPercent", preset.salon);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold text-neutral-800">
                  Staff %
                  <input
                    id={staffPercentId}
                    className="rounded-xl border border-neutral-200 px-3 py-2 font-normal"
                    disabled={isSaving}
                    min="0"
                    max="100"
                    type="number"
                    value={draft.commissionStaffPercent}
                    onChange={(event) =>
                      onChange("commissionStaffPercent", event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-neutral-800">
                  Salon %
                  <input
                    id={salonPercentId}
                    className="rounded-xl border border-neutral-200 px-3 py-2 font-normal"
                    disabled={isSaving}
                    min="0"
                    max="100"
                    type="number"
                    value={draft.commissionSalonPercent}
                    onChange={(event) =>
                      onChange("commissionSalonPercent", event.target.value)
                    }
                  />
                </label>
              </div>
              {hasCommissionError && (
                <p className="text-xs font-medium text-red-600">
                  Commission split must add up to 100.
                </p>
              )}
            </div>
          )}

          {draft.type === "fixed" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-neutral-800">
                Amount
                <input
                  id={amountId}
                  className="rounded-xl border border-neutral-200 px-3 py-2 font-normal"
                  disabled={isSaving}
                  min="0"
                  type="number"
                  value={draft.fixedAmount}
                  onChange={(event) => onChange("fixedAmount", event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-neutral-800">
                Period
                <select
                  id={periodId}
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-2 font-normal"
                  disabled={isSaving}
                  value={draft.fixedPeriod}
                  onChange={(event) => onChange("fixedPeriod", event.target.value)}
                >
                  {fixedPeriodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {hasFixedError && (
                <p className="text-xs font-medium text-red-600 sm:col-span-2">
                  Fixed pay requires an amount greater than 0.
                </p>
              )}
            </div>
          )}

          <label className="grid gap-1 text-sm font-semibold text-neutral-800">
            Notes
            <textarea
              id={notesId}
              className="min-h-20 rounded-xl border border-neutral-200 px-3 py-2 font-normal"
              disabled={isSaving}
              maxLength={500}
              value={draft.notes}
              onChange={(event) => onChange("notes", event.target.value)}
            />
          </label>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              disabled={isSaving}
              onClick={() => latestOnCloseRef.current?.()}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isSaving || hasCommissionError || hasFixedError}
              onClick={onSave}
              type="button"
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
