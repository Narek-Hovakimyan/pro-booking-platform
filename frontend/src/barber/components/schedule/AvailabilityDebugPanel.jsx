import { useMemo, useState } from "react";
import { AlertCircle, Bug, CheckCircle2, Info, Search, XCircle } from "lucide-react";

import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";
import { CardContent } from "@/shared/components/ui/card";
import { formatDateKey } from "@/shared/utils/dates";

const inputClass =
  "h-10 w-full rounded-xl border border-purple-100 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100 disabled:bg-neutral-100 disabled:text-neutral-400";

const checkLabels = {
  isPast: "Past time",
  outsideWorkingHours: "Outside working hours",
  exceedsWorkingHours: "Exceeds working hours",
  crossesBreak: "Crosses break",
  hasBookingConflict: "Booking conflict",
};

const getServiceId = (service) => service?.id || service?._id || "";

function ResultBadge({ result }) {
  if (!result?.time) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 ring-1 ring-inset ring-purple-100">
        <Info className="h-3.5 w-3.5" />
        Date diagnostic
      </span>
    );
  }

  return result.available ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-100">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Available
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-100">
      <XCircle className="h-3.5 w-3.5" />
      Unavailable
    </span>
  );
}

export default function AvailabilityDebugPanel({
  barberId,
  selectedSalonId,
  selectedDateKey,
  services = [],
  isServicesLoading = false,
  servicesError = "",
}) {
  const [serviceId, setServiceId] = useState("");
  const [dateOverride, setDateOverride] = useState("");
  const [time, setTime] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  const serviceOptions = useMemo(
    () => (services || []).filter((service) => getServiceId(service)),
    [services]
  );
  const effectiveDate = dateOverride || selectedDateKey || formatDateKey(new Date());
  const effectiveServiceId = serviceOptions.some(
    (service) => String(getServiceId(service)) === String(serviceId)
  )
    ? serviceId
    : getServiceId(serviceOptions[0]);
  const selectedService = serviceOptions.find(
    (service) => String(getServiceId(service)) === String(effectiveServiceId)
  );

  const canCheck = Boolean(
    barberId && selectedSalonId && effectiveDate && effectiveServiceId
  );

  const checkAvailability = async () => {
    if (!canCheck || isChecking) return;

    setIsChecking(true);
    setError("");
    setResult(null);

    try {
      const { data } = await api.post("/bookings/availability-debug", {
        barberId,
        salonId: selectedSalonId,
        date: effectiveDate,
        serviceId: effectiveServiceId,
        time: time || undefined,
      });

      setResult(data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not check availability. Please try again."
      );
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <details className="group rounded-3xl border-2 border-dashed border-purple-200 bg-white/70 open:shadow-sm open:shadow-purple-100/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2">
          <Bug className="h-5 w-5 text-purple-400" aria-hidden="true" />
          <div>
            <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-neutral-700">
                Testing tools
              </h2>
                <svg className="h-4 w-4 text-purple-400 transition group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <p className="mt-0.5 text-xs text-neutral-400">
              Internal debugging tool — not used for normal schedule editing.
            </p>
          </div>
        </div>
        {result && <ResultBadge result={result} />}
      </summary>
      <CardContent className="space-y-4 p-4 pt-2 sm:p-5 sm:pt-2">
        <p className="text-xs text-neutral-500">
          Check whether a specific service, date, and time can be booked. Your current schedule settings and existing bookings are evaluated.
        </p>

        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <label className="grid gap-1.5 text-xs font-semibold uppercase text-neutral-500">
            Date
            <input
              className={inputClass}
              type="date"
              value={effectiveDate}
              onChange={(event) => setDateOverride(event.target.value)}
            />
            <p className="mt-1 text-xs font-normal normal-case text-neutral-400">
              Defaults to the selected override date above. Change to debug a different date.
            </p>
          </label>

          <label className="grid gap-1.5 text-xs font-semibold uppercase text-neutral-500">
            Service
            <select
              className={inputClass}
              disabled={isServicesLoading || serviceOptions.length === 0}
              value={effectiveServiceId}
              onChange={(event) => setServiceId(event.target.value)}
            >
              {servicesError ? (
                <option value="">Could not load services</option>
              ) : isServicesLoading ? (
                <option value="">Loading services...</option>
              ) : serviceOptions.length === 0 ? (
                <option value="">No services available</option>
              ) : (
                serviceOptions.map((service) => (
                  <option key={getServiceId(service)} value={getServiceId(service)}>
                    {service.name || "Service"}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="grid gap-1.5 text-xs font-semibold uppercase text-neutral-500">
            Time (optional)
            <input
              className={inputClass}
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
            <p className="mt-1 text-xs font-normal normal-case text-neutral-400">
              Leave empty to check date-level availability. Enter a specific time for slot-level check.
            </p>
          </label>

          <div className="flex items-end">
            <Button
              disabled={!canCheck || isChecking}
              onClick={checkAvailability}
              variant="outline"
              className="w-full border-purple-200 text-purple-700 hover:bg-purple-50 md:w-auto"
              size="sm"
            >
              <Search className="mr-2 h-4 w-4" />
              {isChecking ? "Checking..." : "Check availability"}
            </Button>
          </div>
        </div>

        {!selectedSalonId && (
          <p className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-700">
            Select a salon to run diagnostics.
          </p>
        )}

        {error && (
          <p className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        {servicesError && (
          <p className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">
            {servicesError}
          </p>
        )}

        {result && (
          <div className="space-y-4 rounded-2xl border border-purple-100 bg-purple-50/50 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-neutral-950">
                {result.explanation}
              </p>
              {!result.time && (
                <p className="text-xs text-neutral-500">
                  Enter a time to see a slot-level available/unavailable decision.
                </p>
              )}
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <InfoItem
                label="Service"
                value={`${result.service?.name || selectedService?.name || "Service"} · ${result.service?.duration || selectedService?.duration || "?"} min`}
              />
              <InfoItem
                label="Service status"
                value={result.service?.isActive === false ? "Inactive" : "Active"}
              />
              <InfoItem label="Schedule source" value={result.schedule?.source || "—"} />
              <InfoItem
                label="Working hours"
                value={
                  result.schedule?.startTime && result.schedule?.endTime
                    ? `${result.schedule.startTime} - ${result.schedule.endTime}`
                    : "Not set"
                }
              />
              <InfoItem
                label="Break"
                value={
                  result.schedule?.hasBreak
                    ? `${result.schedule.breakStart || "—"} - ${result.schedule.breakEnd || "—"}`
                    : "No break"
                }
              />
              <InfoItem
                label="Flags"
                value={[
                  result.schedule?.isNonWorkingDay ? "Non-working day" : "",
                  result.schedule?.hasOverride ? "Override" : "",
                ].filter(Boolean).join(", ") || "None"}
              />
            </div>

            <div>
              <h3 className="text-sm font-bold text-neutral-950">Checks</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(checkLabels).map(([key, label]) => (
                  <CheckRow
                    key={key}
                    label={label}
                    active={Boolean(result.checks?.[key])}
                  />
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-neutral-950">
                Blocking bookings
              </h3>
              {result.blockingBookings?.length > 0 ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {result.blockingBookings.map((booking) => (
                    <div
                      className="rounded-xl border border-purple-100 bg-white px-3 py-2 text-sm text-neutral-700"
                      key={booking.id}
                    >
                      <span className="font-semibold">
                        {booking.time}
                        {booking.endTime ? ` - ${booking.endTime}` : ""}
                      </span>
                      <span className="ml-2 text-neutral-400">
                        {booking.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-neutral-500">
                  No blocking bookings returned for this date.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </details>
  );
}

function InfoItem({ label, value }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2">
      <div className="text-xs font-semibold uppercase text-neutral-400">
        {label}
      </div>
      <div className="mt-1 font-medium text-neutral-800">{value}</div>
    </div>
  );
}

function CheckRow({ label, active }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
        active
          ? "bg-rose-50 text-rose-700"
          : "bg-white text-neutral-500"
      }`}
    >
      {active ? (
        <AlertCircle className="h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
      )}
      <span>{label}</span>
    </div>
  );
}
