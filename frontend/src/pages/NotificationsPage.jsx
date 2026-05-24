import {
  Award,
  Bell,
  Calendar,
  CalendarCheck,
  Check,
  CheckCheck,
  Eye,
  Info,
  Mail,
  MessageCircle,
  RefreshCw,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import RejectBookingModal from "@/barber/components/RejectBookingModal";
import api from "@/shared/api/axios";
import { NotificationSkeleton } from "@/shared/components/LoadingSkeletons";
import EmptyState from "@/shared/components/common/EmptyState";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import {
  fetchBarberBookings,
  updateBooking,
} from "@/store/slices/bookingsSlice";

// ---------------------------------------------------------------------------
// Notification type grouping
// ---------------------------------------------------------------------------

function getNotificationGroup(rawType) {
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

function getViewDestination(group, currentUser, rawType) {
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

const TYPE_CONFIG = {
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
// Booking action helpers
// ---------------------------------------------------------------------------

function getIdString(value) {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
}

function getNotificationBookingId(notification) {
  return getIdString(notification?.data?.bookingId);
}

function getBookingId(booking) {
  return getIdString(booking?.id || booking?._id);
}

function getBookingNotificationAction(notification, booking, currentUser) {
  if (currentUser?.role !== "barber") return null;
  if (!getNotificationBookingId(notification) || !booking) return null;

  if (notification.type === "booking_created" && booking.status === "pending") {
    return {
      primaryAction: "accept-booking",
      primaryLabel: "Accept",
      secondaryAction: "reject-booking",
      secondaryLabel: "Reject",
    };
  }

  if (
    notification.type === "booking_reschedule_requested" &&
    booking.rescheduleRequest?.status === "pending"
  ) {
    return {
      primaryAction: "accept-reschedule",
      primaryLabel: "Approve",
      secondaryAction: "reject-reschedule",
      secondaryLabel: "Reject",
    };
  }

  return null;
}

function getNotificationEventId(notification) {
  return getIdString(notification?.data?.eventId);
}

function getNotificationEventRegistrationId(notification) {
  return getIdString(notification?.data?.eventRegistrationId);
}

function getEventRegistrationId(registration) {
  return getIdString(registration?.id || registration?._id);
}

function getEventNotificationAction(notification, registration, currentUser) {
  if (currentUser?.role !== "barber") return null;
  if (!getNotificationEventId(notification) || !getNotificationEventRegistrationId(notification)) return null;
  if (!registration) return null;
  if (!["pending", "waitlisted"].includes(registration.status)) return null;

  if (notification.type === "event_registration_request") {
    return {
      primaryAction: "approve-event-registration",
      primaryLabel: "Approve",
      secondaryAction: "reject-event-registration",
      secondaryLabel: "Reject",
    };
  }

  return null;
}

function getNotificationJobApplicationId(notification) {
  return getIdString(notification?.data?.jobApplicationId);
}

function getJobApplicationId(application) {
  return getIdString(application?.id || application?._id);
}

function getJobNotificationAction(notification, application, currentUser) {
  if (currentUser?.role !== "barber") return null;
  if (notification.type !== "salon_job_application_submitted") return null;
  if (!getNotificationJobApplicationId(notification) || !application) return null;
  if (!["pending", "reviewed"].includes(application.status)) return null;

  return {
    primaryAction: "accept-job-application",
    primaryLabel: "Accept",
    secondaryAction: "reject-job-application",
    secondaryLabel: "Reject",
  };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const notificationsCacheByUserId = new Map();

// ---------------------------------------------------------------------------
// Groups component
// ---------------------------------------------------------------------------

function NotificationGroup({
  title,
  notifications,
  currentUser,
  bookingById,
  eventRegistrationById,
  jobApplicationById,
  activeAction,
  onBookingAction,
  onEventAction,
  onJobAction,
  onView,
  onMarkRead,
  onDelete,
}) {
  if (notifications.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        {title}
      </h2>
      <div className="space-y-2">
        {notifications.map((notification) => {
          const group = getNotificationGroup(notification.type);
          const TypeConfig = getTypeConfig(group);
          const IconComponent = TypeConfig.icon;
          const createdAt = new Date(notification.createdAt);
          const viewDestination = getViewDestination(
            group,
            currentUser,
            notification.type,
          );
          const bookingId = getNotificationBookingId(notification);
          const targetBooking = bookingId ? bookingById.get(bookingId) : null;
          const bookingAction = getBookingNotificationAction(
            notification,
            targetBooking,
            currentUser,
          );
          const eventRegistrationId = getNotificationEventRegistrationId(notification);
          const targetEventRegistration = eventRegistrationId
            ? eventRegistrationById.get(eventRegistrationId)
            : null;
          const eventAction = getEventNotificationAction(
            notification,
            targetEventRegistration,
            currentUser,
          );
          const jobApplicationId = getNotificationJobApplicationId(notification);
          const targetJobApplication = jobApplicationId
            ? jobApplicationById.get(jobApplicationId)
            : null;
          const jobAction = getJobNotificationAction(
            notification,
            targetJobApplication,
            currentUser,
          );
          const isActionPending = activeAction?.notificationId === notification.id;
          const isSameNotificationPending =
            activeAction?.notificationId === notification.id;

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
                  {jobAction && (
                    <>
                      <Button
                        aria-label={jobAction.primaryLabel}
                        className="h-8 px-2.5 text-xs sm:h-9 sm:px-3"
                        disabled={Boolean(activeAction)}
                        onClick={() =>
                          onJobAction(
                            notification,
                            targetJobApplication,
                            jobAction.primaryAction,
                          )
                        }
                        size="default"
                        title={jobAction.primaryLabel}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                          {isActionPending &&
                          activeAction?.action === jobAction.primaryAction
                            ? "Working..."
                            : jobAction.primaryLabel}
                        </span>
                      </Button>
                      <Button
                        aria-label={jobAction.secondaryLabel}
                        className="h-8 px-2.5 text-xs sm:h-9 sm:px-3"
                        disabled={Boolean(activeAction)}
                        onClick={() =>
                          onJobAction(
                            notification,
                            targetJobApplication,
                            jobAction.secondaryAction,
                          )
                        }
                        size="default"
                        title={jobAction.secondaryLabel}
                        variant="outline"
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                          {isActionPending &&
                          activeAction?.action === jobAction.secondaryAction
                            ? "Working..."
                            : jobAction.secondaryLabel}
                        </span>
                      </Button>
                    </>
                  )}

                  {eventAction && (
                    <>
                      <Button
                        aria-label={eventAction.primaryLabel}
                        className="h-8 px-2.5 text-xs sm:h-9 sm:px-3"
                        disabled={Boolean(activeAction)}
                        onClick={() =>
                          onEventAction(
                            notification,
                            eventAction.primaryAction,
                          )
                        }
                        size="default"
                        title={eventAction.primaryLabel}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                          {isActionPending &&
                          activeAction?.action === eventAction.primaryAction
                            ? "Working..."
                            : eventAction.primaryLabel}
                        </span>
                      </Button>
                      <Button
                        aria-label={eventAction.secondaryLabel}
                        className="h-8 px-2.5 text-xs sm:h-9 sm:px-3"
                        disabled={Boolean(activeAction)}
                        onClick={() =>
                          onEventAction(
                            notification,
                            eventAction.secondaryAction,
                          )
                        }
                        size="default"
                        title={eventAction.secondaryLabel}
                        variant="outline"
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                          {isActionPending &&
                          activeAction?.action === eventAction.secondaryAction
                            ? "Working..."
                            : eventAction.secondaryLabel}
                        </span>
                      </Button>
                    </>
                  )}

                  {bookingAction && (
                    <>
                      <Button
                        aria-label={bookingAction.primaryLabel}
                        className="h-8 px-2.5 text-xs sm:h-9 sm:px-3"
                        disabled={Boolean(activeAction)}
                        onClick={() =>
                          onBookingAction(
                            notification,
                            targetBooking,
                            bookingAction.primaryAction,
                          )
                        }
                        size="default"
                        title={bookingAction.primaryLabel}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                          {isActionPending &&
                          activeAction?.action === bookingAction.primaryAction
                            ? "Working..."
                            : bookingAction.primaryLabel}
                        </span>
                      </Button>
                      <Button
                        aria-label={bookingAction.secondaryLabel}
                        className="h-8 px-2.5 text-xs sm:h-9 sm:px-3"
                        disabled={Boolean(activeAction)}
                        onClick={() =>
                          onBookingAction(
                            notification,
                            targetBooking,
                            bookingAction.secondaryAction,
                          )
                        }
                        size="default"
                        title={bookingAction.secondaryLabel}
                        variant="outline"
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                          {isActionPending &&
                          activeAction?.action === bookingAction.secondaryAction
                            ? "Working..."
                            : bookingAction.secondaryLabel}
                        </span>
                      </Button>
                    </>
                  )}

                  {viewDestination && (
                    <Button
                      aria-label="View"
                      className="h-8 px-2.5 text-xs sm:h-9 sm:px-3"
                      disabled={isSameNotificationPending}
                      onClick={() => onView(notification, viewDestination)}
                      size="default"
                      title="View"
                      variant="outline"
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      <span className="hidden sm:inline">View</span>
                    </Button>
                  )}

                  {!notification.isRead && (
                    <Button
                      aria-label="Mark as read"
                      className="h-8 px-2.5 text-xs sm:h-9 sm:px-3"
                      disabled={isSameNotificationPending}
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
                    disabled={isSameNotificationPending}
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
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currentUser } = useSelector((state) => state.auth);
  const bookings = useSelector((state) => state.bookings || []);
  const currentUserId = getIdString(currentUser?.id || currentUser?._id);
  const [notifications, setNotifications] = useState(
    () => notificationsCacheByUserId.get(String(currentUserId)) || [],
  );
  const [isLoading, setIsLoading] = useState(
    () => !notificationsCacheByUserId.has(String(currentUserId)),
  );
  const [error, setError] = useState("");
  const [activeAction, setActiveAction] = useState(null);
  const [rejectingAction, setRejectingAction] = useState(null);
  const [rejectionError, setRejectionError] = useState("");
  const [eventRegistrations, setEventRegistrations] = useState([]);
  const [managedJobApplications, setManagedJobApplications] = useState([]);

  const actionableNotificationCount = useMemo(
    () =>
      notifications.filter(
        (notification) =>
          (notification.type === "booking_created" ||
            notification.type === "booking_reschedule_requested") &&
          getNotificationBookingId(notification),
      ).length,
    [notifications],
  );

  const jobActionableNotificationCount = useMemo(
    () =>
      notifications.filter(
        (notification) =>
          notification.type === "salon_job_application_submitted" &&
          getNotificationJobApplicationId(notification),
      ).length,
    [notifications],
  );

  const eventActionableEventIds = useMemo(() => {
    const eventIds = new Set();

    notifications.forEach((notification) => {
      if (
        notification.type === "event_registration_request" &&
        getNotificationEventId(notification) &&
        getNotificationEventRegistrationId(notification)
      ) {
        eventIds.add(getNotificationEventId(notification));
      }
    });

    return [...eventIds];
  }, [notifications]);

  const bookingById = useMemo(() => {
    const nextMap = new Map();

    if (currentUser?.role !== "barber" || !currentUserId) return nextMap;

    bookings.forEach((booking) => {
      const bookingId = getBookingId(booking);
      const barberId = getIdString(booking?.barberId || booking?.barber);

      if (bookingId && barberId === currentUserId) {
        nextMap.set(bookingId, booking);
      }
    });

    return nextMap;
  }, [bookings, currentUser?.role, currentUserId]);

  const eventRegistrationById = useMemo(() => {
    const nextMap = new Map();

    eventRegistrations.forEach((registration) => {
      const registrationId = getEventRegistrationId(registration);

      if (registrationId) {
        nextMap.set(registrationId, registration);
      }
    });

    return nextMap;
  }, [eventRegistrations]);

  const jobApplicationById = useMemo(() => {
    const nextMap = new Map();

    managedJobApplications.forEach((application) => {
      const applicationId = getJobApplicationId(application);

      if (applicationId) {
        nextMap.set(applicationId, application);
      }
    });

    return nextMap;
  }, [managedJobApplications]);

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

  useEffect(() => {
    if (
      currentUser?.role !== "barber" ||
      !currentUserId ||
      actionableNotificationCount === 0
    ) {
      return undefined;
    }

    let isMounted = true;

    dispatch(fetchBarberBookings(currentUserId)).catch((requestError) => {
      if (!isMounted) return;
      setError(
        requestError.response?.data?.message ||
          "Could not load bookings for notification actions.",
      );
    });

    return () => {
      isMounted = false;
    };
  }, [actionableNotificationCount, currentUser?.role, currentUserId, dispatch]);

  useEffect(() => {
    if (
      currentUser?.role !== "barber" ||
      !currentUserId ||
      eventActionableEventIds.length === 0
    ) {
      return undefined;
    }

    let isMounted = true;

    async function loadEventRegistrations() {
      try {
        const responses = await Promise.all(
          eventActionableEventIds.map((eventId) =>
            api.get(`/events/${eventId}/registrations`)
          )
        );
        const nextRegistrations = responses.flatMap((response) =>
          Array.isArray(response.data) ? response.data : []
        );

        if (isMounted) {
          setEventRegistrations(nextRegistrations);
        }
      } catch (requestError) {
        if (!isMounted) return;

        setEventRegistrations([]);
        setError(
          requestError.response?.data?.message ||
            "Could not load event registrations for notification actions.",
        );
      }
    }

    loadEventRegistrations();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.role, currentUserId, eventActionableEventIds]);

  useEffect(() => {
    if (
      currentUser?.role !== "barber" ||
      !currentUserId ||
      jobActionableNotificationCount === 0
    ) {
      return undefined;
    }

    let isMounted = true;

    async function loadManagedJobApplications() {
      try {
        const { data } = await api.get("/salon-jobs/applications/managed");

        if (isMounted) {
          setManagedJobApplications(Array.isArray(data) ? data : []);
        }
      } catch (requestError) {
        if (!isMounted) return;

        setManagedJobApplications([]);
        setError(
          requestError.response?.data?.message ||
            "Could not load job applications for notification actions.",
        );
      }
    }

    loadManagedJobApplications();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.role, currentUserId, jobActionableNotificationCount]);

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

  const refreshBarberBookings = useCallback(async () => {
    if (currentUser?.role !== "barber" || !currentUserId) return;
    await dispatch(fetchBarberBookings(currentUserId));
  }, [currentUser?.role, currentUserId, dispatch]);

  const finishBookingAction = useCallback(
    async (notification, updatedBooking) => {
      dispatch(updateBooking(updatedBooking));

      if (!notification.isRead) {
        await markOneRead(notification.id);
      }

      await refreshBarberBookings();
    },
    [dispatch, markOneRead, refreshBarberBookings],
  );

  const handleBookingAction = useCallback(
    async (notification, booking, action) => {
      if (activeAction) return;

      const bookingId = getBookingId(booking) || getNotificationBookingId(notification);
      if (!bookingId) return;

      if (action === "reject-booking") {
        setRejectingAction({ notification, booking });
        setRejectionError("");
        setError("");
        return;
      }

      setError("");
      setActiveAction({ notificationId: notification.id, action });

      try {
        let response;

        if (action === "accept-booking") {
          response = await api.put(`/bookings/${bookingId}`, { status: "accepted" });
        } else if (action === "accept-reschedule") {
          response = await api.patch(
            `/bookings/${bookingId}/reschedule-request/accept`,
            {},
          );
        } else if (action === "reject-reschedule") {
          response = await api.patch(
            `/bookings/${bookingId}/reschedule-request/reject`,
            {},
          );
        } else {
          return;
        }

        await finishBookingAction(notification, response.data);
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            "Could not update booking. Please try again.",
        );
      } finally {
        setActiveAction(null);
      }
    },
    [activeAction, finishBookingAction],
  );

  const rejectBookingFromNotification = useCallback(
    async ({ rejectionReason }) => {
      if (!rejectingAction || activeAction) return;

      const { notification, booking } = rejectingAction;
      const bookingId = getBookingId(booking) || getNotificationBookingId(notification);
      if (!bookingId) return;

      setRejectionError("");
      setActiveAction({ notificationId: notification.id, action: "reject-booking" });

      try {
        const { data } = await api.put(`/bookings/${bookingId}`, {
          status: "rejected",
          rejectionReason,
        });

        await finishBookingAction(notification, data);
        setRejectingAction(null);
      } catch (requestError) {
        setRejectionError(
          requestError.response?.data?.message ||
            "Could not reject booking. Please try again.",
        );
      } finally {
        setActiveAction(null);
      }
    },
    [activeAction, finishBookingAction, rejectingAction],
  );

  const handleEventAction = useCallback(
    async (notification, action) => {
      if (activeAction) return;

      const eventId = getNotificationEventId(notification);
      const eventRegistrationId = getNotificationEventRegistrationId(notification);
      if (!eventId || !eventRegistrationId) return;

      setError("");
      setActiveAction({ notificationId: notification.id, action });

      try {
        let response;

        if (action === "approve-event-registration") {
          response = await api.patch(
            `/events/${eventId}/registrations/${eventRegistrationId}/approve`,
            {},
          );
        } else if (action === "reject-event-registration") {
          response = await api.patch(
            `/events/${eventId}/registrations/${eventRegistrationId}/reject`,
            {},
          );
        } else {
          return;
        }

        const nextRegistration =
          response.data?.registration ||
          {
            _id: eventRegistrationId,
            status:
              action === "approve-event-registration" ? "approved" : "rejected",
          };

        setEventRegistrations((currentRegistrations) =>
          currentRegistrations.map((registration) =>
            getEventRegistrationId(registration) === eventRegistrationId
              ? { ...registration, ...nextRegistration }
              : registration,
          ),
        );

        if (!notification.isRead) {
          await markOneRead(notification.id);
        }

        await loadNotifications();
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            "Could not process event registration. Please try again.",
        );
      } finally {
        setActiveAction(null);
      }
    },
    [activeAction, markOneRead, loadNotifications],
  );

  const handleJobAction = useCallback(
    async (notification, application, action) => {
      if (activeAction) return;

      const applicationId =
        getJobApplicationId(application) ||
        getNotificationJobApplicationId(notification);
      if (!applicationId) return;

      const status =
        action === "accept-job-application"
          ? "accepted"
          : action === "reject-job-application"
            ? "rejected"
            : "";

      if (!status) return;

      setError("");
      setActiveAction({ notificationId: notification.id, action });

      try {
        const { data } = await api.patch(
          `/salon-jobs/applications/${applicationId}/status`,
          { status },
        );
        const nextApplication = data || { ...application, status };

        setManagedJobApplications((currentApplications) =>
          currentApplications.map((currentApplication) =>
            getJobApplicationId(currentApplication) === applicationId
              ? nextApplication
              : currentApplication,
          ),
        );

        if (!notification.isRead) {
          await markOneRead(notification.id);
        }

        await loadNotifications();
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ||
            "Could not update job application. Please try again.",
        );
      } finally {
        setActiveAction(null);
      }
    },
    [activeAction, markOneRead, loadNotifications],
  );

  // ---- Navigation ----

  const handleView = useCallback(
    async (notification, destination) => {
      if (!notification.isRead) {
        await markOneRead(notification.id);
      }
      navigate(destination);
    },
    [markOneRead, navigate],
  );

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
              currentUser={currentUser}
              activeAction={activeAction}
              bookingById={bookingById}
              eventRegistrationById={eventRegistrationById}
              jobApplicationById={jobApplicationById}
              notifications={groupedNotifications.Today}
              onBookingAction={handleBookingAction}
              onEventAction={handleEventAction}
              onJobAction={handleJobAction}
              onDelete={deleteOne}
              onMarkRead={markOneRead}
              onView={handleView}
              title="Today"
            />
          )}

          {groupedNotifications.Yesterday.length > 0 && (
            <NotificationGroup
              currentUser={currentUser}
              activeAction={activeAction}
              bookingById={bookingById}
              eventRegistrationById={eventRegistrationById}
              jobApplicationById={jobApplicationById}
              notifications={groupedNotifications.Yesterday}
              onBookingAction={handleBookingAction}
              onEventAction={handleEventAction}
              onJobAction={handleJobAction}
              onDelete={deleteOne}
              onMarkRead={markOneRead}
              onView={handleView}
              title="Yesterday"
            />
          )}

          {groupedNotifications["This Week"].length > 0 && (
            <NotificationGroup
              currentUser={currentUser}
              activeAction={activeAction}
              bookingById={bookingById}
              eventRegistrationById={eventRegistrationById}
              jobApplicationById={jobApplicationById}
              notifications={groupedNotifications["This Week"]}
              onBookingAction={handleBookingAction}
              onEventAction={handleEventAction}
              onJobAction={handleJobAction}
              onDelete={deleteOne}
              onMarkRead={markOneRead}
              onView={handleView}
              title="This Week"
            />
          )}

          {groupedNotifications.Earlier.length > 0 && (
            <NotificationGroup
              currentUser={currentUser}
              activeAction={activeAction}
              bookingById={bookingById}
              eventRegistrationById={eventRegistrationById}
              jobApplicationById={jobApplicationById}
              notifications={groupedNotifications.Earlier}
              onBookingAction={handleBookingAction}
              onEventAction={handleEventAction}
              onJobAction={handleJobAction}
              onDelete={deleteOne}
              onMarkRead={markOneRead}
              onView={handleView}
              title="Earlier"
            />
          )}
        </div>
      )}

      {rejectingAction && (
        <RejectBookingModal
          booking={{
            ...rejectingAction.booking,
            clientName:
              rejectingAction.booking?.client?.name ||
              rejectingAction.booking?.clientName,
          }}
          error={rejectionError}
          isSubmitting={
            activeAction?.notificationId === rejectingAction.notification.id &&
            activeAction?.action === "reject-booking"
          }
          onClose={() => {
            if (activeAction) return;
            setRejectingAction(null);
            setRejectionError("");
          }}
          onSubmit={rejectBookingFromNotification}
        />
      )}
    </div>
  );
}
