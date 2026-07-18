import { useEffect, useRef, useState } from "react";
import { fetchOwnerRequests, decideJoinRequest } from "@/shared/api/salonMembership";
import { Button } from "@/shared/components/ui/button";
import { CheckCircle2, XCircle, Clock3 } from "lucide-react";

const ERR_MAP = {
  accepted: "Unable to accept request. Please try again.",
  rejected: "Unable to reject request. Please try again.",
  load: "Unable to load join requests. Please try again.",
  forbidden: "You are not authorized to manage this salon.",
  conflict: "This request has already been updated.",
};

export default function JoinRequestDecisions() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inflightByRequest, setInflightByRequest] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const loadTokenRef = useRef(0);
  const decisionTokensRef = useRef({});
  const inflightRequestsRef = useRef({});
  const mountedRef = useRef(true);

  const isLoadActive = (token) =>
    mountedRef.current && loadTokenRef.current === token;
  const isDecisionActive = (requestId, token) =>
    mountedRef.current && decisionTokensRef.current[requestId] === token;

  useEffect(() => {
    mountedRef.current = true;
    loadTokenRef.current += 1;
    const token = loadTokenRef.current;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const { data } = await fetchOwnerRequests();

        if (!isLoadActive(token)) return;
        setRequests(Array.isArray(data) ? data : []);
      } catch {
        if (!isLoadActive(token)) return;
        setError(ERR_MAP.load);
      } finally {
        if (isLoadActive(token)) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      mountedRef.current = false;
      loadTokenRef.current += 1;
      decisionTokensRef.current = {};
      inflightRequestsRef.current = {};
    };
  }, []);

  const handleDecision = async (requestId, status) => {
    if (!requestId || inflightByRequest[requestId] || inflightRequestsRef.current[requestId]) {
      return;
    }

    const token = (decisionTokensRef.current[requestId] || 0) + 1;
    decisionTokensRef.current[requestId] = token;
    inflightRequestsRef.current[requestId] = true;

    setInflightByRequest((current) => ({ ...current, [requestId]: true }));
    setError("");
    setSuccess("");

    try {
      await decideJoinRequest(requestId, status);
      if (!isDecisionActive(requestId, token)) return;
      setRequests((current) => current.filter((request) => (request.id || request._id) !== requestId));
      setSuccess(status === "accepted" ? "Request accepted." : "Request rejected.");
    } catch (errorResponse) {
      if (!isDecisionActive(requestId, token)) return;
      const statusCode = errorResponse?.response?.status;
      if (statusCode === 403) {
        setError(ERR_MAP.forbidden);
      } else if (statusCode === 409) {
        setError(ERR_MAP.conflict);
      } else {
        setError(ERR_MAP[status]);
      }
    } finally {
      if (isDecisionActive(requestId, token)) {
        delete inflightRequestsRef.current[requestId];
        setInflightByRequest((current) => {
          const next = { ...current };
          delete next[requestId];
          return next;
        });
      }
    }
  };

  if (loading) {
    return <div className="p-4 text-sm text-neutral-500">Loading requests...</div>;
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-amber-600" />
          <h4 className="font-semibold text-neutral-900">Pending join requests</h4>
        </div>

        {requests.map((request) => {
          const requestId = request.id || request._id;
          const barber = request.barber || {};
          const salon = request.salon || {};
          const isInflight = Boolean(inflightByRequest[requestId]);

          return (
            <div
              key={requestId}
              className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-neutral-900">
                    {barber.name || "Barber"}
                  </div>
                  <div className="mt-0.5 text-sm text-neutral-500">
                    Request to join <span className="font-medium text-neutral-700">{salon.name || "Salon"}</span>
                  </div>
                  {barber.profession && (
                    <div className="mt-0.5 text-xs text-neutral-400">
                      {barber.profession}{barber.barberType ? ` · ${barber.barberType}` : ""}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    disabled={isInflight}
                    onClick={() => handleDecision(requestId, "accepted")}
                    size="sm"
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    Accept
                  </Button>
                  <Button
                    className="text-red-700 hover:bg-red-50"
                    disabled={isInflight}
                    onClick={() => handleDecision(requestId, "rejected")}
                    size="sm"
                    variant="outline"
                  >
                    <XCircle className="mr-1 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
