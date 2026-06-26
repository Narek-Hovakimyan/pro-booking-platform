import ManagedSalonsSection from "@/barber/components/settings/ManagedSalonsSection";
import SalonStaffSection from "@/barber/components/settings/SalonStaffSection";

const getPersonId = (person) => person?.id || person?._id || "";

export default function TeamSettingsSection({
  approvedSalonEntries,
  currentUserId,
  isSalonSaving,
  managedSalons,
  ownerRequests,
  salonAdmins,
  salonStaffById,
  salons,
  onDecideSalonRequest,
  onOpenDemoteConfirmation,
  onOpenPromoteConfirmation,
  onOpenRemoveBarberConfirmation,
  onSaveRelationshipType,
  onSaveStaffPayment,
  savingRelationshipKey,
  savingPaymentKey,
}) {
  const managedSalonStaff = managedSalons.map((managedSalon) => {
    const managedSalonId = managedSalon.id || managedSalon._id;
    const fullSalon = salons.find(
      (salon) => String(salon.id || salon._id) === String(managedSalonId)
    );
    const ownerId = managedSalon.ownerId || fullSalon?.ownerId;
    const isOwner = String(ownerId || "") === String(currentUserId || "");
    const adminData = salonAdmins[managedSalonId] || { admins: [] };
    const adminIds = (adminData.admins || []).map((a) => String(a.id || a._id));
    const isAdmin = adminIds.includes(String(currentUserId || ""));
    const resolvedOwnerId = ownerId || getPersonId(adminData.owner);
    const staffEntries = salonStaffById[managedSalonId] || [];

    return {
      ...managedSalon,
      ownerId: resolvedOwnerId,
      isOwner,
      isAdmin,
      adminIds,
      barbers: staffEntries.filter((barber) => {
        const barberId = getPersonId(barber);
        return (
          barber.roleInSalon !== "owner" &&
          String(barberId || "") !== String(resolvedOwnerId || "")
        );
      }),
    };
  });

  return (
    <>
      <ManagedSalonsSection
        currentUserId={currentUserId}
        isSalonSaving={isSalonSaving}
        managedSalonStaff={managedSalonStaff}
        ownerRequests={ownerRequests}
        salonAdmins={salonAdmins}
        onDecideSalonRequest={onDecideSalonRequest}
        onOpenDemoteConfirmation={onOpenDemoteConfirmation}
        onOpenPromoteConfirmation={onOpenPromoteConfirmation}
        onOpenRemoveBarberConfirmation={onOpenRemoveBarberConfirmation}
        onSaveRelationshipType={onSaveRelationshipType}
        onSaveStaffPayment={onSaveStaffPayment}
        savingRelationshipKey={savingRelationshipKey}
        savingPaymentKey={savingPaymentKey}
      />
      <SalonStaffSection
        approvedSalonEntries={approvedSalonEntries}
      />
    </>
  );
}
