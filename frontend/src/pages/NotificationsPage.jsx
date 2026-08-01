import { useSelector } from "react-redux";

import RejectBookingModal from "@/barber/components/RejectBookingModal";
import NotificationsEmptyState from "@/client/components/notifications/NotificationsEmptyState";
import NotificationsHeader from "@/client/components/notifications/NotificationsHeader";
import NotificationsList from "@/client/components/notifications/NotificationsList";
import NotificationsStatus from "@/client/components/notifications/NotificationsStatus";
import { Container } from "@/shared/components/ui/Container";
import { getIdString } from "@/shared/utils/notificationActionHelpers";
import {
  clearNotificationsCacheForTests,
  getNotificationsCacheForTests,
  useNotificationsPageController,
} from "./useNotificationsPageController";

export default function NotificationsPage() {
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = getIdString(currentUser?.id || currentUser?._id);

  return (
    <NotificationsPageContent
      key={currentUserId || "anonymous"}
      currentUser={currentUser}
      currentUserId={currentUserId}
    />
  );
}

function NotificationsPageContent({ currentUser, currentUserId }) {
  const {
    activeAction,
    bookingById,
    clearAll,
    currentUser: controllerUser,
    deleteOne,
    error,
    eventRegistrationById,
    groupedNotifications,
    handleBookingAction,
    handleEventAction,
    handleJobAction,
    handleView,
    initialLoading,
    isClearingAll,
    isLoading,
    isMarkingAllRead,
    jobApplicationById,
    loadNotifications,
    markAllRead,
    markOneRead,
    notifications,
    rejectionError,
    rejectBookingFromNotification,
    rejectingAction,
    setRejectingAction,
    setRejectionError,
    refreshing,
    unreadCount,
  } = useNotificationsPageController({
    currentUser,
    currentUserId,
  });

  return (
    <Container className="pb-12" size="tight">
      <div className="space-y-5 sm:space-y-6">
        <NotificationsHeader
          hasNotifications={notifications.length > 0}
          isClearingAll={isClearingAll}
          isMarkingAllRead={isMarkingAllRead}
          onClearAll={clearAll}
          onMarkAllRead={markAllRead}
          unreadCount={unreadCount}
        />

        <NotificationsStatus
          error={error}
          initialLoading={initialLoading}
          onRetry={() => loadNotifications({ showLoading: true })}
          refreshing={refreshing}
        />

        {!initialLoading && notifications.length === 0 && !isLoading && (
          <NotificationsEmptyState />
        )}

        {!initialLoading && notifications.length > 0 && (
          <NotificationsList
            activeAction={activeAction}
            bookingById={bookingById}
            currentUser={controllerUser}
            eventRegistrationById={eventRegistrationById}
            groupedNotifications={groupedNotifications}
            isClearingAll={isClearingAll}
            jobApplicationById={jobApplicationById}
            onBookingAction={handleBookingAction}
            onDelete={deleteOne}
            onEventAction={handleEventAction}
            onJobAction={handleJobAction}
            onMarkRead={markOneRead}
            onView={handleView}
          />
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
    </Container>
  );
}

NotificationsPage.__clearNotificationsCacheForTests = clearNotificationsCacheForTests;
NotificationsPage.__getNotificationsCacheForTests = getNotificationsCacheForTests;
