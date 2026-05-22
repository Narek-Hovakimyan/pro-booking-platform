import { ChevronDown, ChevronUp, ClipboardList } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import api from "@/shared/api/axios";

/**
 * In-memory cache keyed by clientId.
 * Avoids repeated API calls for the same client within the same session.
 */
const reliabilityCache = new Map();

export default function ClientReliabilitySummary({ clientId }) {
  const [data, setData] = useState(
    () => (clientId ? reliabilityCache.get(clientId) || null : null)
  );
  const [isLoading, setIsLoading] = useState(!data && Boolean(clientId));
  const [error, setError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!clientId) return undefined;

    // Cache hit — useState initializer already consumed the data
    if (reliabilityCache.has(clientId)) {
      return undefined;
    }

    const controller = new AbortController();

    api
      .get(`/bookings/client/${clientId}/reliability`, {
        signal: controller.signal,
      })
      .then(({ data: response }) => {
        if (!isMountedRef.current) return;
        reliabilityCache.set(clientId, response);
        setData(response);
        setError(false);
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        setError(true);
      })
      .finally(() => {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      });

    return () => {
      isMountedRef.current = false;
      controller.abort();
    };
  }, [clientId]);

  if (!clientId) return null;

  if (isLoading) {
    return (
      <div className="mt-3 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-400">
        Loading client history...
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <button
        className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-neutral-700"
        onClick={() => setIsExpanded((prev) => !prev)}
        type="button"
      >
        <span className="flex items-center gap-1.5">
          <ClipboardList className="h-3.5 w-3.5" />
          Client history
        </span>
        {isExpanded ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-600">
          <span>
            Completed:{" "}
            <strong className="text-neutral-800">
              {data.completedCount || 0}
            </strong>
          </span>
          <span>
            Cancelled:{" "}
            <strong className="text-neutral-800">
              {data.cancelledCount || 0}
            </strong>
          </span>
          <span>
            No-show:{" "}
            <strong className="text-neutral-800">
              {data.noShowCount || 0}
            </strong>
          </span>
          <span>
            Late cancelled:{" "}
            <strong className="text-neutral-800">
              {data.lateCancelledCount || 0}
            </strong>
          </span>
          <span className="col-span-2 mt-1 border-t border-neutral-200 pt-1 text-center font-medium">
            Score:{" "}
            <strong
              className={
                data.reliabilityScore >= 70
                  ? "text-emerald-600"
                  : data.reliabilityScore >= 40
                    ? "text-amber-600"
                    : "text-red-600"
              }
            >
              {data.reliabilityScore ?? "—"}
            </strong>
            /100
          </span>
        </div>
      )}
    </div>
  );
}
