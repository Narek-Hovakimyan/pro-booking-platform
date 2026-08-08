import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";

export default function SalonBookingSuccess({
  salon,
  bookingPayment,
  onViewBookings,
  onBookAgain,
}) {
  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold">Booking request sent!</h2>
        <p className="text-neutral-500">
          Your booking at <strong>{salon.name}</strong> has been submitted. The barber will confirm shortly.
        </p>
        {bookingPayment && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
            <div className="font-semibold">Deposit required</div>
            <p className="mt-2">
              Status: <span className="font-semibold">{bookingPayment.paymentStatus || "pending"}</span>
            </p>
            {bookingPayment.checkoutUrl ? (
              <a
                href={bookingPayment.checkoutUrl}
                className="mt-3 inline-flex rounded-lg bg-amber-900 px-3 py-2 font-semibold text-white transition hover:bg-amber-800"
              >
                Pay deposit
              </a>
            ) : (
              <p className="mt-2">
                {bookingPayment.message ||
                  "Deposit is required, but online payment is not enabled yet."}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={onViewBookings}>View my bookings</Button>
          <Button variant="outline" onClick={onBookAgain}>
            Book again
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
