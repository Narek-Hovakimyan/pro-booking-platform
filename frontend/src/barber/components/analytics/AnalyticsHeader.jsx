import { Calendar, Users, Bell } from "lucide-react";

export default function AnalyticsHeader({
  todayDateLabel,
  primarySalon,
  unreadNotifications,
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          Dashboard
        </h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Manage today's bookings, pending requests, services, and schedule.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {todayDateLabel}
          </span>
          {primarySalon && (
            <span className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">
              <Users className="h-3 w-3" />
              {primarySalon?.name || primarySalon?.salonName || "Salon"}
            </span>
          )}
          {unreadNotifications > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">
              <Bell className="h-3 w-3" />
              {unreadNotifications} unread
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
