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

const paymentTypeOptions = [
  { value: "none", label: "Not configured" },
  { value: "commission", label: "Commission split" },
  { value: "fixed", label: "Fixed pay" },
];

const getPersonId = (person) => person?.id || person?._id || "";

const fixedPeriodOptions = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const commissionPresets = [
  { label: "50/50", staff: 50, salon: 50 },
  { label: "60/40", staff: 60, salon: 40 },
  { label: "70/30", staff: 70, salon: 30 },
];

const getPaymentDraft = (staffPayment = {}) => ({
  type: staffPayment.type || "none",
  commissionStaffPercent: staffPayment.commissionStaffPercent ?? "",
  commissionSalonPercent: staffPayment.commissionSalonPercent ?? "",
  fixedAmount: staffPayment.fixedAmount ?? "",
  fixedPeriod: staffPayment.fixedPeriod || "monthly",
  notes: staffPayment.notes || "",
});

const getPaymentLabel = (staffPayment = {}) => {
  if (staffPayment.type === "commission") {
    const staff = staffPayment.commissionStaffPercent;
    const salon = staffPayment.commissionSalonPercent;
    return staff != null && salon != null ? `${staff}/${salon} split` : "Commission split";
  }

  if (staffPayment.type === "fixed") {
    return `Fixed ${staffPayment.fixedPeriod || "pay"}`;
  }

  return "Not configured";
};

