import { AlertCircle, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export default function ServiceFormModal({
  showModal,
  editingService,
  isSaving,
  modalError,
  saveDisabled,
  onClose,
  onSave,
  children,
}) {
  if (!showModal) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col animate-in overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-purple-100">
              {editingService ? (
                <Pencil className="h-5 w-5 text-purple-700" />
              ) : (
                <Plus className="h-5 w-5 text-purple-700" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-950">
                {editingService ? "Edit service" : "Add service"}
              </h3>
              <p className="text-xs text-neutral-500 sm:text-sm">
                {editingService
                  ? "Update the service details below"
                  : "Fill in the details for the new service"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl p-2 text-neutral-400 transition-colors hover:bg-white hover:text-neutral-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto bg-neutral-50/60 p-4 sm:p-6">
          {modalError && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}
          <div className="space-y-5">
            {children}
          </div>
        </div>

        {/* Modal footer */}
        <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <Button
            variant="ghost"
            disabled={isSaving}
            onClick={onClose}
            className="w-full rounded-2xl sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            disabled={saveDisabled}
            onClick={onSave}
            className="w-full rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 font-semibold text-white shadow-md shadow-purple-200 hover:from-purple-700 hover:to-pink-600 sm:w-auto"
          >
            {isSaving
              ? "Saving..."
              : editingService
                ? "Save service"
                : "Add service"}
          </Button>
        </div>
      </div>
    </div>
  );
}
