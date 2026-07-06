import { Bell, CheckCheck, Trash2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

export default function NotificationsHeader({
  hasNotifications,
  onClearAll,
  onMarkAllRead,
  unreadCount,
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <Bell className="h-6 w-6" />
          Notifications
        </h1>
        <p className="mt-1.5 text-sm text-neutral-500">
          Booking updates, messages, event invites, and system alerts.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {unreadCount > 0 && (
          <Button
            className="text-xs sm:text-sm"
            onClick={onMarkAllRead}
            variant="outline"
          >
            <CheckCheck className="mr-1.5 h-4 w-4" />
            Mark all read
          </Button>
        )}

        {hasNotifications && (
          <Button
            className="text-xs sm:text-sm"
            onClick={onClearAll}
            variant="ghost"
          >
            <Trash2 className="mr-1.5 h-4 w-4 text-neutral-400" />
            Clear all
          </Button>
        )}
      </div>
    </div>
  );
}