function PaymentSettingsModal({
  draft,
  error,
  isSaving,
  staffName,
  onChange,
  onClose,
  onSave,
}) {
  const commissionTotal =
    Number(draft.commissionStaffPercent || 0) +
    Number(draft.commissionSalonPercent || 0);
  const hasCommissionError =
    draft.type === "commission" && commissionTotal !== 100;
  const hasFixedError =
    draft.type === "fixed" &&
    (!Number(draft.fixedAmount) || Number(draft.fixedAmount) <= 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-950">
              Pay terms
            </h3>
            <p className="mt-0.5 text-sm text-neutral-500">{staffName}</p>
          </div>
          <Button disabled={isSaving} onClick={onClose} size="sm" variant="outline">
            Close
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="grid gap-1 text-sm font-semibold text-neutral-800">
            Payment type
            <select
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 font-normal"
              disabled={isSaving}
              value={draft.type}
              onChange={(event) => onChange("type", event.target.value)}
            >
              {paymentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {draft.type === "commission" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {commissionPresets.map((preset) => (
                  <Button
                    disabled={isSaving}
                    key={preset.label}
                    onClick={() => {
                      onChange("commissionStaffPercent", preset.staff);
                      onChange("commissionSalonPercent", preset.salon);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold text-neutral-800">
                  Staff %
                  <input
                    className="rounded-xl border border-neutral-200 px-3 py-2 font-normal"
                    disabled={isSaving}
                    min="0"
                    max="100"
                    type="number"
                    value={draft.commissionStaffPercent}
                    onChange={(event) =>
                      onChange("commissionStaffPercent", event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-neutral-800">
                  Salon %
                  <input
                    className="rounded-xl border border-neutral-200 px-3 py-2 font-normal"
                    disabled={isSaving}
                    min="0"
                    max="100"
                    type="number"
                    value={draft.commissionSalonPercent}
                    onChange={(event) =>
                      onChange("commissionSalonPercent", event.target.value)
                    }
                  />
                </label>
              </div>
              {hasCommissionError && (
                <p className="text-xs font-medium text-red-600">
                  Commission split must add up to 100.
                </p>
              )}
            </div>
          )}

          {draft.type === "fixed" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-neutral-800">
                Amount
                <input
                  className="rounded-xl border border-neutral-200 px-3 py-2 font-normal"
                  disabled={isSaving}
                  min="0"
                  type="number"
                  value={draft.fixedAmount}
                  onChange={(event) => onChange("fixedAmount", event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-neutral-800">
                Period
                <select
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-2 font-normal"
                  disabled={isSaving}
                  value={draft.fixedPeriod}
                  onChange={(event) => onChange("fixedPeriod", event.target.value)}
                >
                  {fixedPeriodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {hasFixedError && (
                <p className="text-xs font-medium text-red-600 sm:col-span-2">
                  Fixed pay requires an amount greater than 0.
                </p>
              )}
            </div>
          )}

          <label className="grid gap-1 text-sm font-semibold text-neutral-800">
            Notes
            <textarea
              className="min-h-20 rounded-xl border border-neutral-200 px-3 py-2 font-normal"
              disabled={isSaving}
              maxLength={500}
              value={draft.notes}
              onChange={(event) => onChange("notes", event.target.value)}
            />
          </label>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button disabled={isSaving} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={isSaving || hasCommissionError || hasFixedError}
              onClick={onSave}
              type="button"
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ManagedSalonsSection({
  managedSalonStaff,
  salonAdmins,
  ownerRequests,
  currentUserId,
  hideJoinRequestDecisions = false,
  isSalonSaving,
  onDecideSalonRequest,
  onOpenDemoteConfirmation,
  onOpenPromoteConfirmation,
  onOpenRemoveBarberConfirmation,
  onSaveRelationshipType,
  onSaveStaffPayment,
  savingRelationshipKey,
  savingPaymentKey,
}) {
  const [relationshipDrafts, setRelationshipDrafts] = useState({});
  const [paymentEditor, setPaymentEditor] = useState(null);
  const [paymentDraft, setPaymentDraft] = useState(getPaymentDraft());
  const [paymentError, setPaymentError] = useState("");

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
        const ownerId = managedSalon.ownerId || getPersonId(owner);
        const specialists = (managedSalon.barbers || []).filter((barber) => {
          const barberId = getPersonId(barber);
          return (
            barber.roleInSalon !== "owner" &&
            String(barberId || "") !== String(ownerId || "")
          );
        });

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

            {specialists.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                  Specialists
                </div>
                <div className="mt-1 space-y-1">
                  {specialists.map((barber) => {
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
                    const canEditPayment =
                      (isOwner || isAdmin) &&
                      currentRelationshipType === "staff" &&
                      relationshipStatus === "accepted";
                    const isSavingPayment = savingPaymentKey === relationshipKey;

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
                                {canEditPayment && (
                                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                    {getPaymentLabel(barber.staffPayment)}
                                  </span>
                                )}
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
                              {canEditPayment && (
                                <Button
                                  disabled={isSalonSaving || isSavingPayment}
                                  onClick={() => {
                                    setPaymentEditor({
                                      salonId: managedSalonId,
                                      barber,
                                    });
                                    setPaymentDraft(
                                      getPaymentDraft(barber.staffPayment)
                                    );
                                    setPaymentError("");
                                  }}
                                  size="sm"
                                  variant="outline"
                                >
                                  Pay terms
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

            {!hideJoinRequestDecisions && ownerRequests.length > 0 && (
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
      {paymentEditor && (
        <PaymentSettingsModal
          draft={paymentDraft}
          error={paymentError}
          isSaving={
            savingPaymentKey ===
            `${paymentEditor.salonId}:${paymentEditor.barber.id || paymentEditor.barber._id}`
          }
          staffName={paymentEditor.barber.name || "Specialist"}
          onChange={(field, value) =>
            setPaymentDraft((currentDraft) => ({
              ...currentDraft,
              [field]: value,
            }))
          }
          onClose={() => {
            if (!savingPaymentKey) setPaymentEditor(null);
          }}
          onSave={async () => {
            setPaymentError("");
            const success = await onSaveStaffPayment(
              paymentEditor.salonId,
              paymentEditor.barber.id || paymentEditor.barber._id,
              paymentDraft
            );
            if (success) {
              setPaymentEditor(null);
            } else {
              setPaymentError("Could not save pay terms.");
            }
          }}
        />
      )}
    </SettingsCard>
  );
}
