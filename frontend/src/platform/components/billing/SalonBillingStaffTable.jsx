import { CheckCircle2, MinusCircle, Plus, UserPlus, XCircle } from "lucide-react";

import { BillingActionButton } from "./BillingActionButton";
import { Card, CardContent } from "../../../shared/components/ui/card";

export function SalonBillingStaffTable({ acceptedStaff, assignedBarberIds, seats, isPlatformAdmin, subscription, onAssign, onRevoke }) {
  return (
    <Card>
      <CardContent>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Accepted Staff & Seat Assignments</h2>
          {isPlatformAdmin && subscription && (
            <div className="flex flex-wrap gap-2">
              <BillingActionButton icon={UserPlus} label="Assign seat" onClick={() => onAssign({})} variant="outline" />
            </div>
          )}
        </div>
        {acceptedStaff.length === 0 ? (
          <p className="text-sm text-neutral-400">No accepted staff members.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-3 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              <div className="col-span-4">Name</div>
              <div className="col-span-3">Email</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-3">Seat Status</div>
            </div>
            {acceptedStaff.map((staff) => {
              const hasSeat = assignedBarberIds.has(String(staff.id));
              return (
                <div key={staff.id} className="grid grid-cols-12 gap-3 rounded-xl border border-neutral-100 px-3 py-2.5 text-sm">
                  <div className="col-span-4 flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-600">
                      {staff.name ? staff.name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase() : "?"}
                    </div>
                    <span className="truncate font-medium text-neutral-900">{staff.name || "Unnamed"}</span>
                  </div>
                  <div className="col-span-3 truncate text-neutral-500">{staff.email || "—"}</div>
                  <div className="col-span-2 text-neutral-500">{staff.barberType || staff.profession || "—"}</div>
                  <div className="col-span-3 flex items-center gap-2">
                    {hasSeat ? (
                      <>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Seat assigned
                        </span>
                        {isPlatformAdmin && (
                          <button onClick={() => onRevoke({ barberId: staff.id, barberName: staff.name })} className="rounded-lg p-1 text-red-400 transition hover:bg-red-50 hover:text-red-600" title="Revoke seat" type="button">
                            <MinusCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1 text-xs text-neutral-400"><XCircle className="h-3 w-3" /> No seat</span>
                        {isPlatformAdmin && seats?.available > 0 && (
                          <button onClick={() => onAssign({ barberId: staff.id, barberName: staff.name })} className="rounded-lg p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700" title="Assign seat" type="button">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
