import { X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export default function CertificateIssueModal({
  isOpen,
  onClose,
  certificateMode,
  setCertificateMode,
  certificateFile,
  onFileChange,
  onSubmit,
  isSubmitting,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">Issue Certificate</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Choose how to issue this certificate.
            </p>
          </div>
          <button
            className="rounded-full p-1 hover:bg-neutral-100"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3 cursor-pointer hover:bg-neutral-50">
            <input
              type="radio"
              name="certificateMode"
              className="h-4 w-4"
              checked={certificateMode === "auto"}
              onChange={() => setCertificateMode("auto")}
            />
            <div>
              <p className="text-sm font-medium text-neutral-900">Auto-generated certificate</p>
              <p className="text-xs text-neutral-500">System creates a beautiful certificate layout</p>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-neutral-200 p-3 cursor-pointer hover:bg-neutral-50">
            <input
              type="radio"
              name="certificateMode"
              className="mt-1 h-4 w-4"
              checked={certificateMode === "uploaded"}
              onChange={() => setCertificateMode("uploaded")}
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-neutral-900">Upload custom certificate</p>
              <p className="text-xs text-neutral-500">PDF, JPEG, PNG, or WEBP (max 10MB)</p>
            </div>
          </label>

          {certificateMode === "uploaded" && (
            <div className="rounded-xl border border-neutral-200 p-3">
              <input
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                className="w-full text-sm"
                onChange={onFileChange}
              />
              {certificateFile && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
                  <span className="font-medium truncate max-w-[200px]">{certificateFile.name}</span>
                  <span className="text-neutral-400">({(certificateFile.size / 1024 / 1024).toFixed(1)}MB)</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            className="flex-1"
            disabled={
              isSubmitting ||
              (certificateMode === "uploaded" && !certificateFile)
            }
            onClick={onSubmit}
          >
            {isSubmitting
              ? "Issuing..."
              : "Issue Certificate"}
          </Button>
          <Button
            className="flex-1"
            onClick={onClose}
            variant="outline"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
