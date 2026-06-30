import { Link } from "react-router-dom";
import {
  Building2,
  CreditCard,
  Calendar,
  BarChart3,
  CheckCircle2,
  Clock3,
  Store,
  UserPlus,
} from "lucide-react";

import SettingsCard from "@/barber/components/settings/SettingsCard";
import { Button } from "@/shared/components/ui/button";

function ManageableSalonCard({ salonData = {}, isPrimary, isOwner }) {
  const salonName = salonData?.name || "Salon";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-neutral-900">
              {salonName}
            </span>
            <span className="inline-flex shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
              {isOwner ? "Owner" : "Admin"}
            </span>
            {isPrimary && (
              <span className="inline-flex shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
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
  const hasRelationships =
    manageableEntries.length > 0 ||
    memberOnlyEntries.length > 0 ||
    safePendingEntries.length > 0 ||
    Boolean(safeSalonStatus.pendingRequest);
  const createTitle = hasRelationships ? "Create another salon" : "Create my salon";

  return (
    <div className="space-y-5">
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

      {hasRelationships && (
        <SettingsCard
          title="Your salon relationships"
          description="Review salons you manage, memberships, and pending requests."
        >
          {/* Your salons (owner/admin) */}
          {manageableEntries.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-purple-600" />
                <h4 className="font-semibold text-neutral-900">Managed salons</h4>
              </div>
              <p className="text-xs leading-5 text-neutral-500">
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

          {/* Memberships */}
          {memberOnlyEntries.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-semibold text-neutral-900">
                Salon memberships
              </h4>
              <div className="space-y-2">
                {memberOnlyEntries.map((entry, index) => {
                  const salonData = entry.salon || {};
                  const salonId = salonData?.id || salonData?._id || entry.salon;
                  const salonName = salonData?.name || "Salon";

                  return (
                    <div
                      className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
                      key={salonId || index}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-neutral-900">
                              {salonName}
                            </span>
                            <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
                              Member{entry.isPrimary ? " · Primary" : ""}
                            </span>
                          </div>
                          {salonData?.city && (
                            <div className="mt-0.5 text-sm text-neutral-500">
                              {salonData.city}
                            </div>
                          )}
                        </div>

                        <Button
                          className="w-full sm:w-auto"
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

          {/* Pending requests */}
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
                      className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4"
                      key={salonId || index}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2 font-semibold text-neutral-900">
                            <Clock3 className="h-4 w-4 text-amber-600" />
                            {salonName}
                          </div>
                          <div className="mt-1 text-sm font-medium text-amber-700">
                            Waiting for salon approval
                          </div>
                          {salonData?.city && (
                            <div className="mt-1 text-sm text-neutral-500">
                              {salonData.city}
                            </div>
                          )}
                        </div>

                        <Button
                          className="w-full sm:w-auto"
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

          {/* Pending legacy request */}
          {safeSalonStatus.pendingRequest && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-neutral-900">
                    <Clock3 className="h-4 w-4 text-amber-600" />
                    {safeSalonStatus.pendingRequest.salonName ||
                      "Pending salon request"}
                  </div>
                  <div className="mt-1 text-sm font-medium text-amber-700">
                    Waiting for approval
                  </div>
                </div>
                <Button
                  className="w-full sm:w-auto"
                  disabled={isSalonSaving}
                  onClick={onCancelSalonRequest}
                  variant="outline"
                >
                  Cancel pending request
                </Button>
              </div>
            </div>
          )}
        </SettingsCard>
      )}

      {!hasRelationships && (
        <div className="rounded-3xl border border-dashed border-purple-200 bg-purple-50/60 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-purple-700 shadow-sm">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-bold text-neutral-950">Choose your next step</h3>
              <p className="mt-1 text-sm leading-6 text-neutral-600">
                Start by creating your salon profile or requesting to join an existing salon.
              </p>
            </div>
          </div>
        </div>
      )}

      <section
        className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5"
        id="join-salon"
      >
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-pink-50 text-pink-700">
            <UserPlus className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-neutral-950">Join existing salon</h3>
            <p className="mt-1 text-sm leading-6 text-neutral-500">
              Select a salon and send a request. Schedule access appears after approval.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="grid gap-2 text-sm font-semibold text-neutral-800">
            Salon
            <select
              className="rounded-2xl border border-neutral-200 bg-white p-3 font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
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
            className="w-full bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-md shadow-purple-100 hover:from-purple-700 hover:to-pink-600 sm:mt-7 sm:w-auto"
            disabled={!selectedSalonId || isSalonSaving}
            onClick={onRequestSalonJoin}
          >
            {isSalonSaving ? "Sending..." : "Send request"}
          </Button>
        </div>
      </section>

      <section
        className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm sm:p-5"
        id="create-salon"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-700">
            <Store className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-neutral-950">
              {createTitle}
            </h3>
            <p className="mt-1 text-sm leading-6 text-neutral-500">
              Add your salon details. You can choose whether you also work there as a bookable specialist.
            </p>
          </div>
        </div>

        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={onCreateSalon}
        >
          <label className="grid gap-2 text-sm font-semibold">
            Salon name
            <input
              className="rounded-2xl border border-neutral-200 bg-white p-3 font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
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
              className="rounded-2xl border border-neutral-200 bg-white p-3 font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
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
              className="rounded-2xl border border-neutral-200 bg-white p-3 font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
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
              className="rounded-2xl border border-neutral-200 bg-white p-3 font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
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
              className="rounded-2xl border border-neutral-200 bg-white p-3 font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
              disabled={isSalonSaving}
              placeholder="Image URL"
              value={safeSalonDraft.imageUrl || ""}
              onChange={(event) =>
                onUpdateSalonDraft("imageUrl", event.target.value)
              }
            />
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-3 text-sm font-semibold sm:col-span-2">
            <input
              checked={safeSalonDraft.ownerWorksAsSpecialist !== false}
              className="mt-1 h-4 w-4"
              disabled={isSalonSaving}
              type="checkbox"
              onChange={(event) =>
                onUpdateSalonDraft(
                  "ownerWorksAsSpecialist",
                  event.target.checked
                )
              }
            />
            <span>
              I also work as a specialist in this salon
              <span className="mt-1 block text-xs font-normal text-neutral-500">
                Turn this off if you only manage the salon and do not take
                client bookings.
              </span>
            </span>
          </label>

          <Button
            className="w-full bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-md shadow-purple-100 hover:from-purple-700 hover:to-pink-600 sm:col-span-2"
            disabled={!safeSalonDraft.name?.trim() || isSalonSaving}
            type="submit"
          >
            {isSalonSaving ? "Creating..." : "Create salon"}
          </Button>
        </form>
      </section>
    </div>
  );
}
