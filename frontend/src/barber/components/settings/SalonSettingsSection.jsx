import { Link } from "react-router-dom";
import {
  Building2,
  CreditCard,
  Calendar,
  BarChart3,
} from "lucide-react";

import SettingsCard from "@/barber/components/settings/SettingsCard";
import { Button } from "@/shared/components/ui/button";

function ManageableSalonCard({ salonData = {}, isPrimary, isOwner }) {
  const salonName = salonData?.name || "Salon";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-900 truncate">
              {salonName}
            </span>
            {isPrimary && (
              <span className="inline-flex shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                Primary
              </span>
            )}
          </div>
          {salonData?.city && (
            <div className="mt-0.5 text-sm text-neutral-500">
              {salonData.city}
              {salonData?.address ? `, ${salonData.address}` : ""}
            </div>
          )}
          <div className="mt-1 text-xs text-neutral-400">
            {isOwner ? "Owner" : "Admin"}
          </div>
        </div>

        {/* Quick actions — owner/admin only */}
        {isOwner && (
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <Link
              to={`/admin/salon/billing`}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition hover:bg-neutral-100"
              title="Billing"
            >
              <CreditCard className="h-3 w-3" />
              Billing
            </Link>
            <Link
              to={`/admin/salon/calendar`}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition hover:bg-neutral-100"
              title="Calendar"
            >
              <Calendar className="h-3 w-3" />
              Calendar
            </Link>
            <Link
              to={`/admin/salon/reports`}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition hover:bg-neutral-100"
              title="Reports"
            >
              <BarChart3 className="h-3 w-3" />
              Reports
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SalonSettingsSection({
  salonError,
  salonSaved,
  allSalonEntries = [],
  pendingEntries = [],
  salonStatus = {},
  currentUserId,
  availableSalons = [],
  selectedSalonId = "",
  salonDraft = {},
  isSalonSaving,
  onCancelSalonRequest,
  onCreateSalon,
  onOpenLeaveConfirmation,
  onRequestSalonJoin,
  onSelectedSalonChange,
  onUpdateSalonDraft,
}) {
  // Separate manageable (owner/admin) from member-only entries
  const safeSalonEntries = Array.isArray(allSalonEntries) ? allSalonEntries : [];
  const safePendingEntries = Array.isArray(pendingEntries) ? pendingEntries : [];
  const safeAvailableSalons = Array.isArray(availableSalons) ? availableSalons : [];
  const safeSalonDraft = salonDraft || {};
  const safeSalonStatus = salonStatus || {};

  const manageableEntries = safeSalonEntries.filter((entry) => {
    const ownerId = entry.salon?.ownerId;
    return (
      String(ownerId) === String(currentUserId) ||
      ownerId === currentUserId
    );
  });
  const memberOnlyEntries = safeSalonEntries.filter((entry) => {
    const ownerId = entry.salon?.ownerId;
    return (
      String(ownerId) !== String(currentUserId) &&
      ownerId !== currentUserId
    );
  });

  return (
    <SettingsCard
      title="Salon settings"
      description="Create and manage multiple salons. Each salon has separate billing, staff, schedules, and reports."
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

      {/* ── Your salons (owner/admin) ── */}
      {manageableEntries.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-neutral-500" />
            <h4 className="font-semibold text-neutral-900">Your salons</h4>
          </div>
          <p className="text-xs text-neutral-500">
            Primary salon is used only as your default salon. Billing and
            bookings stay separate per salon.
          </p>
          <div className="space-y-2">
            {manageableEntries.map((entry, index) => {
              const salonData = entry.salon || {};
              const salonId = salonData?.id || salonData?._id || entry.salon;
              const isPrimary = entry.isPrimary;
              const isOwner =
                salonData?.ownerId === currentUserId ||
                String(salonData?.ownerId) === String(currentUserId);

              return (
                <ManageableSalonCard
                  key={salonId || index}
                  salonData={salonData}
                  isPrimary={isPrimary}
                  isOwner={isOwner}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Memberships (staff/chair_renter — not owner/admin) ── */}
      {memberOnlyEntries.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-neutral-900">
            Your memberships
          </h4>
          <div className="space-y-2">
            {memberOnlyEntries.map((entry, index) => {
              const salonData = entry.salon || {};
              const salonId = salonData?.id || salonData?._id || entry.salon;
              const salonName = salonData?.name || "Salon";

              return (
                <div
                  className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
                  key={salonId || index}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-neutral-900">
                        {salonName}
                      </div>
                      {salonData?.city && (
                        <div className="mt-0.5 text-sm text-neutral-500">
                          {salonData.city}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-neutral-400">
                        Member
                        {entry.isPrimary ? " · Primary" : ""}
                      </div>
                    </div>

                    <Button
                      disabled={isSalonSaving}
                      onClick={() =>
                        onOpenLeaveConfirmation(salonName, salonId)
                      }
                      variant="outline"
                    >
                      Leave
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Pending requests ── */}
      {safePendingEntries.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-neutral-900">
            Pending requests
          </h4>
          <div className="space-y-2">
            {safePendingEntries.map((entry, index) => {
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
                      variant="outline"
                    >
                      Cancel request
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Pending legacy request ── */}
      {safeSalonStatus.pendingRequest && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-neutral-900">
                {safeSalonStatus.pendingRequest.salonName ||
                  "Pending salon request"}
              </div>
              <div className="mt-1 text-sm text-amber-600 font-medium">
                Waiting for approval
              </div>
            </div>
            <Button
              disabled={isSalonSaving}
              onClick={onCancelSalonRequest}
              variant="outline"
            >
              Cancel pending request
            </Button>
          </div>
        </div>
      )}

      {/* ── Join salon ── */}
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
            {safeAvailableSalons.length === 0 ? (
              <option disabled value="">
                No new salons available
              </option>
            ) : (
              safeAvailableSalons.map((salon) => (
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

      {/* ── Create another salon ── */}
      <div className="rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-neutral-500" />
          <h4 className="font-semibold text-neutral-900">
            Create another salon
          </h4>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          You can create multiple salons. Each salon has separate billing,
          staff, schedules, and reports.
        </p>

        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={onCreateSalon}
        >
          <label className="grid gap-2 text-sm font-semibold">
            Salon name
            <input
              className="rounded-2xl border bg-white p-3 font-normal"
              disabled={isSalonSaving}
              placeholder="Salon name"
              value={safeSalonDraft.name || ""}
              onChange={(event) =>
                onUpdateSalonDraft("name", event.target.value)
              }
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            City
            <input
              className="rounded-2xl border bg-white p-3 font-normal"
              disabled={isSalonSaving}
              placeholder="City"
              value={safeSalonDraft.city || ""}
              onChange={(event) =>
                onUpdateSalonDraft("city", event.target.value)
              }
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            Address
            <input
              className="rounded-2xl border bg-white p-3 font-normal"
              disabled={isSalonSaving}
              placeholder="Address"
              value={safeSalonDraft.address || ""}
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
              value={safeSalonDraft.phone || ""}
              onChange={(event) =>
                onUpdateSalonDraft("phone", event.target.value)
              }
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
            Image URL
            <input
              className="rounded-2xl border bg-white p-3 font-normal"
              disabled={isSalonSaving}
              placeholder="Image URL"
              value={safeSalonDraft.imageUrl || ""}
              onChange={(event) =>
                onUpdateSalonDraft("imageUrl", event.target.value)
              }
            />
          </label>

          <Button
            className="sm:col-span-2"
            disabled={!safeSalonDraft.name?.trim() || isSalonSaving}
            type="submit"
          >
            {isSalonSaving ? "Creating..." : "Create salon"}
          </Button>
        </form>
      </div>
    </SettingsCard>
  );
}
