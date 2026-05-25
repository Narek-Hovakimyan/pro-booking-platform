import { Check, Eye, Mail, Trash2, XCircle } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import {
  getBookingNotificationAction,
  getEventNotificationAction,
  getJobNotificationAction,
  getNotificationBookingId,
  getNotificationEventRegistrationId,
  getNotificationJobApplicationId,
} from "@/shared/utils/notificationActionHelpers";
import {
  formatNotificationDate,
  getNotificationGroup,
  getTypeConfig,
  getViewDestination,
} from "@/shared/utils/notificationHelpers";

export default function NotificationGroup({
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
