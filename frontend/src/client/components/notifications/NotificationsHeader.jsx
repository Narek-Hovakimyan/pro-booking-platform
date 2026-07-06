import { Bell, CheckCheck, Trash2 } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

export default function NotificationsHeader({
  hasNotifications,
  onClearAll,
  onMarkAllRead,
  unreadCount,
}) {
  return (
    <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Bell className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <span className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">
            Booking updates, messages, event invites, and system alerts.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
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
              className="text-xs text-neutral-600 hover:text-red-600 sm:text-sm"
              onClick={onClearAll}
              variant="ghost"
            >
              <Trash2 className="mr-1.5 h-4 w-4 text-neutral-400" />
              Clear all
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
