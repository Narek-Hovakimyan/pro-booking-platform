import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import EmptyState from "@/shared/components/common/EmptyState";
import { BookingCardSkeleton } from "@/shared/components/LoadingSkeletons";
import api from "@/shared/api/axios";
import { formatTimeInput } from "@/shared/utils/time";

const statusConfig = {
  active: {
    label: "Active",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  notified: {
    label: "Notified",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  offered: {
    label: "Waiting for client",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
  converting: {
    label: "Converting",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  converted: {
    label: "Converted",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-50 text-red-700 border-red-200",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-neutral-50 text-neutral-500 border-neutral-200",
  },
  expired: {
    label: "Expired",
    className: "bg-neutral-50 text-neutral-500 border-neutral-200",
  },
};

export default function WaitlistView({ barberId }) {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notifyingId, setNotifyingId] = useState(null);
  const [offeringId, setOfferingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [offerTimes, setOfferTimes] = useState({});

  const fetchEntries = useCallback(async () => {
    if (!barberId) return;

    setIsLoading(true);
    setError("");

    try {
      const { data } = await api.get(`/waitlist/barber/${barberId}`);
      setEntries(data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not load waitlist entries."
      );
    } finally {
      setIsLoading(false);
    }
  }, [barberId]);

  useEffect(() => {
    const fetchId = window.setTimeout(() => {
      fetchEntries();
    }, 0);

    return () => window.clearTimeout(fetchId);
  }, [fetchEntries]);

  const markNotified = async (entryId) => {
    if (notifyingId) return;

    setNotifyingId(entryId);
    setError("");

    try {
      await api.patch(`/waitlist/${entryId}/notify`);
      setEntries((currentEntries) =>
        currentEntries.map((entry) =>
          entry._id === entryId
            ? { ...entry, status: "notified", notifiedAt: new Date().toISOString() }
            : entry
        )
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not mark as notified."
      );
    } finally {
      setNotifyingId(null);
    }
  };

  const offerEntry = async (entry) => {
    if (offeringId || rejectingId) return;

    const time = (offerTimes[entry._id] ?? entry.preferredStartTime ?? "").trim();

    setOfferingId(entry._id);
    setError("");

    try {
      const { data } = await api.patch(`/waitlist/${entry._id}/offer`, { time });
      setEntries((currentEntries) =>
        currentEntries.map((currentEntry) =>
          currentEntry._id === entry._id ? data : currentEntry
        )
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not offer time."
      );
    } finally {
      setOfferingId(null);
    }
  };

  const rejectEntry = async (entryId) => {
    if (offeringId || rejectingId) return;

    setRejectingId(entryId);
    setError("");

    try {
      const { data } = await api.patch(`/waitlist/${entryId}/reject`);
      setEntries((currentEntries) =>
        currentEntries.map((entry) => (entry._id === entryId ? data : entry))
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not reject waitlist entry."
      );
    } finally {
      setRejectingId(null);
    }
  };

  const needsAction = (status) =>
    status === "active" || status === "notified";
  const isClosed = (status) =>
    !needsAction(status) && status !== "offered";
  const isOffered = (status) =>
    status === "offered";

  const actionEntries = entries.filter((e) => needsAction(e.status));
  const offeredEntries = entries.filter((e) => isOffered(e.status));
  const otherEntries = entries.filter((e) => isClosed(e.status));

  const renderEntry = (entry) => {
    const config = statusConfig[entry.status] || statusConfig.active;
    const clientName = entry.clientId?.name || entry.clientName || "Client";
    const canAct = needsAction(entry.status);
    const isOfferedEntry = isOffered(entry.status);
    const isDeclinedOffer = entry.status === "rejected" && Boolean(entry.offeredTime);
    const offerTime = offerTimes[entry._id] ?? entry.preferredStartTime ?? "";

    return (
      <div
        key={entry._id}
        className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-neutral-950">{clientName}</div>
            <div className="mt-0.5 text-sm text-neutral-500">
              {entry.serviceId?.name || entry.serviceName || "Service"} · {entry.date}
            </div>
            {(entry.preferredStartTime || entry.preferredEndTime) && (
              <div className="mt-0.5 text-sm text-neutral-400">
                Preferred: {entry.preferredStartTime || "—"} – {entry.preferredEndTime || "—"}
              </div>
            )}
            {isOfferedEntry && entry.offeredTime && (
              <div className="mt-0.5 space-y-1 text-sm">
                <div className="font-medium text-purple-700">
                  Waiting for client confirmation
                </div>
                <div className="text-purple-600">
                  Offered time: {entry.offeredTime}
                </div>
              </div>
            )}
            {entry.status === "converted" && (
              <div className="mt-0.5 text-sm font-medium text-emerald-700">
                Appointment confirmed
                {entry.convertedBooking?.time ? ` at ${entry.convertedBooking.time}` : ""}
              </div>
            )}
            {entry.status === "rejected" && (
              <div className="mt-0.5 text-sm font-medium text-red-700">
                {isDeclinedOffer
                  ? `Client declined offered time ${entry.offeredTime}`
                  : "No time available"}
              </div>
            )}
            {entry.note && (
              <div className="mt-1 text-sm text-neutral-500">Note: {entry.note}</div>
            )}
          </div>
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium ${config.className}`}
          >
            {config.label}
          </span>
        </div>

        {canAct && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              aria-label="Offer time"
              className="h-9 w-full rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-500 sm:w-32"
              onChange={(event) =>
                setOfferTimes((currentTimes) => ({
                  ...currentTimes,
                  [entry._id]: formatTimeInput(
                    event.target.value,
                    currentTimes[entry._id] ?? entry.preferredStartTime ?? ""
                  ),
                }))
              }
              inputMode="numeric"
              pattern="[0-9]{2}:[0-9]{2}"
              placeholder="HH:mm"
              type="text"
              value={offerTime}
            />
            <Button
              className="w-full sm:w-auto"
              disabled={offeringId === entry._id || rejectingId === entry._id}
              onClick={() => offerEntry(entry)}
              size="sm"
            >
              {offeringId === entry._id ? "Offering..." : "Offer time"}
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={offeringId === entry._id || rejectingId === entry._id}
              onClick={() => rejectEntry(entry._id)}
              size="sm"
              variant="outline"
            >
              {rejectingId === entry._id ? "Rejecting..." : "No time"}
            </Button>
            {entry.status === "active" && (
              <Button
                className="w-full sm:w-auto"
                disabled={notifyingId === entry._id || offeringId === entry._id || rejectingId === entry._id}
                onClick={() => markNotified(entry._id)}
                size="sm"
                variant="outline"
              >
                <Bell className="mr-1.5 h-3.5 w-3.5" />
                {notifyingId === entry._id ? "Marking..." : "Mark notified"}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <Bell className="h-5 w-5" />
          Waitlist
        </h2>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {isLoading ? (
          <div className="grid gap-3">
            {[0, 1].map((item) => (
              <BookingCardSkeleton key={item} />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            description="No clients have joined the waitlist yet."
            title="No waitlist entries"
          />
        ) : (
          <div className="space-y-5">
            {actionEntries.length > 0 && (
              <div>
                <h3 className="mb-3 text-base font-bold text-neutral-950">
                  Active / Notified ({actionEntries.length})
                </h3>
                <div className="space-y-3">{actionEntries.map(renderEntry)}</div>
              </div>
            )}

            {offeredEntries.length > 0 && (
              <div>
                <h3 className="mb-3 text-base font-bold text-purple-700">
                  Offered ({offeredEntries.length})
                </h3>
                <div className="space-y-3">{offeredEntries.map(renderEntry)}</div>
              </div>
            )}

            {otherEntries.length > 0 && (
              <div>
                <h3 className="mb-3 text-base font-bold text-neutral-500">
                  Closed ({otherEntries.length})
                </h3>
                <div className="space-y-3">{otherEntries.map(renderEntry)}</div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
