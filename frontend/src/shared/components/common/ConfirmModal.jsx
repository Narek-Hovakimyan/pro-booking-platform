import { X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

export default function ConfirmModal({
  cancelLabel = "Cancel",
  children,
  confirmLabel = "Confirm",
  error = "",
  isSubmitting = false,
  message = "",
  onClose,
  onConfirm,
  title,
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
            {message && <p className="mt-2 text-sm text-neutral-600">{message}</p>}
          </div>
          <Button
            aria-label="Close confirmation modal"
            disabled={isSubmitting}
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {children}

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="grid gap-2 sm:flex sm:justify-end">
          <Button
            className="w-full sm:w-auto"
            disabled={isSubmitting}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            {cancelLabel}
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={isSubmitting}
            onClick={onConfirm}
            type="button"
          >
            {isSubmitting ? "Saving..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
