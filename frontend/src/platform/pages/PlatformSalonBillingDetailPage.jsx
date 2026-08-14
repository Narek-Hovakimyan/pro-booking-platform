import {
  AlertTriangle,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import {
  getPlatformBillingSalonDetail,
  getPlatformBillingSalonPayments,
  activatePlatformSalonSubscription,
  updatePlatformSalonSeatCount,
  assignPlatformSalonSeat,
  revokePlatformSalonSeat,
  cancelPlatformSalonSubscription,
  confirmPlatformSalonPayment,
} from "@/shared/api/platformBilling";
import { Card, CardContent } from "@/shared/components/ui/card";
import { canAccessPlatform } from "@/shared/utils/platformAccess";
import {
  formatCurrency,
  getProviderLabel,
} from "../utils/billingFormatters";
import { PlatformActionModal } from "../components/billing/PlatformActionModal";
import { SalonBillingHeader } from "../components/billing/SalonBillingHeader";
import { SalonBillingSummaryCards } from "../components/billing/SalonBillingSummaryCards";
import { SalonBillingStaffTable } from "../components/billing/SalonBillingStaffTable";
import { SalonBillingPendingPaymentCard } from "../components/billing/SalonBillingPendingPaymentCard";
import { SalonBillingPaymentHistory } from "../components/billing/SalonBillingPaymentHistory";

const getEntityId = (entity) => entity?.id ?? entity?._id ?? entity ?? null;

const getDetailSalonId = (value) => {
  const id = getEntityId(value?.salon);
  return id ? String(id) : "";
};
/* ─── Page Component ──────────────────────────────────── */
export default function PlatformSalonBillingDetailPage() {
  const navigate = useNavigate();
  const { salonId } = useParams();
  const { currentUser } = useSelector((state) => state.auth);
  const [detail, setDetail] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const isPlatformAdmin = canAccessPlatform(currentUser);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorSalonId, setErrorSalonId] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const detailRequestRef = useRef(0);
  const paymentsRequestRef = useRef(0);
  const mutationRequestRef = useRef(0);
  const currentRouteSalonIdRef = useRef("");
  const successTimerRef = useRef(null);
  /* ── Modal state ── */
  const [modal, setModal] = useState(null); // { type, extra }
  const [isSubmitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");
  /* ── Data fetching ── */
  const fetchDetail = useCallback(async () => {
    const targetSalonId = String(salonId || "");
    const requestId = ++detailRequestRef.current;
    if (!targetSalonId) {
      setDetail(null);
      setIsLoading(false);
      return null;
    }

    try {
      const result = await getPlatformBillingSalonDetail(targetSalonId);
      if (detailRequestRef.current !== requestId) return null;
      setDetail(result);
      setError("");
      setErrorSalonId("");
      return result;
    } catch (err) {
      if (detailRequestRef.current !== requestId) return null;
      setErrorSalonId(targetSalonId);
      if (err.response?.status === 403) {
        setError("Access denied. Platform superuser privileges required.");
      } else if (err.response?.status === 404) {
        setError("Salon not found.");
      } else {
        setError(err.response?.data?.message || "Failed to load salon billing detail.");
      }
      return null;
    } finally {
      if (detailRequestRef.current === requestId) setIsLoading(false);
    }
  }, [salonId]);

  const fetchPayments = useCallback(async (targetSalonId = String(salonId || "")) => {
    const requestId = ++paymentsRequestRef.current;
    if (!targetSalonId) return;

    try {
      const result = await getPlatformBillingSalonPayments(targetSalonId, {
        page: paymentsPage,
        limit: 10,
      });
      if (paymentsRequestRef.current !== requestId) return;
      setPayments(result.payments || []);
      setPaymentsTotal(result.total || 0);
    } catch {
      // Payments fetch is secondary
    }
  }, [salonId, paymentsPage]);
  useEffect(() => {
    currentRouteSalonIdRef.current = String(salonId || "");
  }, [salonId]);

  // Route changes invalidate every in-flight request and action tied to the old salon.
  useEffect(() => {
    async function loadCurrentSalon() {
      setDetail(null);
      setPayments([]);
      setPaymentsTotal(0);
      setPaymentsPage(1);
      setError("");
      setErrorSalonId("");
      setSuccessMessage("");
      setModal(null);
      setModalError("");
      setSubmitting(false);
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
      setIsLoading(true);
      await fetchDetail();
    }

    loadCurrentSalon();

    return () => {
      detailRequestRef.current += 1;
      paymentsRequestRef.current += 1;
      mutationRequestRef.current += 1;
    };
  }, [fetchDetail]);

  // Fetch payments once detail is loaded
  useEffect(() => {
    const targetSalonId = String(salonId || "");
    if (!targetSalonId || !detail || getDetailSalonId(detail) !== targetSalonId) {
      return undefined;
    }

    async function loadCurrentPayments() {
      await fetchPayments(targetSalonId);
    }
    loadCurrentPayments();
    return () => {
      paymentsRequestRef.current += 1;
    };
  }, [salonId, paymentsPage, detail, fetchPayments]);
  /* ── Mutation handlers ── */
  const closeModal = () => {
    setModal(null);
    setModalError("");
    setSubmitting(false);
  };
  const handleMutation = async (apiCall, note, targetSalonId) => {
    const currentSalonId = String(salonId || "");
    const loadedSalonId = getDetailSalonId(detail);
    if (
      currentRouteSalonIdRef.current !== currentSalonId ||
      !targetSalonId ||
      targetSalonId !== currentSalonId ||
      loadedSalonId !== currentSalonId ||
      modal?.salonId !== currentSalonId
    ) {
      return;
    }

    const mutationId = ++mutationRequestRef.current;
    setSubmitting(true);
    setModalError("");
    try {
      await apiCall(note);
      if (mutationRequestRef.current !== mutationId) return;
      const refreshedDetail = await fetchDetail();
      if (
        mutationRequestRef.current !== mutationId ||
        !refreshedDetail ||
        getDetailSalonId(refreshedDetail) !== targetSalonId
      ) {
        return;
      }
      await fetchPayments(targetSalonId);
      if (mutationRequestRef.current !== mutationId) return;
      setSuccessMessage("Action completed successfully.");
      closeModal();
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        if (mutationRequestRef.current === mutationId) setSuccessMessage("");
      }, 5000);
    } catch (err) {
      if (mutationRequestRef.current !== mutationId) return;
      const status = err.response?.status;
      if (status === 403 || status === 401) {
        setModalError("Forbidden. Platform superuser privileges required.");
      } else if (status === 400) {
        setModalError(err.response?.data?.message || "Validation error.");
      } else {
        setModalError(err.response?.data?.message || "An unexpected error occurred.");
      }
    } finally {
      if (mutationRequestRef.current === mutationId) setSubmitting(false);
    }
  };
  /* ── Activate / Renew ── */
  const handleActivateConfirm = (note) => {
    const targetSalonId = modal?.salonId;
    handleMutation(async (n) => {
      return activatePlatformSalonSubscription(targetSalonId, {
        note: n,
        seatCount: modal?.extra?.seatCount || 1,
        months: modal?.extra?.months || 1,
      });
    }, note, targetSalonId);
  };
  /* ── Update seat count ── */
  const handleSeatCountConfirm = (note) => {
    const targetSalonId = modal?.salonId;
    const newCount = Number(modal?.extra?.newSeatCount);
    if (!Number.isInteger(newCount) || newCount < 1) {
      setModalError("Seat count must be a positive integer.");
      return;
    }
    handleMutation(async (n) => {
      return updatePlatformSalonSeatCount(targetSalonId, {
        seatCount: newCount,
        note: n,
      });
    }, note, targetSalonId);
  };
  /* ── Assign seat ── */
  const handleAssignConfirm = (note) => {
    const targetSalonId = modal?.salonId;
    const barberId = modal?.extra?.barberId;
    if (!barberId) {
      setModalError("No staff member selected.");
      return;
    }
    handleMutation(async (n) => {
      return assignPlatformSalonSeat(targetSalonId, {
        barberId,
        note: n,
      });
    }, note, targetSalonId);
  };
  /* ── Revoke seat ── */
  const handleRevokeConfirm = (note) => {
    const targetSalonId = modal?.salonId;
    const barberId = modal?.extra?.barberId;
    if (!barberId) {
      setModalError("No staff member selected.");
      return;
    }
    handleMutation(async (n) => {
      return revokePlatformSalonSeat(targetSalonId, {
        barberId,
        note: n,
      });
    }, note, targetSalonId);
  };
  /* ── Cancel subscription ── */
  const handleCancelConfirm = (note) => {
    const targetSalonId = modal?.salonId;
    handleMutation(async (n) => {
      return cancelPlatformSalonSubscription(targetSalonId, {
        note: n,
      });
    }, note, targetSalonId);
  };
  /* ── Confirm payment ── */
  const handlePaymentConfirm = (note) => {
    const targetSalonId = modal?.salonId;
    const paymentId = modal?.extra?.paymentId;
    if (!paymentId) {
      setModalError("No payment selected.");
      return;
    }
    handleMutation(async (n) => {
      return confirmPlatformSalonPayment(paymentId, {
        note: n,
      });
    }, note, targetSalonId);
  };
  /* ── Derived data ── */
  const routeSalonId = String(salonId || "");
  const detailMatchesRoute =
    Boolean(detail) && getDetailSalonId(detail) === routeSalonId;
  const errorMatchesRoute = Boolean(error) && errorSalonId === routeSalonId;
  const currentDetail = detailMatchesRoute ? detail : null;
  const subscription = currentDetail?.subscription;
  const seats = currentDetail?.seats;
  const acceptedStaff = currentDetail?.acceptedStaff || [];
  const latestPendingAttempt = currentDetail?.latestPendingAttempt;
  const subscriptionIsCancelled = subscription?.status === "cancelled";
  const totalPaymentsPages = Math.max(1, Math.ceil(paymentsTotal / 10));
  const assignedBarberIds = new Set(
    (seats?.assignments || []).map((a) => String(a.barber?.id || a.barber))
  );
  // Determine if a payment attempt is eligible for manual confirmation
  const isConfirmablePayment = latestPendingAttempt
    ? latestPendingAttempt.provider === "manual" &&
      (latestPendingAttempt.status === "pending" ||
        latestPendingAttempt.status === "requires_action")
    : false;
  /* ── Loading ── */
  if (!routeSalonId || isLoading || (!detailMatchesRoute && !errorMatchesRoute)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }
  /* ── Error state ── */
  if (errorMatchesRoute) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <ShieldAlert className="h-10 w-10 text-red-400" />
          <h2 className="text-lg font-semibold text-neutral-900">Access Denied</h2>
          <p className="text-sm text-neutral-600">{error}</p>
          <button
            onClick={() => navigate("/admin/platform/billing")}
            className="mt-2 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
            type="button"
          >
            Back to Platform Billing
          </button>
        </CardContent>
      </Card>
    );
  }
  if (!currentDetail || !isPlatformAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <AlertTriangle className="h-10 w-10 text-neutral-300" />
          <p className="text-sm text-neutral-500">Salon not found or access denied.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <SalonBillingHeader
        salon={currentDetail.salon}
        subscription={subscription}
        isPlatformAdmin={isPlatformAdmin}
        onBack={() => navigate("/admin/platform/billing")}
        successMessage={successMessage}
        onActivate={() => setModal({ type: "activate", salonId: String(salonId || "") })}
        onUpdateSeatCount={() => setModal({ type: "seatCount", salonId: String(salonId || "") })}
        onCancel={() => setModal({ type: "cancel", salonId: String(salonId || "") })}
      />
      <SalonBillingSummaryCards
        owner={currentDetail.owner}
        subscription={subscription}
        seats={seats}
        subscriptionIsCancelled={subscriptionIsCancelled}
      />
      <SalonBillingStaffTable
        acceptedStaff={acceptedStaff}
        assignedBarberIds={assignedBarberIds}
        seats={seats}
        isPlatformAdmin={isPlatformAdmin}
        subscription={subscription}
        onAssign={(extra) => setModal({ type: "assign", extra, salonId: String(salonId || "") })}
        onRevoke={(extra) => setModal({ type: "revoke", extra, salonId: String(salonId || "") })}
      />
      <SalonBillingPendingPaymentCard
        latestPendingAttempt={latestPendingAttempt}
        isConfirmablePayment={isConfirmablePayment}
        isPlatformAdmin={isPlatformAdmin}
        onConfirmPayment={(extra) =>
          setModal({ type: "confirmPayment", extra, salonId: String(salonId || "") })
        }
      />
      <SalonBillingPaymentHistory
        payments={payments}
        paymentsTotal={paymentsTotal}
        totalPaymentsPages={totalPaymentsPages}
        paymentsPage={paymentsPage}
        subscriptionIsCancelled={subscriptionIsCancelled}
        onPageChange={setPaymentsPage}
      />
      {/* ─── Modals ─── */}
      {/* Activate / Renew */}
      <PlatformActionModal
        key={modal?.type === "activate" ? "activate-open" : "activate-closed"}
        isOpen={modal?.type === "activate"}
        onClose={closeModal}
        onConfirm={handleActivateConfirm}
        title={subscription ? "Renew subscription" : "Activate subscription"}
        warning={`This will ${subscription ? "renew" : "activate"} the salon subscription${subscription ? ` (${subscription.seatCount} seats, ${getProviderLabel(subscription.provider)})` : " (manual provider)"}. An audit note is required.`}
        confirmLabel={subscription ? "Renew" : "Activate"}
        isSubmitting={isSubmitting}
        error={modalError}
      >
        {!subscription && (
          <div className="space-y-3">
            <div>
              <label
                htmlFor="activate-seats"
                className="mb-1 block text-xs font-medium text-neutral-700"
              >
                Seat count
              </label>
              <input
                id="activate-seats"
                type="number"
                min="1"
                defaultValue="1"
                onChange={(e) =>
                  setModal((prev) =>
                    prev
                      ? { ...prev, extra: { ...prev.extra, seatCount: Number(e.target.value) } }
                      : prev
                  )
                }
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              />
            </div>
            <div>
              <label
                htmlFor="activate-months"
                className="mb-1 block text-xs font-medium text-neutral-700"
              >
                Period (months)
              </label>
              <input
                id="activate-months"
                type="number"
                min="1"
                defaultValue="1"
                onChange={(e) =>
                  setModal((prev) =>
                    prev
                      ? { ...prev, extra: { ...prev.extra, months: Number(e.target.value) } }
                      : prev
                  )
                }
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              />
            </div>
          </div>
        )}
        {subscription && (
          <p className="text-sm text-neutral-500">
            Renewing extends the current period. Current seat count:{" "}
            <strong>{subscription.seatCount}</strong>.
          </p>
        )}
      </PlatformActionModal>
      {/* Update seat count */}
      <PlatformActionModal
        key={modal?.type === "seatCount" ? "seat-count-open" : "seat-count-closed"}
        isOpen={modal?.type === "seatCount"}
        onClose={closeModal}
        onConfirm={handleSeatCountConfirm}
        title="Update seat count"
        warning={`Current: ${seats?.total ?? 0} total, ${seats?.used ?? 0} used. New count must be positive and cannot be lower than used seats.`}
        confirmLabel="Update"
        isSubmitting={isSubmitting}
        error={modalError}
      >
        <div>
          <label
            htmlFor="seatcount-input"
            className="mb-1 block text-xs font-medium text-neutral-700"
          >
            New seat count
          </label>
          <input
            id="seatcount-input"
            type="number"
            min={Math.max(1, seats?.used ?? 0)}
            defaultValue={Math.max(1, seats?.total ?? 1)}
            onChange={(e) =>
              setModal((prev) =>
                prev
                  ? { ...prev, extra: { ...prev.extra, newSeatCount: Number(e.target.value) } }
                  : prev
              )
            }
            className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Used seats: <strong>{seats?.used ?? 0}</strong>
          </p>
        </div>
      </PlatformActionModal>
      {/* Assign seat */}
      <PlatformActionModal
        key={modal?.type === "assign" ? `assign-${modal?.extra?.barberId || "select"}` : "assign-closed"}
        isOpen={modal?.type === "assign"}
        onClose={closeModal}
        onConfirm={handleAssignConfirm}
        title="Assign seat"
        warning={
          modal?.extra?.barberName
            ? `Assign a subscription seat to "${modal.extra.barberName}".`
            : "Select a staff member from the list below."
        }
        confirmLabel="Assign"
        isSubmitting={isSubmitting}
        error={modalError}
      >
        {!modal?.extra?.barberId ? (
          <div>
            <label
              htmlFor="assign-staff"
              className="mb-1 block text-xs font-medium text-neutral-700"
            >
              Select staff member
            </label>
            <select
              id="assign-staff"
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              defaultValue=""
              onChange={(e) =>
                setModal((prev) => {
                  const selected = acceptedStaff.find((s) => s.id === e.target.value);
                  return prev
                    ? {
                        ...prev,
                        extra: {
                          barberId: e.target.value,
                          barberName: selected?.name || "Selected staff",
                        },
                      }
                    : prev;
                })
              }
            >
              <option value="" disabled>
                -- Select staff --
              </option>
              {acceptedStaff
                .filter((s) => !assignedBarberIds.has(String(s.id)))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || "Unnamed"} {s.email ? `(${s.email})` : ""}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              Only accepted staff without an active seat are shown.
            </p>
          </div>
        ) : (
          <p className="text-sm text-neutral-600">
            Assign seat to <strong>{modal.extra.barberName}</strong>.
          </p>
        )}
      </PlatformActionModal>
      {/* Revoke seat */}
      <PlatformActionModal
        key={modal?.type === "revoke" ? `revoke-${modal?.extra?.barberId || "select"}` : "revoke-closed"}
        isOpen={modal?.type === "revoke"}
        onClose={closeModal}
        onConfirm={handleRevokeConfirm}
        title="Revoke seat"
        warning={
          modal?.extra?.barberName
            ? `Revoke the subscription seat from "${modal.extra.barberName}". This action cannot be undone manually. The barber will lose access to subscription benefits.`
            : "Revoke seat from a staff member."
        }
        confirmLabel="Revoke"
        isSubmitting={isSubmitting}
        error={modalError}
      >
        {!modal?.extra?.barberId && (
          <div>
            <label
              htmlFor="revoke-staff"
              className="mb-1 block text-xs font-medium text-neutral-700"
            >
              Select staff member with active seat
            </label>
            <select
              id="revoke-staff"
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              defaultValue=""
              onChange={(e) =>
                setModal((prev) => {
                  const selected = acceptedStaff.find((s) => s.id === e.target.value);
                  return prev
                    ? {
                        ...prev,
                        extra: {
                          barberId: e.target.value,
                          barberName: selected?.name || "Selected staff",
                        },
                      }
                    : prev;
                })
              }
            >
              <option value="" disabled>
                -- Select staff --
              </option>
              {acceptedStaff
                .filter((s) => assignedBarberIds.has(String(s.id)))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || "Unnamed"} {s.email ? `(${s.email})` : ""}
                  </option>
                ))}
            </select>
          </div>
        )}
      </PlatformActionModal>
      {/* Cancel subscription */}
      <PlatformActionModal
        key={modal?.type === "cancel" ? "cancel-open" : "cancel-closed"}
        isOpen={modal?.type === "cancel"}
        onClose={closeModal}
        onConfirm={handleCancelConfirm}
        title="Cancel subscription"
        warning="This will deactivate the salon subscription. Payment history and records will remain. Seats currently assigned will remain but access will be revoked."
        confirmLabel="Cancel subscription"
        isSubmitting={isSubmitting}
        error={modalError}
      />
      {/* Confirm payment */}
      <PlatformActionModal
        key={modal?.type === "confirmPayment" ? "confirm-payment-open" : "confirm-payment-closed"}
        isOpen={modal?.type === "confirmPayment"}
        onClose={closeModal}
        onConfirm={handlePaymentConfirm}
        title="Confirm manual payment"
        warning={`This will mark the pending ${formatCurrency(latestPendingAttempt?.amount || 0)} payment as paid and activate/extend the subscription period.`}
        confirmLabel="Confirm payment"
        isSubmitting={isSubmitting}
        error={modalError}
      />
    </div>
  );
}
