import ManagedSalonsSection from "@/barber/components/settings/ManagedSalonsSection";
import SalonStaffSection from "@/barber/components/settings/SalonStaffSection";

export default function TeamSettingsSection({
  approvedSalonEntries,
  currentUserId,
  isSalonSaving,
  managedSalons,
  ownerRequests,
  salonAdmins,
  salons,
  onDecideSalonRequest,
  onOpenDemoteConfirmation,
  onOpenPromoteConfirmation,
  onOpenRemoveBarberConfirmation,
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

    return {
      ...managedSalon,
      ownerId,
      isOwner,
      isAdmin,
      adminIds,
      barbers: fullSalon?.barbers || [],
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
      />
      <SalonStaffSection
        approvedSalonEntries={approvedSalonEntries}
      />
    </>
  );
}
