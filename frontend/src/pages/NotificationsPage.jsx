import {
  Award,
  Bell,
  Calendar,
  CalendarCheck,
  CheckCheck,
  Info,
  Mail,
  MessageCircle,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";

import api from "@/shared/api/axios";
import { NotificationSkeleton } from "@/shared/components/LoadingSkeletons";
import EmptyState from "@/shared/components/common/EmptyState";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";

// ---------------------------------------------------------------------------
// Type visual config
// ---------------------------------------------------------------------------

const TYPE_CONFIG = {
  booking: {
    icon: Calendar,
    label: "Booking",
    accent: "border-l-blue-400 bg-blue-50/40",
    dot: "bg-blue-500",
  },
  message: {
    icon: MessageCircle,
    label: "Message",
    accent: "border-l-purple-400 bg-purple-50/40",
    dot: "bg-purple-500",
  },
  review: {
    icon: Star,
    label: "Review",
    accent: "border-l-amber-400 bg-amber-50/40",
    dot: "bg-amber-500",
  },
  event: {
    icon: CalendarCheck,
    label: "Event",
    accent: "border-l-teal-400 bg-teal-50/40",
    dot: "bg-teal-500",
  },
  certificate: {
    icon: Award,
    label: "Certificate",
    accent: "border-l-emerald-400 bg-emerald-50/40",
    dot: "bg-emerald-500",
  },
  system: {
    icon: Info,
    label: "System",
    accent: "border-l-slate-400 bg-slate-50/40",
    dot: "bg-slate-500",
  },
};

const FALLBACK_TYPE = {
  icon: Bell,
  label: "Notification",
  accent: "border-l-neutral-400 bg-neutral-50/40",
  dot: "bg-neutral-500",
};

function getTypeConfig(type) {
  return TYPE_CONFIG[type] || FALLBACK_TYPE;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function getGroupLabel(date) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  const startOfWeek = new Date(startOfToday.getTime() - startOfToday.getDay() * 86_400_000);

  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  if (date >= startOfWeek) return "This Week";
  return "Earlier";
}

function formatNotificationDate(date) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (date >= startOfToday) {
    return `Today at ${date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const notificationsCacheByUserId = new Map();

// ---------------------------------------------------------------------------
// Groups component
// ---------------------------------------------------------------------------

function NotificationGroup({ title, notifications, onMarkRead, onDelete }) {
  if (notifications.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        {title}
      </h2>
      <div className="space-y-2">
        {notifications.map((notification) => {
          const TypeConfig = getTypeConfig(notification.type);
          const IconComponent = TypeConfig.icon;
          const createdAt = new Date(notification.createdAt);

          return (
            <Card
              key={notification.id}
              className={cn(
                "overflow-hidden rounded-2xl border shadow-sm transition-colors duration-150 sm:rounded-3xl",
                notification.isRead
                  ? "border-neutral-200 bg-white"
                  : "border-blue-200 bg-blue-50/50",
              )}
            >
              <CardContent className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
                {/* Type icon */}
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    notification.isRead
                      ? "bg-neutral-100 text-neutral-500"
                      : "bg-white text-blue-600 shadow-sm",
                  )}
                >
                  <IconComponent className="h-4 w-4" />
                </div>

                {/* Body */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        notification.isRead
                          ? "bg-neutral-100 text-neutral-500"
                          : "bg-blue-100 text-blue-700",
                      )}
                    >
                      {TypeConfig.label}
                    </span>

                    {!notification.isRead && (
                      <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        New
                      </span>
                    )}
                  </div>

                  <p
                    className={cn(
                      "mt-1.5 text-sm leading-snug",
                      notification.isRead
                        ? "text-neutral-600"
                        : "font-medium text-neutral-900",
                    )}
                  >
                    {notification.message}
                  </p>

                  <p className="mt-1 text-xs text-neutral-400">
                    {formatNotificationDate(createdAt)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                  {!notification.isRead && (
                    <Button
                      aria-label="Mark as read"
                      className="h-8 px-2.5 text-xs sm:h-9 sm:px-3"
                      onClick={() => onMarkRead(notification.id)}
                      size="default"
                      title="Mark as read"
                      variant="outline"
                    >
                      <Mail className="mr-1 h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Read</span>
                    </Button>
                  )}

                  <Button
                    aria-label="Delete notification"
                    className="h-8 px-2.5 text-xs sm:h-9 sm:px-3"
                    onClick={() => onDelete(notification.id)}
                    size="default"
                    title="Delete"
                    variant="ghost"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-neutral-400" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function NotificationsPage() {
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?.id;
  const [notifications, setNotifications] = useState(
    () => notificationsCacheByUserId.get(String(currentUserId)) || [],
  );
  const [isLoading, setIsLoading] = useState(
    () => !notificationsCacheByUserId.has(String(currentUserId)),
  );
  const [error, setError] = useState("");

  // ---- Fetch ----

  const loadNotifications = useCallback(
    async ({ showLoading = false } = {}) => {
      if (!currentUserId) return;

      if (showLoading) {
        setIsLoading(true);
      }
      setError("");

      try {
        const { data } = await api.get("/notifications");
        const nextNotifications = data.map((item) => ({
          ...item,
          id: item.id || item._id,
        }));

        notificationsCacheByUserId.set(String(currentUserId), nextNotifications);
        setNotifications(nextNotifications);
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            "Could not load notifications. Please try again.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [currentUserId],
  );

  useEffect(() => {
    if (!currentUserId) return undefined;

    let isMounted = true;
    let intervalId = null;

    async function safeLoad(options) {
      if (!isMounted) return;
      await loadNotifications(options);
    }

    safeLoad({ showLoading: true });
    intervalId = setInterval(() => safeLoad(), 15000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [currentUserId, loadNotifications]);

  // ---- Actions ----

  const markOneRead = useCallback(
    async (notificationId) => {
      setError("");

      try {
        const { data } = await api.put(`/notifications/${notificationId}/read`);
        const nextNotification = { ...data, id: data.id || data._id };

        setNotifications((current) =>
          current.map((n) =>
            n.id === notificationId ? nextNotification : n,
          ),
        );
        notificationsCacheByUserId.set(
          String(currentUserId),
          notifications.map((n) =>
            n.id === notificationId ? nextNotification : n,
          ),
        );
        window.dispatchEvent(new Event("notifications:updated"));
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            "Could not mark notification as read.",
        );
      }
    },
    [currentUserId, notifications],
  );

  const markAllRead = useCallback(async () => {
    setError("");

    try {
      await api.put("/notifications/read");
      setNotifications((current) =>
        current.map((n) => ({ ...n, isRead: true })),
      );
      notificationsCacheByUserId.set(
        String(currentUserId),
        notifications.map((n) => ({ ...n, isRead: true })),
      );
      window.dispatchEvent(new Event("notifications:updated"));
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not mark notifications as read.",
      );
    }
  }, [currentUserId, notifications]);

  const deleteOne = useCallback(
    async (notificationId) => {
      setError("");

      try {
        await api.delete(`/notifications/${notificationId}`);
        setNotifications((current) =>
          current.filter((n) => n.id !== notificationId),
        );
        notificationsCacheByUserId.set(
          String(currentUserId),
          notifications.filter((n) => n.id !== notificationId),
        );
        window.dispatchEvent(new Event("notifications:updated"));
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            "Could not delete notification.",
        );
      }
    },
    [currentUserId, notifications],
  );

  const clearAll = useCallback(async () => {
    setError("");

    try {
      await api.delete("/notifications/user/all");
      setNotifications([]);
      notificationsCacheByUserId.set(String(currentUserId), []);
      window.dispatchEvent(new Event("notifications:updated"));
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not clear notifications.",
      );
    }
  }, [currentUserId]);

  // ---- Derived state ----

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications],
  );

  const groupedNotifications = useMemo(() => {
    const groups = { Today: [], Yesterday: [], "This Week": [], Earlier: [] };

    for (const n of notifications) {
      const label = getGroupLabel(new Date(n.createdAt));
      groups[label].push(n);
    }

    return groups;
  }, [notifications]);

  const initialLoading = isLoading && notifications.length === 0;
  const refreshing = isLoading && notifications.length > 0;

  // ---- Render ----

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 sm:space-y-6">
      {/* Header */}
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
              onClick={markAllRead}
              variant="outline"
            >
              <CheckCheck className="mr-1.5 h-4 w-4" />
              Mark all read
            </Button>
          )}

          {notifications.length > 0 && (
            <Button
              className="text-xs sm:text-sm"
              onClick={clearAll}
              variant="ghost"
            >
              <Trash2 className="mr-1.5 h-4 w-4 text-neutral-400" />
              Clear all
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{error}</span>
          <Button
            aria-label="Retry loading notifications"
            className="shrink-0"
            onClick={() => loadNotifications({ showLoading: true })}
            size="icon"
            variant="ghost"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Refreshing indicator */}
      {refreshing && (
        <p className="rounded-xl bg-neutral-50 px-3 py-2 text-center text-sm text-neutral-500">
          Refreshing notifications…
        </p>
      )}

      {/* Loading */}
      {initialLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <NotificationSkeleton key={item} />
          ))}
        </div>
      ) : // Empty
      notifications.length === 0 ? (
        !isLoading && (
          <EmptyState
            description="Booking updates, messages, event invites, and system alerts will appear here."
            title={
              <span className="flex items-center justify-center gap-2">
                <Bell className="h-5 w-5 text-neutral-400" />
                No notifications yet
              </span>
            }
          />
        )
      ) : (
        // List with groups
        <div className="space-y-6">
          {groupedNotifications.Today.length > 0 && (
            <NotificationGroup
              notifications={groupedNotifications.Today}
              onDelete={deleteOne}
              onMarkRead={markOneRead}
              title="Today"
            />
          )}

          {groupedNotifications.Yesterday.length > 0 && (
            <NotificationGroup
              notifications={groupedNotifications.Yesterday}
              onDelete={deleteOne}
              onMarkRead={markOneRead}
              title="Yesterday"
            />
          )}

          {groupedNotifications["This Week"].length > 0 && (
            <NotificationGroup
              notifications={groupedNotifications["This Week"]}
              onDelete={deleteOne}
              onMarkRead={markOneRead}
              title="This Week"
            />
          )}

          {groupedNotifications.Earlier.length > 0 && (
            <NotificationGroup
              notifications={groupedNotifications.Earlier}
              onDelete={deleteOne}
              onMarkRead={markOneRead}
              title="Earlier"
            />
          )}
        </div>
      )}
    </div>
  );
}
