import BookingSummary from "@/client/components/BookingSummary";
import ClientBooking from "@/client/components/ClientBooking";

function BookingStepIndicator({ currentStep }) {
  const steps = [
    { key: 2, label: "Service" },
    { key: 3, label: "Time" },
    { key: 4, label: "Confirm" },
  ];

  return (
    <div className="flex items-center gap-2 sm:gap-4">
      {steps.map((s, idx) => {
        const isActive = currentStep === s.key;
        const isCompleted = currentStep > s.key;
        return (
          <div key={s.key} className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition ${
                  isActive
                    ? "bg-brand-600 text-white"
                    : isCompleted
                      ? "bg-brand-50 text-brand-600"
                      : "bg-neutral-100 text-neutral-400"
                }`}
              >
                {isCompleted ? "✓" : s.key - 1}
              </div>
              <span
                className={`hidden text-sm font-medium sm:inline ${
                  isActive ? "text-neutral-950" : isCompleted ? "text-brand-600" : "text-neutral-400"
                }`}
              >
                {s.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`h-px w-6 shrink-0 sm:w-10 ${
                  isCompleted ? "bg-brand-500" : "bg-neutral-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BookingPageContent({
  barber,
  display,
  clientBookingProps,
  summaryProps,
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
            {barber?.name || "Booking"}
          </h1>
          {barber?.phone && <p className="mt-1 text-neutral-500">{barber.phone}</p>}
        </div>

        <BookingStepIndicator currentStep={display.step} />
      </div>

      {display.isLoading && (
        <div className="space-y-3">
          <div className="h-5 w-56 animate-pulse rounded-xl bg-neutral-100" />
          <div className="h-32 animate-pulse rounded-2xl bg-neutral-100" />
        </div>
      )}

      {display.error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {display.error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:gap-8">
        <ClientBooking {...clientBookingProps} />
        <BookingSummary {...summaryProps} />
      </div>
    </div>
  );
}
