import { Link } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";

export default function BookingSection({
  title,
  emptyText,
  bookings,
  groups,
  section,
  renderBooking,
  emptyIcon: EmptyIcon,
  emptyCta,
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold tracking-tight text-neutral-950 sm:text-2xl">{title}</h2>
      {bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center">
          {EmptyIcon && <EmptyIcon className="mx-auto h-8 w-8 text-neutral-300" />}
          <p className="mt-2 font-medium text-neutral-950">{emptyText}</p>
          {emptyCta && (
            <Button as={Link} className="mt-3" to={emptyCta.to}>
              {emptyCta.label}
            </Button>
          )}
        </div>
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
