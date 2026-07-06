import { Bell } from "lucide-react";

import EmptyState from "@/shared/components/common/EmptyState";

export default function NotificationsEmptyState() {
  return (
    <EmptyState
      className="border-brand-100 bg-white p-8 text-center shadow-card"
      description="Booking updates, messages, event invites, and system alerts will appear here."
      title={
        <span className="flex flex-col items-center justify-center gap-3 text-neutral-900 sm:flex-row">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Bell className="h-5 w-5" />
          </span>
          No notifications yet
        </span>
      }
    />
  );
}
