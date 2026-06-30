import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";

import { getPlatformBillingSalons } from "@/shared/api/platformBilling";
import { Card, CardContent } from "@/shared/components/ui/card";

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const getStatusLabel = (sub) => {
  if (!sub) return "No subscription";
  if (sub.status === "active" && !sub.isExpired) return "Active";
  if (sub.status === "trialing") return "Trial";
  if (sub.isExpired || sub.status === "expired") return "Expired";
  if (sub.status === "past_due") return "Past due";
  return sub.status ? sub.status.replace("_", " ") : "No subscription";
};

const getStatusBadgeClass = (sub) => {
  if (!sub) return "bg-neutral-100 text-neutral-700";
  if (sub.isExpired || sub.status === "expired") return "bg-red-50 text-red-700";
  if (sub.status === "past_due") return "bg-amber-50 text-amber-700";
  if (sub.status === "active" || sub.status === "trialing")
    return "bg-emerald-50 text-emerald-700";
  return "bg-neutral-100 text-neutral-700";
};

const getPaymentStatusLabel = (payment) => {
  if (!payment) return null;
  const status = payment.status || "unknown";
  if (status === "paid" || status === "confirmed") return "Paid";
  if (status === "pending") return "Pending — not paid";
  if (status === "requires_action") return "Requires action";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "refunded") return "Refunded";
  return status.replace(/_/g, " ");
};

const getProviderLabel = (provider) => {
  if (!provider || provider === "manual") return "Manual provider";
  if (provider === "disabled") return "Disabled provider";
  return provider;
};

export default function PlatformBillingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useSelector((state) => state.auth);

  const [salons, setSalons] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => Number(searchParams.get("page")) || 1);
  const [limit] = useState(20);
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") || "");
  const [subscriptionStatus, setSubscriptionStatus] = useState(
    () => searchParams.get("status") || ""
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Determine if user can view this page
  const isPlatformAdmin = Boolean(currentUser?.platformRole === "superuser");

  const totalPages = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    let isMounted = true;

    async function fetchSalons() {
      if (!isMounted) return;
      setIsLoading(true);
      setError("");

      try {
        const params = { page, limit };
        if (search.trim()) params.search = search.trim();
        if (subscriptionStatus) params.subscriptionStatus = subscriptionStatus;

        const result = await getPlatformBillingSalons(params);
        if (!isMounted) return;
        setSalons(result.salons || []);
        setTotal(result.total || 0);
      } catch (err) {
        if (!isMounted) return;
        if (err.response?.status === 403) {
          setError("Access denied. Platform superuser privileges required.");
        } else {
          setError(err.response?.data?.message || "Failed to load salon billing data.");
        }
        setSalons([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchSalons();

    return () => {
      isMounted = false;
    };
  }, [page, limit, search, subscriptionStatus]);

  // Sync URL params
  useEffect(() => {
    const params = {};
    if (page > 1) params.page = String(page);
    if (search) params.search = search;
    if (subscriptionStatus) params.status = subscriptionStatus;
    setSearchParams(params, { replace: true });
  }, [page, search, subscriptionStatus, setSearchParams]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleStatusFilter = (status) => {
    setPage(1);
    setSubscriptionStatus(status === subscriptionStatus ? "" : status);
  };

  const handleSalonClick = (salonId) => {
    navigate(`/admin/platform/billing/salons/${salonId}`);
  };

  // ── Error state for non-admin ──
  if (!isPlatformAdmin && error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <AlertTriangle className="h-10 w-10 text-red-400" />
          <h2 className="text-lg font-semibold text-neutral-900">Access Denied</h2>
          <p className="text-sm text-neutral-600">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Platform Billing</h1>
          <p className="text-sm text-neutral-500">
            Salon subscription billing overview
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <Users className="h-3.5 w-3.5" />
          <span>
            {total} salon{total !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by salon name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
          />
        </form>

        <div className="flex flex-wrap gap-1.5">
          {["", "active", "expired", "none"].map((status) => (
            <button
              key={status}
              onClick={() => handleStatusFilter(status)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                subscriptionStatus === status
                  ? "bg-neutral-950 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
              type="button"
            >
              {status === ""
                ? "All"
                : status === "active"
                  ? "Active"
                  : status === "expired"
                    ? "Expired"
                    : "No subscription"}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && salons.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Building2 className="h-10 w-10 text-neutral-300" />
            <p className="text-sm text-neutral-500">
              {search || subscriptionStatus
                ? "No salons match your filters."
                : "No salon data available."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Salon list */}
      {!isLoading && salons.length > 0 && (
        <div className="space-y-3">
          {salons.map((salon) => (
            <button
              key={salon._id}
              onClick={() => handleSalonClick(salon._id)}
              className="flex w-full items-start gap-4 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:border-neutral-300 hover:shadow-md sm:items-center"
              type="button"
            >
              {/* Salon image */}
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100">
                {salon.imageUrl ? (
                  <img
                    src={salon.imageUrl}
                    alt={salon.name || ""}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Building2 className="h-6 w-6 text-neutral-400" />
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-neutral-900">
                      {salon.name || "Unnamed Salon"}
                    </h3>
                    <p className="text-xs text-neutral-500">
                      {salon.city || "No city"}
                      {salon.owner?.name ? ` · ${salon.owner.name}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Subscription status */}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${getStatusBadgeClass(salon.subscription)}`}
                    >
                      {getStatusLabel(salon.subscription)}
                    </span>
                  </div>
                </div>

                {/* Details row */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                  {salon.subscription && (
                    <>
                      <span>
                        Seats: {salon.seats?.used ?? 0}/{salon.seats?.total ?? 0} used
                      </span>
                      <span className="text-neutral-300">·</span>
                      <span>{salon.seats?.available ?? 0} available</span>
                      <span className="text-neutral-300">·</span>
                    </>
                  )}

                  {salon.subscription?.currentPeriodEnd && (
                    <>
                      <span>
                        Expires: {formatDate(salon.subscription.currentPeriodEnd)}
                      </span>
                      {salon.subscription.daysRemaining >= 0 && (
                        <>
                          <span className="text-neutral-300">·</span>
                          <span>
                            {salon.subscription.daysRemaining}d remaining
                          </span>
                        </>
                      )}
                      <span className="text-neutral-300">·</span>
                    </>
                  )}

                  {/* Latest payment status */}
                  {salon.latestPaymentAttempt && (
                    <span>
                      Payment:{" "}
                      <span className="font-medium">
                        {getPaymentStatusLabel(salon.latestPaymentAttempt)}
                      </span>
                    </span>
                  )}

                  {!salon.subscription && (
                    <span className="text-neutral-400">No active subscription</span>
                  )}
                </div>

                {/* Provider info */}
                <div className="mt-1 text-[11px] text-neutral-400">
                  {salon.subscription
                    ? getProviderLabel(salon.subscription.provider)
                    : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-30"
            type="button"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>

          <span className="text-xs text-neutral-500">
            Page {page} of {totalPages}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-30"
            type="button"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
