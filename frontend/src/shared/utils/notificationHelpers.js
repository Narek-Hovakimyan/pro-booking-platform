import {
  Award,
  Bell,
  Calendar,
  CalendarCheck,
  Info,
  MessageCircle,
  RefreshCw,
  Star,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Notification type grouping
// ---------------------------------------------------------------------------

export function getNotificationGroup(rawType) {
  if (!rawType) return "system";

  if (
    rawType.startsWith("booking_reminder_") ||
    rawType.startsWith("booking_expired") ||
    [
      "booking_created",
      "booking_accepted",
      "booking_rejected",
      "booking_cancelled",
      "booking_delayed",
      "booking_no_show",
      "booking_late_cancelled",
    ].includes(rawType)
  ) {
    return "booking";
  }

  if (
    [
      "booking_reschedule_requested",
      "booking_reschedule_accepted",
      "booking_reschedule_rejected",
    ].includes(rawType)
  ) {
    return "reschedule";
  }

  if (rawType.startsWith("event_certificate_")) {
    return "certificate";
  }

  if (rawType.startsWith("event_")) {
    return "event";
  }

  if (rawType.startsWith("salon_job_")) {
    return "job";
  }

  // message, review, and others fall back to their raw type or system
  return rawType;
}

// ---------------------------------------------------------------------------
// Destination helpers
// ---------------------------------------------------------------------------

export function getViewDestination(group, currentUser, rawType) {
  if (group === "booking" || group === "reschedule") {
    return currentUser?.role === "barber" ? "/admin/bookings" : "/my-bookings";
  }

  if (rawType === "salon_job_application_status") {
    return "/jobs/applications";
  }

  if (rawType === "salon_job_application_submitted") {
    return "/admin/jobs";
  }

  if (group === "job") {
    return "/jobs/applications";
  }

  if (group === "event") {
    return "/events";
  }

  if (group === "certificate") {
    return currentUser?.role === "barber" ? "/admin/settings/certifications" : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Type visual config
// ---------------------------------------------------------------------------

export const TYPE_CONFIG = {
  booking: {
    icon: Calendar,
    label: "Booking",
    accent: "border-l-blue-400 bg-blue-50/40",
    dot: "bg-blue-500",
  },
  reschedule: {
    icon: RefreshCw,
    label: "Reschedule",
    accent: "border-l-orange-400 bg-orange-50/40",
    dot: "bg-orange-500",
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
  job: {
    icon: Star,
    label: "Job",
    accent: "border-l-violet-400 bg-violet-50/40",
    dot: "bg-violet-500",
  },
  system: {
    icon: Info,
    label: "System",
    accent: "border-l-slate-400 bg-slate-50/40",
    dot: "bg-slate-500",
  },
};

export const FALLBACK_TYPE = {
  icon: Bell,
  label: "Notification",
  accent: "border-l-neutral-400 bg-neutral-50/40",
  dot: "bg-neutral-500",
};

export function getTypeConfig(type) {
  return TYPE_CONFIG[type] || FALLBACK_TYPE;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function getGroupLabel(date) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  const dayOfWeek = startOfToday.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(startOfToday.getTime() - mondayOffset * 86_400_000);

  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  if (date >= startOfWeek) return "This Week";
  return "Earlier";
}

export function formatNotificationDate(date) {
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
