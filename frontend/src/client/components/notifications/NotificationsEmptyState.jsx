import { Bell } from "lucide-react";

import EmptyState from "@/shared/components/common/EmptyState";

export default function NotificationsEmptyState() {
  return (
    <EmptyState
      description="Booking updates, messages, event invites, and system alerts will appear here."
      title={
        <span className="flex items-center justify-center gap-2">
          <Bell className="h-5 w-5 text-neutral-400" />
          No notifications yet
        </span>
      }
    />
  );
}
