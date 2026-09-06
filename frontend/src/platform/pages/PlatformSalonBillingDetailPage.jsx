import {
  AlertTriangle,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import {
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
import {
  getSalonBillingDetailSalonId,
  usePlatformSalonBillingDetail,
} from "./usePlatformSalonBillingDetail";

/* ─── Page Component ──────────────────────────────────── */
export default function PlatformSalonBillingDetailPage() {
  const navigate = useNavigate();
  const { salonId } = useParams();
  const { currentUser } = useSelector((state) => state.auth);
  const isPlatformAdmin = canAccessPlatform(currentUser);
  const modalFallbackFocusRef = useRef(null);
  const activationOperationKeysRef = useRef(new Map());
  const {
    detail,
    payments,
    paymentsTotal,
    paymentsPage,
    setPaymentsPage,
    routeRevision,
    isLoading,
    error,
    errorSalonId,
    successMessage,
    refreshWarning,
    isSubmitting,
    mutationError,
    setMutationError,
    clearMutationError,
    executeMutation,
  } = usePlatformSalonBillingDetail(salonId);
  const [storedModal, setModal] = useState(null);
  const modal =
    storedModal?.routeRevision === routeRevision ? storedModal : null;
  const openModal = (nextModal) => {
    setModal({ ...nextModal, routeRevision });
  };

  const closeModal = () => {
    setModal(null);
    clearMutationError();
  };
  const handleMutation = (apiCall, note, targetSalonId, onSuccess) => {
    executeMutation({
      apiCall,
      note,
      targetSalonId,
      onSuccess: () => {
        onSuccess?.();
        setModal(null);
      },
    });
  };
  const handleActivateConfirm = (note) => {
    const targetSalonId = modal?.salonId;
    const payload = {
      note,
      seatCount: modal?.extra?.seatCount || 1,
      months: modal?.extra?.months || 1,
    };
    const operationIdentity = JSON.stringify({
      salonId: targetSalonId,
      months: payload.months,
      seatCount: payload.seatCount,
      note: payload.note.trim(),
    });
    let idempotencyKey = activationOperationKeysRef.current.get(operationIdentity);
    if (!idempotencyKey) {
      idempotencyKey = globalThis.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activationOperationKeysRef.current.set(operationIdentity, idempotencyKey);
    }
    handleMutation(async (n) => {
      return activatePlatformSalonSubscription(targetSalonId, { ...payload, note: n }, idempotencyKey);
    }, note, targetSalonId, () => {
      activationOperationKeysRef.current.delete(operationIdentity);
    });
  };
  /* ── Update seat count ── */
  const handleSeatCountConfirm = (note) => {
    const targetSalonId = modal?.salonId;
    const newCount = Number(modal?.extra?.newSeatCount);
    if (!Number.isInteger(newCount) || newCount < 1) {
      setMutationError("Seat count must be a positive integer.");
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
      setMutationError("No staff member selected.");
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
      setMutationError("No staff member selected.");
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
      setMutationError("No payment selected.");
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
    Boolean(detail) && getSalonBillingDetailSalonId(detail) === routeSalonId;
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
    <div
      ref={modalFallbackFocusRef}
      aria-label="Salon billing detail"
      className="space-y-6"
      role="region"
      tabIndex={-1}
    >
      <SalonBillingHeader
        salon={currentDetail.salon}
        subscription={subscription}
        isPlatformAdmin={isPlatformAdmin}
        onBack={() => navigate("/admin/platform/billing")}
        successMessage={successMessage}
        onActivate={() => openModal({ type: "activate", salonId: String(salonId || "") })}
        onUpdateSeatCount={() => openModal({ type: "seatCount", salonId: String(salonId || "") })}
        onCancel={() => openModal({ type: "cancel", salonId: String(salonId || "") })}
      />
      {refreshWarning && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{refreshWarning}</span>
        </div>
      )}
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
        onAssign={(extra) => openModal({ type: "assign", extra, salonId: String(salonId || "") })}
        onRevoke={(extra) => openModal({ type: "revoke", extra, salonId: String(salonId || "") })}
      />
      <SalonBillingPendingPaymentCard
        latestPendingAttempt={latestPendingAttempt}
        isConfirmablePayment={isConfirmablePayment}
        isPlatformAdmin={isPlatformAdmin}
        onConfirmPayment={(extra) =>
          openModal({ type: "confirmPayment", extra, salonId: String(salonId || "") })
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
        error={mutationError}
        fallbackFocusRef={modalFallbackFocusRef}
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
        error={mutationError}
        fallbackFocusRef={modalFallbackFocusRef}
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
        error={mutationError}
        fallbackFocusRef={modalFallbackFocusRef}
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
        error={mutationError}
        fallbackFocusRef={modalFallbackFocusRef}
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
        error={mutationError}
        fallbackFocusRef={modalFallbackFocusRef}
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
        error={mutationError}
        fallbackFocusRef={modalFallbackFocusRef}
      />
    </div>
  );
}
