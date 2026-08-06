import { Minus, UserPlus } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
  getPersonId,
  getPersonName,
} from "../../utils/salonBillingFormatters";

export function AssignSeatCard({
  assignableMembers,
  availableSeatCount,
  selectedMemberId,
  setSelectedMemberId,
  subscriptionIsActive,
  canAssignSeat,
  onAssignSeat,
}) {
  return (
    <Card className="rounded-3xl border-white/80 bg-white/95 shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-violet-500" />
          <h2 className="font-semibold text-neutral-950">Assign seat</h2>
        </div>
        <select
          className="h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
          disabled={assignableMembers.length === 0 || availableSeatCount <= 0}
          onChange={(event) => setSelectedMemberId(event.target.value)}
          value={selectedMemberId}
        >
          <option value="">
            {availableSeatCount <= 0
              ? subscriptionIsActive
                ? "No available seats"
                : "Renew subscription to assign seats"
              : "Choose approved member"}
          </option>
          {assignableMembers.map((member) => (
            <option key={getPersonId(member)} value={getPersonId(member)}>
              {getPersonName(member)}
            </option>
          ))}
        </select>
        <Button
          className="w-full gap-2 rounded-2xl"
          disabled={!canAssignSeat}
          onClick={onAssignSeat}
        >
          <UserPlus className="h-4 w-4" />
          Assign seat
        </Button>
        {(!subscriptionIsActive || availableSeatCount <= 0) && (
          <p className="flex items-center gap-1.5 text-xs text-neutral-500">
            <Minus className="h-3.5 w-3.5" />
            {subscriptionIsActive
              ? "Prepare payment or activate more paid seats first."
              : "Renew the subscription before assigning seats."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
