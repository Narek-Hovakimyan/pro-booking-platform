import { X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export default function CertificateRevokeModal({
  isOpen,
  onClose,
  revokeReason,
  setRevokeReason,
  onSubmit,
  isSubmitting,
  certificateId,
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
            <h2 className="text-xl font-bold">Revoke Certificate</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Add an optional reason for {certificateId}.
            </p>
          </div>
          <button
            className="rounded-full p-1 hover:bg-neutral-100"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <textarea
          className="mt-4 min-h-28 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
          placeholder="Reason for revocation"
          value={revokeReason}
          onChange={(event) => setRevokeReason(event.target.value)}
        />

        <div className="mt-4 flex gap-2">
          <Button
            className="flex-1"
            disabled={isSubmitting}
            onClick={onSubmit}
          >
            {isSubmitting ? "Revoking..." : "Confirm Revoke"}
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
