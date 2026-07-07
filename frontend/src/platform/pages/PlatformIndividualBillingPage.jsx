import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ReceiptText,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { NavLink, useSearchParams } from "react-router-dom";

import {
  getPlatformBillingIndividualPayments,
  getPlatformBillingIndividuals,
} from "@/shared/api/platformBilling";
import { Card, CardContent } from "@/shared/components/ui/card";
import { canAccessPlatform } from "@/shared/utils/platformAccess";

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

const formatAmount = (amount, currency) => {
  if (amount === null || amount === undefined) return "—";
  return `${amount} ${currency || ""}`.trim();
};

const getStatusLabel = (sub) => {
  if (!sub) return "No subscription";
  if (sub.status === "active" && !sub.isExpired) return "Active";
  if (sub.status === "trialing") return "Trial";
  if (sub.isExpired || sub.status === "expired") return "Expired";
  if (sub.status === "past_due") return "Past due";
  return sub.status ? sub.status.replace(/_/g, " ") : "No subscription";
};

const getStatusBadgeClass = (sub) => {
  if (!sub) return "bg-neutral-100 text-neutral-700";
  if (sub.isExpired || sub.status === "expired") return "bg-red-50 text-red-700";
  if (sub.status === "past_due") return "bg-amber-50 text-amber-700";
  if (sub.status === "active" || sub.status === "trialing") {
    return "bg-emerald-50 text-emerald-700";
  }
  return "bg-neutral-100 text-neutral-700";
};

const getPaymentStatusLabel = (payment) => {
  if (!payment) return null;
  const status = payment.status || "unknown";
  if (status === "paid" || status === "confirmed") return "Paid";
  if (status === "pending") return "Pending";
  if (status === "requires_action") return "Requires action";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "refunded") return "Refunded";
  return status.replace(/_/g, " ");
};

const getPaymentBadgeClass = (payment) => {
  if (!payment) return "bg-neutral-100 text-neutral-700";
  if (payment.status === "paid" || payment.status === "confirmed") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (payment.status === "failed" || payment.status === "cancelled") {
    return "bg-red-50 text-red-700";
  }
  if (payment.status === "pending" || payment.status === "requires_action") {
    return "bg-amber-50 text-amber-700";
  }
  return "bg-neutral-100 text-neutral-700";
};

const getProviderLabel = (provider) => {
  if (!provider || provider === "manual") return "Manual provider";
  if (provider === "disabled") return "Disabled provider";
  return provider;
};

const getSourceLabel = (payment) => {
  if (!payment) return "";
  const source =
    payment.source === "payment_record" ? "Payment record" : "Payment attempt";
  return payment.action ? `${source} · ${payment.action}` : source;
};

const billingTabs = [
  { to: "/admin/platform/billing/salons", label: "Salon Billing", icon: Users },
  { to: "/admin/platform/billing/individuals", label: "Individual Billing", icon: ReceiptText },
];

const statusFilters = [
  { value: "paid", label: "Paid" },
  { value: "active", label: "Active" },
  { value: "trial", label: "Trial" },
  { value: "expired", label: "Expired" },
  { value: "none", label: "No subscription" },
];

const supportedStatusFilters = new Set(statusFilters.map((filter) => filter.value));

