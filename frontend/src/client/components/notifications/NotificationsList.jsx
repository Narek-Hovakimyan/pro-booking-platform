import NotificationGroup from "@/shared/components/NotificationGroup";

const GROUPS = ["Today", "Yesterday", "This Week", "Earlier"];

export default function NotificationsList({
  activeAction,
  bookingById,
  currentUser,
  eventRegistrationById,
  groupedNotifications,
  jobApplicationById,
  onBookingAction,
  onDelete,
  onEventAction,
  onJobAction,
  onMarkRead,
  onView,
}) {
  return (
    <div className="space-y-7 sm:space-y-8">
      {GROUPS.map((title) => (
        groupedNotifications[title].length > 0 && (
          <NotificationGroup
            activeAction={activeAction}
            bookingById={bookingById}
            currentUser={currentUser}
            eventRegistrationById={eventRegistrationById}
            jobApplicationById={jobApplicationById}
            key={title}
            notifications={groupedNotifications[title]}
            onBookingAction={onBookingAction}
            onDelete={onDelete}
            onEventAction={onEventAction}
            onJobAction={onJobAction}
            onMarkRead={onMarkRead}
            onView={onView}
            title={title}
          />
        )
      ))}
    </div>
  );
}
