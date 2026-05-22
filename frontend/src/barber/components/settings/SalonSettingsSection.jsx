import SettingsCard from "@/barber/components/settings/SettingsCard";
import { Button } from "@/shared/components/ui/button";

export default function SalonSettingsSection({
  salonError,
  salonSaved,
  allSalonEntries,
  pendingEntries,
  salonStatus,
  currentUserId,
  availableSalons,
  selectedSalonId,
  salonDraft,
  isSalonSaving,
  onCancelSalonRequest,
  onCreateSalon,
  onOpenLeaveConfirmation,
  onRequestSalonJoin,
  onSelectedSalonChange,
  onUpdateSalonDraft,
}) {
  return (
    <SettingsCard
      title="Salon"
      description="Join a salon after owner approval, or create your own."
    >
      {salonError && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {salonError}
        </p>
      )}
      {salonSaved && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {salonSaved}
        </p>
      )}

      {allSalonEntries.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold">Your salons</h4>
          {allSalonEntries.map((entry, index) => {
            const salonData = entry.salon || {};
            const salonId = salonData?.id || salonData?._id || entry.salon;
            const salonName = salonData?.name || "Salon";
            const isPrimary = entry.isPrimary;
            const isOwner =
              String(salonData?.ownerId || "") === String(currentUserId || "");

            return (
              <div
                className="rounded-2xl border border-neutral-200 p-4"
                key={salonId || index}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-neutral-900">
                      {salonName}
                    </div>
                    <div className="mt-1 text-sm text-emerald-600 font-medium">
                      Approved
                    </div>
                    {salonData?.city && (
                      <div className="mt-1 text-sm text-neutral-500">
                        {salonData.city}
                        {salonData?.address ? `, ${salonData.address}` : ""}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {isPrimary && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                        ⭐ Primary
                      </span>
                    )}

                    {!isOwner && (
                      <Button
                        disabled={isSalonSaving}
                        onClick={() =>
                          onOpenLeaveConfirmation(salonName, salonId)
                        }
                        size="sm"
                        variant="outline"
                      >
                        Leave
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendingEntries.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold">Pending requests</h4>
          {pendingEntries.map((entry, index) => {
            const salonData = entry.salon || {};
            const salonId = salonData?.id || salonData?._id || entry.salon;
            const salonName = salonData?.name || "Salon";
            const requestId = entry.requestId;

            return (
              <div
                className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4"
                key={salonId || index}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-neutral-900">
                      {salonName}
                    </div>
                    <div className="mt-1 text-sm text-amber-600 font-medium">
                      Pending approval
                    </div>
                    {salonData?.city && (
                      <div className="mt-1 text-sm text-neutral-500">
                        {salonData.city}
                      </div>
                    )}
                  </div>

                  <Button
                    disabled={isSalonSaving}
                    onClick={() => onCancelSalonRequest(requestId)}
                    size="sm"
                    variant="outline"
                  >
                    Cancel request
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {allSalonEntries.length === 0 &&
        pendingEntries.length === 0 &&
        salonStatus.salonStatus === "pending" && (
          <div className="grid gap-2 sm:flex sm:items-center">
            <p className="text-sm text-neutral-600">
              Salon request pending
              {salonStatus.pendingRequest?.salon?.name
                ? `: ${salonStatus.pendingRequest.salon?.name}`
                : ""}
            </p>
            <Button
              disabled={isSalonSaving}
              onClick={onCancelSalonRequest}
              variant="outline"
            >
              Cancel pending request
            </Button>
          </div>
        )}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="grid gap-2 text-sm font-semibold">
          Request to join salon
          <select
            className="rounded-2xl border bg-white p-3 font-normal"
            disabled={isSalonSaving}
            value={selectedSalonId}
            onChange={(event) => onSelectedSalonChange(event.target.value)}
          >
            <option value="">Select salon</option>
            {availableSalons.length === 0 ? (
              <option disabled value="">
                No new salons available
              </option>
            ) : (
              availableSalons.map((salon) => (
                <option
                  key={salon.id || salon._id}
                  value={salon.id || salon._id}
                >
                  {salon.name}
                </option>
              ))
            )}
          </select>
        </label>

        <Button
          className="mt-2 sm:mt-6"
          disabled={!selectedSalonId || isSalonSaving}
          onClick={onRequestSalonJoin}
        >
          {isSalonSaving ? "Sending..." : "Send request"}
        </Button>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <h4 className="font-semibold">Create your own salon</h4>
        <p className="mt-1 text-sm text-neutral-500">
          You can only create one salon.
        </p>

        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={onCreateSalon}>
          <label className="grid gap-2 text-sm font-semibold">
            Salon name
            <input
              className="rounded-2xl border bg-white p-3 font-normal"
              disabled={isSalonSaving}
              placeholder="Salon name"
              value={salonDraft.name}
              onChange={(event) => onUpdateSalonDraft("name", event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            City
            <input
              className="rounded-2xl border bg-white p-3 font-normal"
              disabled={isSalonSaving}
              placeholder="City"
              value={salonDraft.city}
              onChange={(event) => onUpdateSalonDraft("city", event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            Address
            <input
              className="rounded-2xl border bg-white p-3 font-normal"
              disabled={isSalonSaving}
              placeholder="Address"
              value={salonDraft.address}
              onChange={(event) =>
                onUpdateSalonDraft("address", event.target.value)
              }
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            Phone
            <input
              className="rounded-2xl border bg-white p-3 font-normal"
              disabled={isSalonSaving}
              placeholder="Phone"
              value={salonDraft.phone}
              onChange={(event) => onUpdateSalonDraft("phone", event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
            Image URL
            <input
              className="rounded-2xl border bg-white p-3 font-normal"
              disabled={isSalonSaving}
              placeholder="Image URL"
              value={salonDraft.imageUrl}
              onChange={(event) =>
                onUpdateSalonDraft("imageUrl", event.target.value)
              }
            />
          </label>

          <Button
            className="sm:col-span-2"
            disabled={!salonDraft.name.trim() || isSalonSaving}
            type="submit"
          >
            {isSalonSaving ? "Creating..." : "Create salon"}
          </Button>
        </form>
      </div>
    </SettingsCard>
  );
}
