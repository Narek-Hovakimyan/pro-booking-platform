import { useEffect } from "react";
import { X } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { removeNotification } from "@/store/slices/notificationsSlice";

const styles = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-neutral-200 bg-white text-neutral-900",
};

function NotificationToast({ notification }) {
  const dispatch = useDispatch();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      dispatch(removeNotification(notification.id));
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [dispatch, notification.id]);

  return (
    <div
      className={cn(
        "flex w-full items-start justify-between gap-3 rounded-2xl border p-4 text-sm shadow-lg sm:w-80",
        styles[notification.type] || styles.info
      )}
    >
      <div>
        <div className="font-semibold">{notification.message}</div>
        <div className="mt-1 text-xs opacity-70">{notification.type}</div>
      </div>

      <Button
        aria-label="Close notification"
        onClick={() => dispatch(removeNotification(notification.id))}
        size="icon"
        variant="ghost"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function Notifications() {
  const notifications = useSelector((state) => state.notifications);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-x-3 top-3 z-50 flex flex-col gap-3 sm:left-auto sm:right-4 sm:top-4">
      {notifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
        />
      ))}
    </div>
  );
}
