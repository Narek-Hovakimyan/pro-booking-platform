import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/shared/components/ui/button";

export default function RejectRegistrationModal({
  isOpen,
  registrationToReject,
  rejectionReason,
  setRejectionReason,
  isUpdatingRegistration,
  onClose,
  onSubmit,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (isOpen) dialogRef.current?.querySelector("textarea:not([disabled])")?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isUpdatingRegistration) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isUpdatingRegistration, onClose]);

  if (!isOpen || !registrationToReject) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-registration-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="reject-registration-title" className="text-xl font-bold">Reject Registration</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Share an optional reason with {registrationToReject?.userName || "this user"}.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close reject registration dialog"
            className="rounded-full p-1 hover:bg-neutral-100"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <textarea
          id="rejection-reason"
          aria-label="Reason for rejection"
          className="mt-4 min-h-28 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
          placeholder="Reason for rejection"
          value={rejectionReason}
          onChange={(event) => setRejectionReason(event.target.value)}
        />

        <div className="mt-4 flex gap-2">
          <Button
            className="flex-1"
            disabled={isUpdatingRegistration}
            onClick={onSubmit}
          >
            {isUpdatingRegistration ? "Rejecting..." : "Confirm Reject"}
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
