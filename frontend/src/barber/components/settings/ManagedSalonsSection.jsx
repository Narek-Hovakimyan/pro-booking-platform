import SettingsCard from "@/barber/components/settings/SettingsCard";
import { Button } from "@/shared/components/ui/button";
import { getMediaUrl } from "@/shared/utils/media";

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
}) {
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

                    return (
                      <div
                        className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 p-2"
                        key={barberId}
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
                          {isBarberAdmin && (
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                              Admin
                            </span>
                          )}
                        </div>

                        <div className="flex gap-2">
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
                                onOpenRemoveBarberConfirmation(managedSalon, barber)
                              }
                              size="sm"
                              variant="outline"
                            >
                              Remove
                            </Button>
                          )}
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
