import { useEffect, useLayoutEffect, useRef } from "react";

import { AlertCircle, Save, X } from "lucide-react";

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

export default function PromotionFormModal({
  dialogRef,
  editingPromotion,
  form,
  handleField,
  handleSave,
  handleToggleBarber,
  handleToggleService,
  modalError,
  modalId,
  onClose,
  saving,
  showModal,
  triggerRef,
  uniqueBarbers,
  uniqueServices,
}) {
  const isModalOpenRef = useRef(false);
  const latestSavingRef = useRef(saving);

  useEffect(() => {
    latestSavingRef.current = saving;
  }, [saving]);

  useLayoutEffect(() => {
    if (showModal && !isModalOpenRef.current) {
      isModalOpenRef.current = true;
      focusFirstModalControl(dialogRef);
      return;
    }

    if (!showModal && isModalOpenRef.current) {
      isModalOpenRef.current = false;
      if (canRestoreFocus(triggerRef.current)) {
        triggerRef.current.focus();
      }
      triggerRef.current = null;
    }
  }, [dialogRef, showModal, triggerRef]);

  useEffect(() => {
    if (!showModal) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !latestSavingRef.current) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, showModal]);

  useEffect(
    () => () => {
      if (isModalOpenRef.current && canRestoreFocus(triggerRef.current)) {
        triggerRef.current.focus();
      }
    },
    [triggerRef]
  );

  if (!showModal) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${modalId}-title`}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id={`${modalId}-title`} className="text-lg font-bold text-neutral-900">
            {editingPromotion ? "Edit Promotion" : "Create Promotion"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={editingPromotion ? "Close edit promotion dialog" : "Close create promotion dialog"}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {modalError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {modalError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label
              htmlFor={`${modalId}-title-input`}
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600"
            >
              Title
            </label>
            <input
              id={`${modalId}-title-input`}
              type="text"
              value={form.title}
              onChange={(event) => handleField("title", event.target.value)}
              className="w-full rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
              placeholder="e.g. Summer Special"
            />
          </div>

          <div>
            <label
              htmlFor={`${modalId}-description`}
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600"
            >
              Description (optional)
            </label>
            <textarea
              id={`${modalId}-description`}
              value={form.description}
              onChange={(event) => handleField("description", event.target.value)}
              className="w-full rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
              placeholder="Brief description"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor={`${modalId}-discount-type`}
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600"
              >
                Discount Type
              </label>
              <select
                id={`${modalId}-discount-type`}
                value={form.discountType}
                onChange={(event) => handleField("discountType", event.target.value)}
                className="w-full rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
              >
                <option value="fixed">Fixed Amount (դր)</option>
                <option value="percentage">Percentage (%)</option>
              </select>
            </div>
            <div>
              <label
                htmlFor={`${modalId}-discount-value`}
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600"
              >
                {form.discountType === "percentage" ? "Percentage" : "Amount (դր)"}
              </label>
              <input
                id={`${modalId}-discount-value`}
                type="number"
                value={form.discountValue}
                onChange={(event) => handleField("discountValue", event.target.value)}
                min="1"
                max={form.discountType === "percentage" ? "100" : undefined}
                className="w-full rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
                placeholder={form.discountType === "percentage" ? "e.g. 20" : "e.g. 5000"}
              />
            </div>
          </div>

          {!editingPromotion && (
            <div>
              <label
                htmlFor={`${modalId}-code`}
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600"
              >
                Code (leave empty to auto-generate)
              </label>
              <input
                id={`${modalId}-code`}
                type="text"
                value={form.code}
                onChange={(event) => handleField("code", event.target.value.toUpperCase())}
                className="w-full rounded-xl border border-neutral-200 p-3 text-sm font-mono transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
                placeholder="SUMMER20"
                maxLength={20}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor={`${modalId}-start-date`}
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600"
              >
                Start Date
              </label>
              <input
                id={`${modalId}-start-date`}
                type="date"
                value={form.startDate}
                onChange={(event) => handleField("startDate", event.target.value)}
                className="w-full rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
              />
            </div>
            <div>
              <label
                htmlFor={`${modalId}-end-date`}
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600"
              >
                End Date
              </label>
              <input
                id={`${modalId}-end-date`}
                type="date"
                value={form.endDate}
                onChange={(event) => handleField("endDate", event.target.value)}
                className="w-full rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={`${modalId}-max-uses`}
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600"
            >
              Max Uses
            </label>
            <input
              id={`${modalId}-max-uses`}
              type="number"
              value={form.maxUses}
              onChange={(event) => handleField("maxUses", event.target.value)}
              min="1"
              className="w-full rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
              Applicable Services (optional — leave empty for all)
            </label>
            <div className="max-h-32 overflow-y-auto rounded-xl border border-neutral-200 p-2">
              {uniqueServices.length === 0 && (
                <p className="p-2 text-xs text-neutral-400">No services loaded</p>
              )}
              {uniqueServices.map((service) => {
                const strId = String(service._id || service.id || service);
                const name = service.name || service.title || strId;
                const isSelected = (form.applicableServiceIds || []).some(
                  (id) => String(id) === strId
                );

                return (
                  <label
                    key={strId}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleService(strId)}
                      className="rounded border-neutral-300"
                    />
                    {name}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
              Applicable Barbers (optional — leave empty for all)
            </label>
            <div className="max-h-32 overflow-y-auto rounded-xl border border-neutral-200 p-2">
              {uniqueBarbers.length === 0 && (
                <p className="p-2 text-xs text-neutral-400">No barbers loaded</p>
              )}
              {uniqueBarbers.map((barber) => {
                const strId = String(barber._id || barber.id || barber);
                const name = barber.name || barber.barberName || strId;
                const isSelected = (form.applicableBarberIds || []).some(
                  (id) => String(id) === strId
                );

                return (
                  <label
                    key={strId}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleBarber(strId)}
                      className="rounded border-neutral-300"
                    />
                    {name}
                  </label>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : editingPromotion ? "Update Promotion" : "Create Promotion"}
          </button>
        </div>
      </div>
    </div>
  );
}
