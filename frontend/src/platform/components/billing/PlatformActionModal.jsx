import { useEffect, useId, useRef, useState } from "react";
import { XCircle } from "lucide-react";
import { Button } from "../../../shared/components/ui/button";

const isConnectedFocusableElement = (element) =>
  element instanceof HTMLElement &&
  element !== document.body &&
  element.isConnected &&
  !element.matches(":disabled");

const getFocusableElements = (container) =>
  Array.from(
    container?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) || []
  ).filter(
    (element) =>
      element instanceof HTMLElement &&
      !element.hidden &&
      !element.closest('[aria-hidden="true"]') &&
      element.tabIndex >= 0
  );

export function PlatformActionModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  warning,
  confirmLabel = "Confirm",
  isSubmitting = false,
  error = "",
  children,
  fallbackFocusRef,
}) {
  const [note, setNote] = useState("");
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const openerRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;

    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    cancelButtonRef.current?.focus();

    return () => {
      const opener = openerRef.current;
      const fallback = fallbackFocusRef?.current;
      const focusTarget =
        isConnectedFocusableElement(opener)
          ? opener
          : isConnectedFocusableElement(fallback)
            ? fallback
            : null;

      focusTarget?.focus();
    };
  }, [fallbackFocusRef, isOpen]);

  useEffect(() => {
    if (!isOpen || !isSubmitting) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!getFocusableElements(dialog).includes(document.activeElement)) {
      dialog.focus();
    }
  }, [isOpen, isSubmitting]);

  const handleConfirm = () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!isSubmitting) {
        onClose();
      }
      return;
    }

    if (event.key !== "Tab") return;

    const focusableElements = getFocusableElements(dialogRef.current);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (!firstElement || !lastElement) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    if (document.activeElement === dialogRef.current) {
      event.preventDefault();
      (event.shiftKey ? lastElement : firstElement).focus();
    } else if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        aria-busy={isSubmitting}
        aria-describedby={[warning && descriptionId, error && errorId].filter(Boolean).join(" ") || undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md space-y-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:rounded-3xl sm:p-6"
        onKeyDown={handleKeyDown}
        role="dialog"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-xl font-bold sm:text-2xl">
              {title}
            </h2>
            {warning && (
              <p id={descriptionId} className="mt-2 text-sm text-neutral-600">
                {warning}
              </p>
            )}
          </div>
          <Button
            aria-label="Close modal"
            disabled={isSubmitting}
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XCircle className="h-4 w-4" />
          </Button>
        </div>

        {/* Extra form fields */}
        {children}

        {/* Note field */}
        <div>
          <label
            htmlFor="action-note"
            className="mb-1 block text-xs font-medium text-neutral-700"
          >
            Audit note <span className="text-red-500">*</span>
          </label>
          <textarea
            id="action-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Required reason for this action..."
            rows={3}
            className="w-full resize-none rounded-xl border border-neutral-200 p-3 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
            disabled={isSubmitting}
          />
        </div>

        {/* Error */}
        {error && (
          <p
            id={errorId}
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        {isSubmitting && <span className="sr-only" role="status">Action in progress.</span>}

        {/* Buttons */}
        <div className="grid gap-2 sm:flex sm:justify-end">
          <Button
            ref={cancelButtonRef}
            className="w-full sm:w-auto"
            disabled={isSubmitting}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={isSubmitting || !note.trim()}
            onClick={handleConfirm}
            type="button"
          >
            {isSubmitting ? "Processing..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
