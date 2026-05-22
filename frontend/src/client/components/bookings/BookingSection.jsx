import EmptyState from "@/shared/components/common/EmptyState";

export default function BookingSection({
  title,
  emptyText,
  bookings,
  groups,
  section,
  renderBooking,
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
      {bookings.length === 0 ? (
        <EmptyState
          description={emptyText}
          title={title === "Active bookings" ? "No bookings yet" : "No booking history"}
        />
      ) : (
        <div className="space-y-5">
          {groups
            .filter((group) => group.bookings.length > 0)
            .map((group) => (
              <section className="space-y-3" key={group.key}>
                <h3 className="text-base font-bold text-neutral-950">
                  {group.title} ({group.bookings.length})
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {group.bookings.map((booking) =>
                    renderBooking(booking, section)
                  )}
                </div>
              </section>
            ))}
        </div>
      )}
    </section>
  );
}
