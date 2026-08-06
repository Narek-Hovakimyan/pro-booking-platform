import { Link } from "react-router-dom";

import EmptyState from "@/shared/components/common/EmptyState";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import ScheduleSkeleton from "@/barber/components/ScheduleSkeleton";
import PersonalScheduleView from "@/barber/components/schedule/PersonalScheduleView";

export default function ScheduleManagerEmptyStates({
  state,
  currentUserId,
  onOpenDrawer,
}) {
  if (state === "loading") {
    return <ScheduleSkeleton />;
  }

  if (state === "personal_schedule") {
    return <PersonalScheduleView currentUserId={currentUserId} />;
  }

  if (state === "no_salons") {
    return (
      <Card className="rounded-3xl border-purple-100 shadow-lg shadow-purple-100/40 lg:col-span-3">
        <CardContent className="space-y-5 p-4 sm:p-6">
          <h2 className="text-xl font-bold sm:text-2xl">Schedule</h2>
          <EmptyState
            title="No salons available for schedule management"
            description="Schedule is salon-based. Create your salon or join an existing salon to start managing working hours."
            action={
              <Button
                as={Link}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-md shadow-purple-200 hover:from-purple-700 hover:to-pink-600 sm:w-auto"
                to="/admin/settings/salon"
              >
                Create or join a salon
              </Button>
            }
          >
            <p className="mt-2 text-sm text-neutral-500">
              After approval, schedule controls will appear automatically.
            </p>
          </EmptyState>
        </CardContent>
      </Card>
    );
  }

  if (state === "no_selection") {
    return (
      <Card className="rounded-3xl border-purple-100 shadow-lg shadow-purple-100/40 lg:col-span-3">
        <CardContent className="space-y-5 p-4 sm:p-6">
          <h2 className="text-xl font-bold sm:text-2xl">Schedule</h2>
          <p className="text-neutral-500">
            Please select a salon to manage schedule.
          </p>
          <Button
            className="w-full border-purple-200 text-purple-700 hover:bg-purple-50 sm:w-auto"
            onClick={onOpenDrawer}
            variant="outline"
          >
            Select Salon
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state === "no_schedule") {
    return (
      <Card className="rounded-3xl border-purple-100 shadow-lg shadow-purple-100/40">
        <CardContent className="p-4 sm:p-6">
          <EmptyState
            title="No schedule configured yet"
            description="Set your working hours to start accepting bookings."
          />
        </CardContent>
      </Card>
    );
  }

  return null;
}
