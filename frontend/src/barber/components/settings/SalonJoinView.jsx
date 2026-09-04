import { useCallback, useEffect, useRef, useState } from "react";
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
const JOIN_APPLICATION_POLICIES = new Set(["closed", "job_only", "open"]);
const SEARCH_DEBOUNCE_MS = 250;

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

const normalizeJoinApplicationPolicy = (value) =>
  typeof value === "string" && JOIN_APPLICATION_POLICIES.has(value) ? value : "open";

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

export default function SalonJoinView({ currentUserId, refreshRevision }) {
  const [status, setStatus] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchResultsTerm, setSearchResultsTerm] = useState("");
  const [selectedSalonId, setSelectedSalonId] = useState("");
  const [selectedSalonPolicy, setSelectedSalonPolicy] = useState("open");
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [searchRevision, setSearchRevision] = useState(0);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const statusTokenRef = useRef(0);
  const searchTokenRef = useRef(0);
  const actionTokenRef = useRef(0);
  const actionInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const isStatusActive = (token) =>
    mountedRef.current && statusTokenRef.current === token;
  const isSearchActive = (token) =>
    mountedRef.current && searchTokenRef.current === token;
  const isActionActive = (token) =>
    mountedRef.current && actionTokenRef.current === token;

  const refreshStatus = useCallback(async ({ actionToken = null } = {}) => {
    statusTokenRef.current += 1;
    const statusToken = statusTokenRef.current;

    try {
      const statusRes = await fetchMySalonStatus();
      if (!isStatusActive(statusToken)) return false;
      if (actionToken !== null && !isActionActive(actionToken)) return false;
      setStatus(statusRes.data || {});
      setError("");
      return true;
    } catch {
      if (!isStatusActive(statusToken)) return false;
      if (actionToken !== null && !isActionActive(actionToken)) return false;
      setError(ERR_MAP.load);
      return false;
    } finally {
      if (isStatusActive(statusToken)) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      statusTokenRef.current += 1;
      searchTokenRef.current += 1;
      actionTokenRef.current += 1;
      actionInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshStatus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [currentUserId, refreshRevision, refreshStatus]);

  useEffect(() => {
    const term = searchTerm.trim();
    searchTokenRef.current += 1;
    const searchToken = searchTokenRef.current;

    if (!term || !currentUserId) {
      return undefined;
    }

    const timeout = window.setTimeout(async () => {
      if (!isSearchActive(searchToken)) return;
      setSearchLoading(true);

      try {
        const response = await fetchSalons(currentUserId, term);
        if (!isSearchActive(searchToken)) return;
        setSearchResults(asArray(response.data));
        setSearchResultsTerm(term);
        setActiveResultIndex(-1);
      } catch {
        if (!isSearchActive(searchToken)) return;
        setSearchResults([]);
        setSearchResultsTerm(term);
        setError(ERR_MAP.load);
      } finally {
        if (isSearchActive(searchToken)) setSearchLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      searchTokenRef.current += 1;
    };
  }, [currentUserId, refreshRevision, searchRevision, searchTerm]);

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
      const refreshed = await refreshStatus({ actionToken });
      if (!refreshed || !isActionActive(actionToken)) return;
      setSearchRevision((revision) => revision + 1);
      afterRefresh?.();
      if (!isActionActive(actionToken)) return;
      setSuccess(successMessage);
    } catch (requestError) {
      if (isActionActive(actionToken)) {
        const message = requestError?.response?.data?.message;
        setError(typeof message === "string" && message.trim() ? message : ERR_MAP[errorKey]);
      }
    } finally {
      if (isActionActive(actionToken)) {
        actionInFlightRef.current = false;
        setActionLoading(false);
      }
    }
  };

  const handleJoin = (salonId = selectedSalonId) => {
    if (salonId === selectedSalonId && selectedSalonPolicy !== "open") return;
    const normalizedSalonId = normalizeSalonId(salonId);
    if (!normalizedSalonId) return;
    runAction({
      action: () => requestJoinSalon(normalizedSalonId),
      errorKey: "join",
      successMessage: "Join request sent.",
      afterRefresh: () => {
        setSelectedSalonId("");
        setSelectedSalonPolicy("open");
        setSearchTerm("");
      },
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
  const normalizedSearchTerm = searchTerm.trim();
  const hasSearchTerm = Boolean(normalizedSearchTerm);
  const availableSalons = hasSearchTerm && searchResultsTerm === normalizedSearchTerm
    ? asArray(searchResults)
      .filter(isRecord)
      .map((salon) => ({ salon, salonId: getSalonId(salon) }))
      .filter(({ salonId }) => salonId && !blockedSalonIds.has(salonId))
    : [];
  const isSearching = hasSearchTerm && searchLoading;

  const selectSalon = ({ salon, salonId }) => {
    setSelectedSalonId(salonId);
    setSelectedSalonPolicy(normalizeJoinApplicationPolicy(salon.joinApplicationPolicy));
    setSearchTerm(salon.name || "");
    setActiveResultIndex(-1);
    setIsSearchOpen(false);
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Escape") {
      setActiveResultIndex(-1);
      setIsSearchOpen(false);
      return;
    }

    if (availableSalons.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveResultIndex((index) => Math.min(index + 1, availableSalons.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveResultIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && activeResultIndex >= 0) {
      event.preventDefault();
      selectSalon(availableSalons[activeResultIndex]);
    }
  };

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

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5" id="join-salon">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-pink-50 text-pink-700">
            <UserPlus className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-neutral-950">Join existing salon</h3>
            <p className="mt-1 text-sm leading-6 text-neutral-500">
              Search for a salon and send a request.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <label className="grid gap-2 text-sm font-semibold text-neutral-800" htmlFor="salon-search">
              Search salons
            </label>
            <input
              aria-activedescendant={activeResultIndex >= 0 ? `salon-search-result-${activeResultIndex}` : undefined}
              aria-autocomplete="list"
              aria-controls="salon-search-results"
              aria-expanded={isSearchOpen && availableSalons.length > 0}
              className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white p-3 text-sm font-normal outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
              disabled={actionLoading}
              id="salon-search"
              onChange={(event) => {
                const nextSearchTerm = event.target.value;
                setSearchTerm(nextSearchTerm);
                setSelectedSalonId("");
                setSelectedSalonPolicy("open");
                setActiveResultIndex(-1);
                setIsSearchOpen(true);
                setSearchLoading(Boolean(nextSearchTerm.trim()));
              }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search by salon name or city"
              role="combobox"
              value={searchTerm}
            />
            {isSearching && <p className="mt-2 text-sm text-neutral-500">Searching salons...</p>}
            {isSearchOpen && !isSearching && hasSearchTerm && availableSalons.length === 0 && (
              <p className="mt-2 text-sm text-neutral-500">No salons found.</p>
            )}
            {isSearchOpen && availableSalons.length > 0 && (
              <ul
                className="absolute z-10 mt-2 max-h-56 w-full overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-1 shadow-lg"
                id="salon-search-results"
                role="listbox"
              >
                {availableSalons.map(({ salon, salonId }, index) => (
                  <li
                    aria-selected={selectedSalonId === salonId}
                    className={`cursor-pointer rounded-xl px-3 py-2 text-sm ${index === activeResultIndex ? "bg-purple-50 text-purple-950" : "text-neutral-800 hover:bg-neutral-50"}`}
                    id={`salon-search-result-${index}`}
                    key={salonId}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSalon({ salon, salonId })}
                    role="option"
                  >
                    <span className="block font-semibold">{salon.name || "Salon"}</span>
                    {salon.city && <span className="block text-xs text-neutral-500">{salon.city}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {selectedSalonId && selectedSalonPolicy !== "open" ? (
            <p className="self-end text-sm text-neutral-600">
              {selectedSalonPolicy === "job_only"
                ? "This salon accepts applications through job posts. Applying to a job does not automatically join the salon."
                : "This salon is not currently accepting applications."}
            </p>
          ) : (
            <Button
              className="bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-md hover:from-purple-700 hover:to-pink-600 sm:mt-7"
              disabled={!selectedSalonId || actionLoading}
              onClick={() => handleJoin()}
            >
              {actionLoading ? "Sending..." : "Send request"}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
