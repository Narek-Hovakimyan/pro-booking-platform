import { Store, UserPlus } from "lucide-react";

import TeamSettingsSection from "@/barber/components/TeamSettingsSection";
import SalonPromotionsManager from "@/barber/components/SalonPromotionsManager";
import SalonSettingsSection from "@/barber/components/settings/SalonSettingsSection";
import JoinRequestDecisions from "@/barber/components/settings/JoinRequestDecisions";
import SalonJoinView from "@/barber/components/settings/SalonJoinView";

export default function SalonSettingsView({
  allSalonEntries,
  availableSalons,
  currentUserId,
  error,
  isLoading,
  isSalonSaving,
  managedSalons,
  ownerRequests,
  pendingEntries,
  salonAdmins,
  salonDraft,
  salonEntriesWithRelationshipActions,
  salonError,
  salonSaved,
  salonStaffById,
  salonStatus,
  salons,
  savingPaymentKey,
  savingRelationshipKey,
  selectedSalonId,
  onCancelSalonRequest,
  onCreateSalon,
  onDecideSalonRequest,
  onOpenDemoteConfirmation,
  onOpenLeaveConfirmation,
  onOpenPromoteConfirmation,
  onOpenRemoveBarberConfirmation,
  onRequestSalonJoin,
  onSaveRelationshipType,
  onSaveStaffPayment,
  onSelectedSalonChange,
  onUpdateSalonDraft,
}) {
  return (
    <>
      <section className="overflow-hidden rounded-3xl border border-purple-100 bg-gradient-to-br from-white via-purple-50/70 to-pink-50 p-4 shadow-sm shadow-purple-100/60 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-purple-700 shadow-sm">
              <Store className="h-3.5 w-3.5" />
              Salon onboarding
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
              Set up your salon
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600 sm:text-base">
              Create your own salon or join an existing one to start managing schedules, bookings, and services.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:w-[28rem]">
            <a
              className="group rounded-2xl border border-white bg-white/90 p-4 shadow-sm transition hover:border-purple-200 hover:shadow-md"
              href="#create-salon"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-100 text-purple-700">
                <Store className="h-5 w-5" />
              </span>
              <span className="mt-3 block text-sm font-bold text-neutral-950">
                Create my salon
              </span>
              <span className="mt-1 block text-xs leading-5 text-neutral-500">
                Open a new salon profile and manage it as owner.
              </span>
            </a>
            <a
              className="group rounded-2xl border border-white bg-white/90 p-4 shadow-sm transition hover:border-pink-200 hover:shadow-md"
              href="#join-salon"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pink-100 text-pink-700">
                <UserPlus className="h-5 w-5" />
              </span>
              <span className="mt-3 block text-sm font-bold text-neutral-950">
                Join existing salon
              </span>
              <span className="mt-1 block text-xs leading-5 text-neutral-500">
                Request access to a salon that is already listed.
              </span>
            </a>
          </div>
        </div>
      </section>
    {error && (
      <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {error}
      </p>
    )}
    {isLoading ? (
      <p className="text-neutral-500">Loading...</p>
    ) : (
      <>
        {salonStatus.salonStatus !== "none" && (
          <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
            You can create and manage multiple salons. Each salon has separate billing, staff, and schedules.
          </p>
        )}
        <JoinRequestDecisions />
        <SalonJoinView currentUserId={currentUserId} />
        <SalonSettingsSection
            allSalonEntries={allSalonEntries}
            availableSalons={availableSalons}
            currentUserId={currentUserId}
            hideJoinRequestControls
            isSalonSaving={isSalonSaving}
            pendingEntries={pendingEntries}
            salonDraft={salonDraft}
            salonError={salonError}
            salonSaved={salonSaved}
            salonStatus={salonStatus}
            selectedSalonId={selectedSalonId}
            onCancelSalonRequest={onCancelSalonRequest}
            onCreateSalon={onCreateSalon}
            onOpenLeaveConfirmation={onOpenLeaveConfirmation}
            onRequestSalonJoin={onRequestSalonJoin}
            onSelectedSalonChange={onSelectedSalonChange}
            onUpdateSalonDraft={onUpdateSalonDraft}
          />
          <TeamSettingsSection
            approvedSalonEntries={salonEntriesWithRelationshipActions}
            currentUserId={currentUserId}
            isSalonSaving={isSalonSaving}
            managedSalons={managedSalons}
            ownerRequests={ownerRequests}
            hideJoinRequestDecisions
            salonAdmins={salonAdmins}
            salonStaffById={salonStaffById}
            salons={salons}
            onDecideSalonRequest={onDecideSalonRequest}
            onOpenDemoteConfirmation={onOpenDemoteConfirmation}
            onOpenPromoteConfirmation={onOpenPromoteConfirmation}
            onOpenRemoveBarberConfirmation={onOpenRemoveBarberConfirmation}
            onSaveRelationshipType={onSaveRelationshipType}
            onSaveStaffPayment={onSaveStaffPayment}
            savingRelationshipKey={savingRelationshipKey}
            savingPaymentKey={savingPaymentKey}
          />

          {/* Salon Promotions — one manager per managed salon */}
          {managedSalons.map((salon) => {
            const salonId = salon.id || salon._id;
            const salonName = salon.name || "Salon";
            return (
              <SalonPromotionsManager
                key={salonId}
                salonId={salonId}
                salonName={salonName}
              />
            );
          })}
        </>

      )}
    </>
  );
}
