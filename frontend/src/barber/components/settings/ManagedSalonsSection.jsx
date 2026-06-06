import SettingsCard from "@/barber/components/settings/SettingsCard";
import { Button } from "@/shared/components/ui/button";
import { getMediaUrl } from "@/shared/utils/media";
import { useState } from "react";

const relationshipOptions = [
  { value: "staff", label: "Staff" },
  { value: "chair_renter", label: "Chair renter" },
];

const relationshipBadgeClassNames = {
  staff: "bg-neutral-100 text-neutral-700",
  chair_renter: "bg-sky-50 text-sky-700",
};

const relationshipStatusClassNames = {
  accepted: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-700",
};

const relationshipStatusLabels = {
  accepted: "Accepted",
  pending: "Pending confirmation",
  rejected: "Rejected",
};

const relationshipHelperText = {
  chair_renter:
    "Chair renters work independently. Salon owner will not see their private bookings, revenue, or calendar movement.",
  staff:
    "Staff members are included in salon dashboard, calendar, and revenue reports.",
};

export default function ManagedSalonsSection({
  managedSalonStaff,
  salonAdmins,
  ownerRequests,
  currentUserId,
  isSalonSaving,
  onDecideSalonRequest,
  onOpenDemoteConfirmation,
  onOpenPromoteConfirmation,
  onOpenRemoveBarberConfirmation,
  onSaveRelationshipType,
  savingRelationshipKey,
}) {
  const [relationshipDrafts, setRelationshipDrafts] = useState({});

  if (managedSalonStaff.length === 0) return null;

  return (
    <SettingsCard
      title="Manage salons"
      description="Manage specialists and admins for your salons."
    >
      {managedSalonStaff.map((managedSalon) => {
        const managedSalonId = managedSalon.id || managedSalon._id;
        const salonName = managedSalon.name || "Salon";
        const isOwner = managedSalon.isOwner;
        const isAdmin = managedSalon.isAdmin;
        const adminData = salonAdmins[managedSalonId] || {
          owner: null,
          admins: [],
        };
        const owner = adminData.owner;
        const admins = adminData.admins || [];

        return (
          <div
            className="rounded-2xl border border-neutral-200 p-4"
            key={managedSalonId}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold text-neutral-950">{salonName}</h4>
              <div className="flex flex-wrap gap-2">
                {isOwner && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    Owner
                  </span>
                )}
                {isAdmin && !isOwner && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    Admin
                  </span>
                )}
              </div>
            </div>

            {owner && (
              <div className="mt-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                  Owner
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {owner.avatarUrl && (
                    <img
                      alt={owner.name}
                      className="h-6 w-6 rounded-full object-cover"
                      src={getMediaUrl(owner.avatarUrl)}
                    />
                  )}
                  <span className="text-sm font-medium text-neutral-900">
                    {owner.name}
                  </span>
                  {owner.phone && (
                    <span className="text-sm text-neutral-500">
                      {owner.phone}
                    </span>
                  )}
                </div>
              </div>
            )}

            {admins.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                  Admins
                </div>
                <div className="mt-1 space-y-1">
                  {admins.map((admin) => {
                    const adminId = admin.id || admin._id;
                    const isSelf = String(adminId) === String(currentUserId);

                    return (
                      <div
                        className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 p-2"
                        key={adminId}
                      >
                        <div className="flex items-center gap-2">
                          {admin.avatarUrl && (
                            <img
                              alt={admin.name}
                              className="h-6 w-6 rounded-full object-cover"
                              src={getMediaUrl(admin.avatarUrl)}
                            />
                          )}
                          <span className="text-sm font-medium text-neutral-900">
                            {admin.name}
                          </span>
                          {admin.phone && (
                            <span className="text-sm text-neutral-500">
                              {admin.phone}
                            </span>
                          )}
                        </div>

                        {isOwner && !isSelf && (
                          <Button
                            disabled={isSalonSaving}
                            onClick={() =>
                              onOpenDemoteConfirmation(
                                salonName,
                                managedSalonId,
                                admin
                              )
                            }
                            size="sm"
                            variant="outline"
                          >
                            Remove admin
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {managedSalon.barbers && managedSalon.barbers.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                  Specialists
                </div>
                <div className="mt-1 space-y-1">
                  {managedSalon.barbers.map((barber) => {
                    const barberId = barber.id || barber._id;
                    const isSelf = String(barberId) === String(currentUserId);
                    const isBarberAdmin = managedSalon.adminIds.includes(
                      String(barberId)
                    );
                    const relationshipKey = `${managedSalonId}:${barberId}`;
                    const currentRelationshipType =
                      barber.relationshipType || "staff";
                    const relationshipStatus =
                      barber.relationshipStatus || "accepted";
                    const selectedRelationshipType =
                      relationshipDrafts[relationshipKey] ||
                      currentRelationshipType;
                    const relationshipChanged =
                      selectedRelationshipType !== currentRelationshipType ||
                      relationshipStatus === "rejected";
                    const isSavingRelationship =
                      savingRelationshipKey === relationshipKey;

                    return (
                      <div
                        className="rounded-xl border border-neutral-100 bg-neutral-50 p-3"
                        key={barberId}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex items-center gap-2">
                            {barber.avatarUrl && (
                              <img
                                alt={barber.name}
                                className="h-6 w-6 rounded-full object-cover"
                                src={getMediaUrl(barber.avatarUrl)}
                              />
                            )}
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-neutral-900">
                                  {barber.name}
                                </span>
                                {isBarberAdmin && (
                                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                    Admin
                                  </span>
                                )}
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                    relationshipBadgeClassNames[
                                      currentRelationshipType
                                    ] || relationshipBadgeClassNames.staff
                                  }`}
                                >
                                  {currentRelationshipType === "chair_renter"
                                    ? "Chair renter"
                                    : "Staff"}
                                </span>
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                    relationshipStatusClassNames[
                                      relationshipStatus
                                    ] || relationshipStatusClassNames.accepted
                                  }`}
                                >
                                  {relationshipStatusLabels[
                                    relationshipStatus
                                  ] || relationshipStatusLabels.accepted}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-neutral-500">
                                {relationshipStatus === "pending"
                                  ? "Waiting for specialist confirmation"
                                  : "Current relationship type"}
                              </p>
                            </div>
                          </div>

                          <div className="flex min-w-0 flex-1 flex-col gap-3 lg:max-w-xl">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <select
                                className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                                disabled={isSalonSaving || isSavingRelationship}
                                onChange={(event) =>
                                  setRelationshipDrafts((currentDrafts) => ({
                                    ...currentDrafts,
                                    [relationshipKey]: event.target.value,
                                  }))
                                }
                                value={selectedRelationshipType}
                              >
                                {relationshipOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <Button
                                disabled={
                                  isSalonSaving ||
                                  isSavingRelationship ||
                                  !relationshipChanged
                                }
                                onClick={() =>
                                  onSaveRelationshipType(
                                    managedSalonId,
                                    barberId,
                                    selectedRelationshipType
                                  )
                                }
                                size="sm"
                              >
                                {isSavingRelationship ? "Saving..." : "Save"}
                              </Button>
                            </div>
                            <p className="text-xs text-neutral-500">
                              {relationshipHelperText[selectedRelationshipType] ||
                                relationshipHelperText.staff}
                            </p>
                            {relationshipStatus === "pending" && (
                              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                                Waiting for specialist confirmation before this
                                relationship applies to private dashboard or
                                calendar access.
                              </p>
                            )}

                            <div className="flex flex-wrap gap-2">
                              {isOwner && !isSelf && !isBarberAdmin && (
                                <Button
                                  disabled={isSalonSaving}
                                  onClick={() =>
                                    onOpenPromoteConfirmation(
                                      salonName,
                                      managedSalonId,
                                      barber
                                    )
                                  }
                                  size="sm"
                                  variant="outline"
                                >
                                  Promote
                                </Button>
                              )}

                              {(isOwner || isAdmin) && !isSelf && (
                                <Button
                                  disabled={isSalonSaving}
                                  onClick={() =>
                                    onOpenRemoveBarberConfirmation(
                                      managedSalon,
                                      barber
                                    )
                                  }
                                  size="sm"
                                  variant="outline"
                                >
                                  Remove
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {ownerRequests.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                  Incoming requests
                </div>
                <div className="mt-1 space-y-1">
                  {ownerRequests
                    .filter((req) => {
                      const reqSalonId = req.salon?.id || req.salon?._id;
                      return String(reqSalonId) === String(managedSalonId);
                    })
                    .map((req) => {
                      const reqId = req.id || req._id;
                      const barber = req.barber || {};

                      return (
                        <div
                          className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/30 p-2"
                          key={reqId}
                        >
                          <div className="flex items-center gap-2">
                            {barber.avatarUrl && (
                              <img
                                alt={barber.name}
                                className="h-6 w-6 rounded-full object-cover"
                                src={getMediaUrl(barber.avatarUrl)}
                              />
                            )}
                            <span className="text-sm font-medium text-neutral-900">
                              {barber.name}
                            </span>
                            {barber.phone && (
                              <span className="text-sm text-neutral-500">
                                {barber.phone}
                              </span>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <Button
                              disabled={isSalonSaving}
                              onClick={() =>
                                onDecideSalonRequest(reqId, "accepted")
                              }
                              size="sm"
                            >
                              Accept
                            </Button>
                            <Button
                              disabled={isSalonSaving}
                              onClick={() =>
                                onDecideSalonRequest(reqId, "rejected")
                              }
                              size="sm"
                              variant="outline"
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </SettingsCard>
  );
}