export default function PlatformIndividualBillingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useSelector((state) => state.auth);
  const initialStatus = searchParams.get("status") || "";
  const hasInitialStatus = supportedStatusFilters.has(initialStatus);

  const [individuals, setIndividuals] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => Number(searchParams.get("page")) || 1);
  const [limit] = useState(20);
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [searchInput, setSearchInput] = useState(
    () => searchParams.get("search") || ""
  );
  const [subscriptionStatus, setSubscriptionStatus] = useState(
    () => (hasInitialStatus ? initialStatus : "paid")
  );
  const [hasExplicitStatus, setHasExplicitStatus] = useState(
    () => hasInitialStatus
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedBarberId, setExpandedBarberId] = useState("");
  const [paymentState, setPaymentState] = useState({});

  const isPlatformAdmin = canAccessPlatform(currentUser);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    let isMounted = true;

    async function fetchIndividuals() {
      setIsLoading(true);
      setError("");

      try {
        const params = { page, limit };
        const trimmedSearch = search.trim();
        const shouldSendStatus = hasExplicitStatus || !trimmedSearch;
        if (trimmedSearch) params.search = trimmedSearch;
        if (shouldSendStatus && subscriptionStatus) {
          params.subscriptionStatus = subscriptionStatus;
        }

        const result = await getPlatformBillingIndividuals(params);
        if (!isMounted) return;
        setIndividuals(result.individuals || []);
        setTotal(result.total || 0);
      } catch (err) {
        if (!isMounted) return;
        if (err.response?.status === 403) {
          setError("Access denied. Platform superuser privileges required.");
        } else {
          setError(
            err.response?.data?.message ||
              "Failed to load individual billing data."
          );
        }
        setIndividuals([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchIndividuals();

    return () => {
      isMounted = false;
    };
  }, [page, limit, search, subscriptionStatus, hasExplicitStatus]);

  useEffect(() => {
    const params = {};
    if (page > 1) params.page = String(page);
    if (search) params.search = search;
    if (hasExplicitStatus && subscriptionStatus) params.status = subscriptionStatus;
    setSearchParams(params, { replace: true });
  }, [page, search, subscriptionStatus, hasExplicitStatus, setSearchParams]);

  const loadPayments = async (barberId, nextPage = 1) => {
    setPaymentState((state) => ({
      ...state,
      [barberId]: {
        ...(state[barberId] || {}),
        isLoading: true,
        error: "",
      },
    }));

    try {
      const result = await getPlatformBillingIndividualPayments(barberId, {
        page: nextPage,
        limit: 10,
      });
      setPaymentState((state) => ({
        ...state,
        [barberId]: {
          payments: result.payments || [],
          total: result.total || 0,
          page: result.page || nextPage,
          limit: result.limit || 10,
          isLoading: false,
          error: "",
        },
      }));
    } catch (err) {
      setPaymentState((state) => ({
        ...state,
        [barberId]: {
          ...(state[barberId] || {}),
          isLoading: false,
          error:
            err.response?.data?.message ||
            "Failed to load individual payment history.",
        },
      }));
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleStatusFilter = (status) => {
    setPage(1);
    setSubscriptionStatus(status);
    setHasExplicitStatus(true);
  };

  const handleTogglePayments = (barberId) => {
    if (expandedBarberId === barberId) {
      setExpandedBarberId("");
      return;
    }
    setExpandedBarberId(barberId);
    if (!paymentState[barberId]?.payments) {
      loadPayments(barberId, 1);
    }
  };

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
          <h1 className="text-xl font-bold text-neutral-900">Individual Billing</h1>
          <p className="text-sm text-neutral-500">
            Showing paid individual subscriptions by default. Search can find any barber.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <Users className="h-3.5 w-3.5" />
          <span>
            {total} barber{total !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="grid gap-2 rounded-2xl border border-violet-100 bg-violet-50/60 p-1 sm:inline-grid sm:grid-cols-2">
        {billingTabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-white text-violet-700 shadow-sm"
                  : "text-neutral-600 hover:bg-white/70 hover:text-neutral-900"
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by barber name or email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
          />
        </form>

        <div className="flex flex-wrap gap-1.5">
          {statusFilters.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handleStatusFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                subscriptionStatus === value && (hasExplicitStatus || !search.trim())
                  ? "bg-neutral-950 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {search.trim() && !hasExplicitStatus && (
        <p className="text-xs text-neutral-500">
          Showing all matching search results. Select a filter to narrow by billing status.
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      )}

      {!isLoading && !error && individuals.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <UserRound className="h-10 w-10 text-neutral-300" />
            <p className="text-sm text-neutral-500">
              {search || subscriptionStatus
                ? "No individual billing records match your filters."
                : "No individual billing records available."}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && individuals.length > 0 && (
        <div className="space-y-3">
          {individuals.map((item) => {
            const barberId = item.barberId || item.barber?.id;
            const payment = item.latestPayment;
            const paymentInfo = paymentState[barberId] || {};
            const paymentTotalPages = Math.max(
              1,
              Math.ceil((paymentInfo.total || 0) / (paymentInfo.limit || 10))
            );

            return (
              <div
                key={barberId}
                className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-neutral-900">
                          {item.barber?.name || "Unnamed barber"}
                        </h3>
                        <p className="truncate text-xs text-neutral-500">
                          {item.barber?.email || "No email"}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {[item.barber?.city, item.barber?.profession]
                            .filter(Boolean)
                            .join(" · ") || "No profile details"}
                        </p>
                      </div>

                      <span
                        className={`w-fit rounded-full px-2.5 py-0.5 text-[11px] font-medium ${getStatusBadgeClass(item.subscription)}`}
                      >
                        {getStatusLabel(item.subscription)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-neutral-500 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <span className="block text-neutral-400">Period</span>
                        <span className="font-medium text-neutral-700">
                          {formatDate(item.subscription?.currentPeriodStart)} →{" "}
                          {formatDate(item.subscription?.currentPeriodEnd)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-neutral-400">Amount</span>
                        <span className="font-medium text-neutral-700">
                          {formatAmount(
                            item.subscription?.totalPrice,
                            payment?.currency
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="block text-neutral-400">Provider</span>
                        <span className="font-medium text-neutral-700">
                          {getProviderLabel(
                            payment?.provider || item.subscription?.provider
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="block text-neutral-400">Latest payment</span>
                        <span className="font-medium text-neutral-700">
                          {payment
                            ? `${getPaymentStatusLabel(payment)} · ${formatDate(
                                payment.paidAt || payment.createdAt
                              )}`
                            : "No payments"}
                        </span>
                      </div>
                    </div>

                    {payment && (
                      <div className="mt-2 text-[11px] text-neutral-400">
                        {getSourceLabel(payment)}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleTogglePayments(barberId)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
                    type="button"
                  >
                    View payments
                    <ChevronDown
                      className={`h-4 w-4 transition ${
                        expandedBarberId === barberId ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </div>

                {expandedBarberId === barberId && (
                  <div className="mt-4 rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
                    {paymentInfo.isLoading && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
                      </div>
                    )}

                    {paymentInfo.error && (
                      <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
                        <span>{paymentInfo.error}</span>
                        <button
                          onClick={() =>
                            loadPayments(barberId, paymentInfo.page || 1)
                          }
                          className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-700"
                          type="button"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {!paymentInfo.isLoading &&
                      !paymentInfo.error &&
                      paymentInfo.payments?.length === 0 && (
                        <div className="py-8 text-center text-sm text-neutral-500">
                          No individual payments found.
                        </div>
                      )}

                    {!paymentInfo.isLoading &&
                      !paymentInfo.error &&
                      paymentInfo.payments?.length > 0 && (
                        <div className="space-y-2">
                          {paymentInfo.payments.map((historyItem, index) => (
                            <div
                              key={historyItem.id || `${barberId}-${index}`}
                              className="grid gap-2 rounded-xl border border-neutral-100 bg-white p-3 text-xs text-neutral-500 sm:grid-cols-2 lg:grid-cols-5"
                            >
                              <div>
                                <span className="block text-neutral-400">Amount</span>
                                <span className="font-semibold text-neutral-800">
                                  {formatAmount(
                                    historyItem.amount,
                                    historyItem.currency
                                  )}
                                </span>
                              </div>
                              <div>
                                <span className="block text-neutral-400">Status</span>
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${getPaymentBadgeClass(historyItem)}`}
                                >
                                  {getPaymentStatusLabel(historyItem)}
                                </span>
                              </div>
                              <div>
                                <span className="block text-neutral-400">Provider</span>
                                <span className="font-medium text-neutral-700">
                                  {getProviderLabel(historyItem.provider)}
                                </span>
                              </div>
                              <div>
                                <span className="block text-neutral-400">Dates</span>
                                <span className="font-medium text-neutral-700">
                                  {formatDate(historyItem.paidAt)} ·{" "}
                                  {formatDate(historyItem.createdAt)}
                                </span>
                              </div>
                              <div>
                                <span className="block text-neutral-400">Source</span>
                                <span className="font-medium text-neutral-700">
                                  {getSourceLabel(historyItem)}
                                </span>
                              </div>
                              {(historyItem.periodStart ||
                                historyItem.periodEnd) && (
                                <div className="sm:col-span-2 lg:col-span-5">
                                  <span className="text-neutral-400">Period: </span>
                                  <span className="font-medium text-neutral-700">
                                    {formatDate(historyItem.periodStart)} →{" "}
                                    {formatDate(historyItem.periodEnd)}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}

                          {paymentTotalPages > 1 && (
                            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                              <button
                                onClick={() =>
                                  loadPayments(
                                    barberId,
                                    Math.max(1, (paymentInfo.page || 1) - 1)
                                  )
                                }
                                disabled={(paymentInfo.page || 1) <= 1}
                                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-white disabled:opacity-30"
                                type="button"
                              >
                                <ChevronLeft className="h-4 w-4" />
                                Previous
                              </button>
                              <span className="text-xs text-neutral-500">
                                Page {paymentInfo.page || 1} of {paymentTotalPages}
                              </span>
                              <button
                                onClick={() =>
                                  loadPayments(
                                    barberId,
                                    Math.min(
                                      paymentTotalPages,
                                      (paymentInfo.page || 1) + 1
                                    )
                                  )
                                }
                                disabled={(paymentInfo.page || 1) >= paymentTotalPages}
                                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-white disabled:opacity-30"
                                type="button"
                              >
                                Next
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
