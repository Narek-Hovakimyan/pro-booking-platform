import Drawer from "@/shared/components/common/Drawer";
import { Button } from "@/shared/components/ui/button";

export default function LoyaltyDiscountDrawer({
  isOpen,
  onClose,
  loyaltySettingsDraft,
  updateLoyaltySettingsDraft,
  isSavingLoyaltySettings,
  loyaltySettingsError,
  onSave,
}) {
  return (
    <Drawer
      closeLabel="Close loyalty discount settings"
      description="Applies automatically after completed bookings. Does not combine with vouchers."
      footer={
        <>
          <Button onClick={onSave} disabled={isSavingLoyaltySettings}>
            {isSavingLoyaltySettings ? "Saving..." : "Save settings"}
          </Button>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
        </>
      }
      isOpen={isOpen}
      onClose={onClose}
      title="Loyalty discount"
    >
      <div className="space-y-5">
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 p-4 text-sm font-semibold">
          <span>Enable loyalty discount</span>
          <input
            checked={Boolean(loyaltySettingsDraft.enabled)}
            className="h-5 w-5 accent-neutral-950"
            onChange={(event) =>
              updateLoyaltySettingsDraft("enabled", event.target.checked)
            }
            type="checkbox"
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          Completed bookings required
          <input
            className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
            min="1"
            onChange={(event) =>
              updateLoyaltySettingsDraft(
                "thresholdCompletedBookings",
                event.target.value
              )
            }
            type="number"
            value={loyaltySettingsDraft.thresholdCompletedBookings}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            Discount percent
            <input
              className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
              min="0"
              max="100"
              onChange={(event) =>
                updateLoyaltySettingsDraft("discountPercent", event.target.value)
              }
              type="number"
              value={loyaltySettingsDraft.discountPercent}
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            Max discount percent
            <input
              className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 py-2 font-normal outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10"
              min="0"
              max="100"
              onChange={(event) =>
                updateLoyaltySettingsDraft(
                  "maxDiscountPercent",
                  event.target.value
                )
              }
              type="number"
              value={loyaltySettingsDraft.maxDiscountPercent}
            />
          </label>
        </div>

        {loyaltySettingsError && (
          <p
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {loyaltySettingsError}
          </p>
        )}
      </div>
    </Drawer>
  );
}
