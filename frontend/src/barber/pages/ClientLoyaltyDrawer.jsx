import { Star } from "lucide-react";

import Drawer from "@/shared/components/common/Drawer";
import { Button } from "@/shared/components/ui/button";

export default function ClientLoyaltyDrawer({
  selectedClient,
  loyaltyDraft,
  setLoyaltyDraft,
  isSavingLoyalty,
  loyaltyError,
  onSave,
  onClose,
}) {
  return (
    <Drawer
      closeLabel="Close client details"
      description={
        selectedClient ? "Private loyalty details for your admin view only." : ""
      }
      footer={
        <>
          <Button onClick={onSave} disabled={isSavingLoyalty}>
            {isSavingLoyalty ? "Saving..." : "Save loyalty"}
          </Button>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </>
      }
      isOpen={Boolean(selectedClient)}
      onClose={onClose}
      title={selectedClient?.clientName || "Client details"}
    >
      {selectedClient && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-neutral-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-950">
                  {selectedClient.clientName || "Client"}
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  {selectedClient.phone || "No phone on booking"}
                </p>
              </div>
              {selectedClient.loyalty?.isVip && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  VIP
                </span>
              )}
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 p-4 text-sm font-semibold">
            <span>VIP client</span>
            <input
              checked={loyaltyDraft.isVip}
              className="h-5 w-5 accent-neutral-950"
              onChange={(event) =>
                setLoyaltyDraft((current) => ({
                  ...current,
                  isVip: event.target.checked,
                }))
              }
              type="checkbox"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            Internal note
            <textarea
              className="min-h-32 w-full rounded-2xl border border-neutral-200 p-3 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
              maxLength={1000}
              onChange={(event) =>
                setLoyaltyDraft((current) => ({
                  ...current,
                  internalNote: event.target.value,
                }))
              }
              placeholder="No internal note yet"
              value={loyaltyDraft.internalNote}
            />
          </label>

          {!loyaltyDraft.internalNote.trim() && (
            <p className="rounded-2xl bg-neutral-50 p-3 text-sm text-neutral-500">
              No internal note yet.
            </p>
          )}

          {loyaltyError && (
            <p
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {loyaltyError}
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}
