import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import EmptyState from "@/shared/components/common/EmptyState";
import { BookingCardSkeleton } from "@/shared/components/LoadingSkeletons";
import api from "@/shared/api/axios";

const statusConfig = {
  active: {
    label: "Active",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  notified: {
    label: "Notified",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  converting: {
    label: "Confirming",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  offered: {
    label: "Time offered",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
  converted: {
    label: "Appointment confirmed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  rejected: {
    label: "Request declined",
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

export default function MyWaitlistPage() {
  const { currentUser } = useSelector((state) => state.auth);
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState(null);
  const [acceptingId, setAcceptingId] = useState(null);
  const [decliningId, setDecliningId] = useState(null);

  const fetchEntries = useCallback(async () => {
    if (!currentUser?.id) return;

    setIsLoading(true);
    setError("");

    try {
      const { data } = await api.get("/waitlist/me");
      setEntries(data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not load waitlist entries."
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    const fetchId = window.setTimeout(() => {
      fetchEntries();
    }, 0);

    return () => window.clearTimeout(fetchId);
  }, [fetchEntries]);

  const cancelEntry = async (entryId) => {
    if (cancellingId) return;

    setCancellingId(entryId);
    setError("");

    try {
      await api.patch(`/waitlist/${entryId}/cancel`);
      setEntries((currentEntries) =>
        currentEntries.map((entry) =>
          entry._id === entryId
            ? { ...entry, status: "cancelled", cancelledAt: new Date().toISOString() }
            : entry
        )
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not cancel waitlist entry."
      );
    } finally {
      setCancellingId(null);
    }
  };

  const acceptOffer = async (entryId) => {
    if (acceptingId || decliningId) return;

    setAcceptingId(entryId);
    setError("");

    try {
      const { data } = await api.patch(`/waitlist/${entryId}/accept-offer`);
      setEntries((currentEntries) =>
        currentEntries.map((entry) =>
          entry._id === entryId ? data.entry : entry
        )
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not accept offer."
      );
    } finally {
      setAcceptingId(null);
    }
  };

  const declineOffer = async (entryId) => {
    if (acceptingId || decliningId) return;

    setDecliningId(entryId);
    setError("");

    try {
      const { data } = await api.patch(`/waitlist/${entryId}/decline-offer`);
      setEntries((currentEntries) =>
        currentEntries.map((entry) =>
          entry._id === entryId ? data : entry
        )
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not decline offer."
      );
    } finally {
      setDecliningId(null);
    }
  };

  const activeEntries = entries.filter((e) => e.status === "active");
  const notifiedEntries = entries.filter((e) => e.status === "notified");
  const offeredEntries = entries.filter((e) => e.status === "offered");
  const closedEntries = entries.filter(
    (e) =>
      e.status === "converted" ||
      e.status === "rejected" ||
      e.status === "cancelled" ||
      e.status === "expired"
  );

  const renderEntry = (entry) => {
    const config = statusConfig[entry.status] || statusConfig.active;
    const barberName = entry.barberId?.name || entry.barberName || "Barber";
    const isBusy = acceptingId === entry._id || decliningId === entry._id;
    const canCancel = entry.status === "active" || entry.status === "notified";
    const isDeclinedOffer = entry.status === "rejected" && Boolean(entry.offeredTime);

    return (
      <div
        key={entry._id}
        className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-neutral-950">{barberName}</div>
            <div className="mt-0.5 text-sm text-neutral-500">
              {entry.serviceId?.name || entry.serviceName || "Service"} · {entry.date}
            </div>
            {(entry.preferredStartTime || entry.preferredEndTime) && (
              <div className="mt-0.5 text-sm text-neutral-400">
                Preferred: {entry.preferredStartTime || "—"} – {entry.preferredEndTime || "—"}
              </div>
            )}
            {entry.note && (
              <div className="mt-1 text-sm text-neutral-500">Note: {entry.note}</div>
            )}
            {entry.status === "offered" && entry.offeredTime && (
              <div className="mt-1 space-y-1 text-sm">
                <div className="font-medium text-purple-700">
                  Barber offered this time: {entry.offeredTime}
                </div>
                <div className="text-neutral-600">
                  Accept to confirm your appointment, or decline to reject the offer.
                </div>
              </div>
            )}
            {entry.status === "converted" && (
              <>
                <div className="mt-1 text-sm font-medium text-emerald-700">
                  Appointment confirmed
                  {entry.convertedBooking?.time ? ` at ${entry.convertedBooking.time}` : ""}
                </div>
              </>
            )}
            {entry.status === "rejected" && (
              <div className="mt-1 text-sm font-medium text-red-700">
                {isDeclinedOffer
                  ? `You declined the offered time ${entry.offeredTime}`
                  : "No suitable time available"}
              </div>
            )}
          </div>
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium ${config.className}`}
          >
            {config.label}
          </span>
        </div>

        {canCancel && (
          <div className="mt-3">
            <Button
              className="w-full sm:w-auto"
              disabled={cancellingId === entry._id}
              onClick={() => cancelEntry(entry._id)}
              size="sm"
              variant="outline"
            >
              {cancellingId === entry._id ? "Cancelling..." : "Cancel waitlist"}
            </Button>
          </div>
        )}

        {entry.status === "offered" && (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-neutral-600">
              Accepting confirms this appointment. Declining rejects the offer.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                className="w-full sm:w-auto"
                disabled={isBusy}
                onClick={() => acceptOffer(entry._id)}
                size="sm"
              >
                {acceptingId === entry._id ? "Accepting..." : "Accept"}
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={isBusy}
                onClick={() => declineOffer(entry._id)}
                size="sm"
                variant="outline"
              >
                {decliningId === entry._id ? "Declining..." : "Decline"}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          My Waitlist
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Entries you join when no slot is available.
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="grid gap-4">
          {[0, 1].map((item) => (
            <BookingCardSkeleton key={item} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Card className="rounded-2xl sm:rounded-3xl">
          <CardContent className="p-6">
            <EmptyState
              description="Join a waitlist when booking a barber to be notified if a slot opens."
              title="No waitlist entries"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {activeEntries.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-bold sm:text-xl">
                Active ({activeEntries.length})
              </h2>
              <div className="space-y-3">{activeEntries.map(renderEntry)}</div>
            </div>
          )}

          {notifiedEntries.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-bold sm:text-xl">
                Notified ({notifiedEntries.length})
              </h2>
              <p className="mb-3 text-sm text-amber-600">
                A slot may be available. Check with the barber.
              </p>
              <div className="space-y-3">{notifiedEntries.map(renderEntry)}</div>
            </div>
          )}

          {offeredEntries.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-bold sm:text-xl text-purple-700">
                Offer pending ({offeredEntries.length})
              </h2>
              <div className="space-y-3">{offeredEntries.map(renderEntry)}</div>
            </div>
          )}

          {closedEntries.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-bold sm:text-xl">
                Closed ({closedEntries.length})
              </h2>
              <div className="space-y-3">{closedEntries.map(renderEntry)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
