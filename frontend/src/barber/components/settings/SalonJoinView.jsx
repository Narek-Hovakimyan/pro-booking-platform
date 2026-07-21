import { useEffect, useRef, useState } from "react";
import {
  fetchMySalonStatus,
  fetchSalons,
  requestJoinSalon,
  cancelJoinRequestBySalon,
} from "@/shared/api/salonMembership";
import { Button } from "@/shared/components/ui/button";
import { UserPlus, CheckCircle2, XCircle, Clock3, AlertCircle } from "lucide-react";

const ERR_MAP = {
  join: "Unable to send request. Please try again.",
  cancel: "Unable to cancel request. Please try again.",
  load: "Unable to load salon data. Please try again.",
};

const STATUS_LABELS = {
  accepted: "Accepted",
  pending: "Pending",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function StatusBadge({ type }) {
  const colors = {
    accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    cancelled: "bg-neutral-50 text-neutral-600 border-neutral-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${colors[type] || "bg-neutral-50 text-neutral-600"}`}>
      {type === "accepted" && <CheckCircle2 className="h-3 w-3" />}
      {type === "pending" && <Clock3 className="h-3 w-3" />}
      {type === "rejected" && <XCircle className="h-3 w-3" />}
      {(type === "cancelled" || !type) && <AlertCircle className="h-3 w-3" />}
      {STATUS_LABELS[type] || "Unknown"}
    </span>
  );
}

const SALON_ID_PATTERN = /^[a-f\d]{24}$/i;
const SUPPORTED_STATUSES = new Set(["accepted", "pending", "rejected", "cancelled"]);

const isRecord = (value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const normalizeSalonId = (value) => {
  if (typeof value !== "string") return "";
  const salonId = value.trim();
  return SALON_ID_PATTERN.test(salonId) ? salonId : "";
};

const normalizeStatus = (value) => (
  typeof value === "string" && SUPPORTED_STATUSES.has(value) ? value : ""
);

const getSalonId = (salon) => {
  if (!isRecord(salon)) return "";
  return normalizeSalonId(salon.id) || normalizeSalonId(salon._id);
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const toState = (entry) => {
  if (!isRecord(entry)) return null;
  const salon = isRecord(entry.salon) ? entry.salon : {};
  const salonId = normalizeSalonId(entry.salonId) || getSalonId(salon);
  const status = normalizeStatus(entry.status);
  if (!salonId || !status) return null;
  return {
    salonId,
    status,
    salon,
  };
};

const toCompatibilityState = (entry, impliedStatus, statusAliases = {}) => {
  if (!isRecord(entry) || !SUPPORTED_STATUSES.has(impliedStatus)) return null;
  const statusWasSupplied = Object.prototype.hasOwnProperty.call(entry, "status");
  const aliasStatus =
    statusWasSupplied &&
    typeof entry.status === "string" &&
    Object.prototype.hasOwnProperty.call(statusAliases, entry.status)
      ? statusAliases[entry.status]
      : "";
  const status = statusWasSupplied
    ? normalizeStatus(entry.status) || aliasStatus
    : impliedStatus;
  if (!status || status !== impliedStatus) return null;

  const salon = isRecord(entry.salon) ? entry.salon : entry;
  return toState({
    salonId: normalizeSalonId(entry.salonId) || getSalonId(salon),
    status,
    salon,
  });
};

const addState = (states, seen, state) => {
  if (!state || !state.salonId || seen.has(state.salonId)) return;
  seen.add(state.salonId);
  states.push(state);
};

function getAuthoritativeStates(status) {
  const safeStatus = isRecord(status) ? status : {};
  const salonStates = asArray(safeStatus.salonStates);

  if (salonStates.length > 0) {
    const states = [];
    const seen = new Set();

    salonStates.forEach((entry) => {
      addState(states, seen, toState(entry));
    });

    return states;
  }

  const states = [];
  const seen = new Set();

  asArray(safeStatus.salons).filter(isRecord).forEach((entry) => {
    addState(states, seen, toCompatibilityState(entry, "accepted", { approved: "accepted" }));
  });

  asArray(safeStatus.pendingEntries).filter(isRecord).forEach((entry) => {
    addState(states, seen, toCompatibilityState(entry, "pending"));
  });

  if (isRecord(safeStatus.pendingRequest)) {
    addState(states, seen, toCompatibilityState(safeStatus.pendingRequest, "pending"));
  }

  return states;
}

export default function SalonJoinView({ currentUserId }) {
  const [status, setStatus] = useState(null);
  const [salons, setSalons] = useState([]);
  const [selectedSalonId, setSelectedSalonId] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const loadTokenRef = useRef(0);
  const actionTokenRef = useRef(0);
  const actionInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const isLoadActive = (token) =>
    mountedRef.current && loadTokenRef.current === token;
  const isActionActive = (token) =>
    mountedRef.current && actionTokenRef.current === token;

  const loadSalonData = async ({ showLoading = false, actionToken = null } = {}) => {
    loadTokenRef.current += 1;
    const loadToken = loadTokenRef.current;

    if (showLoading) {
      setLoading(true);
      setError("");
    }

    try {
      const [statusRes, salonsRes] = await Promise.all([
        fetchMySalonStatus(),
        currentUserId ? fetchSalons(currentUserId) : Promise.resolve({ data: [] }),
      ]);

      if (!isLoadActive(loadToken)) return false;
      if (actionToken !== null && !isActionActive(actionToken)) return false;
      setStatus(statusRes.data || {});
      setSalons(asArray(salonsRes.data));
      return true;
    } catch {
      if (!isLoadActive(loadToken)) return false;
      if (actionToken !== null && !isActionActive(actionToken)) return false;
      setError(ERR_MAP.load);
      return false;
    } finally {
      if (showLoading && isLoadActive(loadToken)) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    loadTokenRef.current += 1;
    const loadToken = loadTokenRef.current;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [statusRes, salonsRes] = await Promise.all([
          fetchMySalonStatus(),
          currentUserId ? fetchSalons(currentUserId) : Promise.resolve({ data: [] }),
        ]);

        if (!isLoadActive(loadToken)) return;
        setStatus(statusRes.data || {});
        setSalons(asArray(salonsRes.data));
      } catch {
        if (!isLoadActive(loadToken)) return;
        setError(ERR_MAP.load);
      } finally {
        if (isLoadActive(loadToken)) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mountedRef.current = false;
      loadTokenRef.current += 1;
      actionTokenRef.current += 1;
      actionInFlightRef.current = false;
    };
  }, [currentUserId]);

  const runAction = async ({ action, errorKey, successMessage, afterRefresh }) => {
    if (actionLoading || actionInFlightRef.current) return;

    actionTokenRef.current += 1;
    const actionToken = actionTokenRef.current;
    actionInFlightRef.current = true;

    setActionLoading(true);
    setError("");
    setSuccess("");

    try {
      await action();
      if (!isActionActive(actionToken)) return;
      const refreshed = await loadSalonData({ actionToken });
      if (!refreshed || !isActionActive(actionToken)) return;
      afterRefresh?.();
      if (!isActionActive(actionToken)) return;
      setSuccess(successMessage);
    } catch {
      if (isActionActive(actionToken)) {
        setError(ERR_MAP[errorKey]);
      }
    } finally {
      if (isActionActive(actionToken)) {
        actionInFlightRef.current = false;
        setActionLoading(false);
      }
    }
  };

  const handleJoin = (salonId = selectedSalonId) => {
    const normalizedSalonId = normalizeSalonId(salonId);
    if (!normalizedSalonId) return;
    runAction({
      action: () => requestJoinSalon(normalizedSalonId),
      errorKey: "join",
      successMessage: "Join request sent.",
      afterRefresh: () => setSelectedSalonId(""),
    });
  };

  const handleCancel = (salonId) => {
    const normalizedSalonId = normalizeSalonId(salonId);
    if (!normalizedSalonId) return;
    runAction({
      action: () => cancelJoinRequestBySalon(normalizedSalonId),
      errorKey: "cancel",
      successMessage: "Request cancelled.",
    });
  };

  const salonStates = getAuthoritativeStates(status);
  const blockedSalonIds = new Set(
    salonStates
      .filter((entry) => entry.status === "accepted" || entry.status === "pending")
      .map((entry) => entry.salonId)
  );
  const availableSalons = asArray(salons)
    .filter(isRecord)
    .map((salon) => ({ salon, salonId: getSalonId(salon) }))
    .filter(({ salonId }) => salonId && !blockedSalonIds.has(salonId));

  if (loading && !status) {
    return <div className="p-4 text-sm text-neutral-500">Loading salon data...</div>;
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>
      )}

      {salonStates.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-neutral-900">Your salon requests</h4>
          <div className="space-y-2">
            {salonStates.map((entry) => {
              const salonId = entry.salonId;
              const salon = entry.salon || {};
              const canCancel = entry.status === "pending";
              const canRequestAgain = entry.status === "rejected" || entry.status === "cancelled";

              return (
                <div key={salonId} className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-neutral-900">{salon.name || "Salon"}</span>
                      <StatusBadge type={entry.status} />
                    </div>
                    {salon.city && <p className="mt-0.5 text-sm text-neutral-500">{salon.city}</p>}
                  </div>

                  {canCancel && (
                    <Button disabled={actionLoading} onClick={() => handleCancel(salonId)} size="sm" variant="outline">
                      Cancel
                    </Button>
                  )}
                  {canRequestAgain && (
                    <Button disabled={actionLoading} onClick={() => handleJoin(salonId)} size="sm" variant="outline">
                      Request again
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {availableSalons.length > 0 && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5" id="join-salon">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-pink-50 text-pink-700">
              <UserPlus className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-neutral-950">Join existing salon</h3>
              <p className="mt-1 text-sm leading-6 text-neutral-500">
                Select a salon and send a request.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <select
              className="rounded-2xl border border-neutral-200 bg-white p-3 text-sm outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
              disabled={actionLoading}
              value={selectedSalonId}
              onChange={(event) => setSelectedSalonId(normalizeSalonId(event.target.value))}
            >
              <option value="">Select salon</option>
              {availableSalons.map(({ salon, salonId }) => (
                <option key={salonId} value={salonId}>
                  {salon.name}
                </option>
              ))}
            </select>
            <Button
              className="bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-md hover:from-purple-700 hover:to-pink-600"
              disabled={!selectedSalonId || actionLoading}
              onClick={() => handleJoin()}
            >
              {actionLoading ? "Sending..." : "Send request"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
