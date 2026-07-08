import { useState } from "react";
import { XCircle } from "lucide-react";
import { Button } from "../../../shared/components/ui/button";

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
}) {
  const [note, setNote] = useState("");

  const handleConfirm = () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:rounded-3xl sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
            {warning && (
              <p className="mt-2 text-sm text-neutral-600">{warning}</p>
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
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* Buttons */}
        <div className="grid gap-2 sm:flex sm:justify-end">
          <Button
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
