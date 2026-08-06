import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import api from "@/shared/api/axios";
import {
  assignSalonSeat,
  cancelSubscriptionPaymentAttempt,
  createSubscriptionPaymentIntent,
  devConfirmSubscriptionPaymentAttempt,
  devConfirmSubscriptionSeatUpdate,
  extendManualSubscription,
  getSalonSubscription,
  getSalonSubscriptionPayments,
  revokeSalonSeat,
} from "@/shared/api/subscriptions";
import {
  getIdString,
  getSalonList,
  getSalonId,
  normalizeError,
} from "../utils/salonBillingFormatters";
import { getActiveSeatMemberIds, getAssignableMembers, getBillingInputs, getBillingPurchaseTotals, getSeatUsagePercent, getAttemptId, getSelectedSalon, normalizeBillingCount } from "../utils/salonBillingHelpers";
const isRequestCurrent = (ref, requestId, mountedRef) =>
  mountedRef.current && ref.current === requestId;

export function useSalonBilling() {
  const { currentUser } = useSelector((state) => state.auth);
  const [salons, setSalons] = useState([]);
  const [selectedSalonId, setSelectedSalonId] = useState("");
  const [details, setDetails] = useState(null);
  const [seatCountInput, setSeatCountInput] = useState("1");
  const [paymentMonths, setPaymentMonths] = useState("1");
  const [manualSeatCount, setManualSeatCount] = useState("1");
  const [manualMonths, setManualMonths] = useState("1");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [loadingSalons, setLoadingSalons] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingAttempt, setPendingAttempt] = useState(null);
  const [attemptActionError, setAttemptActionError] = useState("");
  const [payments, setPayments] = useState([]);
  const [paymentsError, setPaymentsError] = useState("");
  const [preparingPayment, setPreparingPayment] = useState(false);
  const [manualActivating, setManualActivating] = useState(false);
  const [confirmingAttempt, setConfirmingAttempt] = useState(false);
  const [cancellingAttempt, setCancellingAttempt] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const mountedRef = useRef(true);
  const selectedSalonIdRef = useRef("");
  const salonsRequestRef = useRef(0);
  const detailsRequestRef = useRef(0);
  const mutationRequestRef = useRef(0);

  useEffect(() => {
    selectedSalonIdRef.current = selectedSalonId;
  }, [selectedSalonId]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      salonsRequestRef.current += 1;
      detailsRequestRef.current += 1;
      mutationRequestRef.current += 1;
    };
  }, []);
  const loadDetails = useCallback(async (salonId, { keepMessage = false } = {}) => {
    if (!salonId) {
      if (mountedRef.current) {
        setDetails(null);
        setPendingAttempt(null);
        setPayments([]);
        setPaymentsError("");
      }
      return;
    }

    const requestId = ++detailsRequestRef.current;
    setLoadingDetails(true);
    setError("");
    if (!keepMessage) setSuccess("");

    try {
      const data = await getSalonSubscription(salonId);
      if (!isRequestCurrent(detailsRequestRef, requestId, mountedRef)) return;

      setDetails(data);
      setPendingAttempt(data?.pendingPaymentAttempt || null);
      setAttemptActionError("");
      setPaymentsError("");

      try {
        const paymentData = await getSalonSubscriptionPayments(salonId);
        if (!isRequestCurrent(detailsRequestRef, requestId, mountedRef)) return;
        setPayments(Array.isArray(paymentData) ? paymentData : []);
      } catch (paymentError) {
        if (!isRequestCurrent(detailsRequestRef, requestId, mountedRef)) return;
        setPayments([]);
        setPaymentsError(
          normalizeError(paymentError, "Could not load salon payment history.")
        );
      }

      const nextSeatCount = String(data?.subscription?.seatCount || 1);
      if (!isRequestCurrent(detailsRequestRef, requestId, mountedRef)) return;
      setSeatCountInput(nextSeatCount);
      setManualSeatCount(nextSeatCount);
      setSelectedMemberId("");
    } catch (requestError) {
      if (!isRequestCurrent(detailsRequestRef, requestId, mountedRef)) return;
      setDetails(null);
      setPendingAttempt(null);
      setPayments([]);
      setPaymentsError("");
      setError(
        normalizeError(requestError, "Could not load salon subscription.")
      );
    } finally {
      if (isRequestCurrent(detailsRequestRef, requestId, mountedRef)) {
        setLoadingDetails(false);
      }
    }
  }, []);

  useEffect(() => {
    const requestId = ++salonsRequestRef.current;

    async function loadSalons() {
      setLoadingSalons(true);
      setError("");

      try {
        const { data } = await api.get("/salons/mine/manageable");
        if (!isRequestCurrent(salonsRequestRef, requestId, mountedRef)) return;

        const nextSalons = getSalonList(data);
        setSalons(nextSalons);

        const nextSelectedId = getSalonId(nextSalons[0]);
        setSelectedSalonId(nextSelectedId);
        if (nextSelectedId) {
          await loadDetails(nextSelectedId);
        } else {
          setDetails(null);
          setPendingAttempt(null);
          setPayments([]);
          setPaymentsError("");
        }
      } catch (requestError) {
        if (!isRequestCurrent(salonsRequestRef, requestId, mountedRef)) return;
        setError(
          normalizeError(requestError, "Could not load salons you can manage.")
        );
      } finally {
        if (isRequestCurrent(salonsRequestRef, requestId, mountedRef)) {
          setLoadingSalons(false);
        }
      }
    }

    loadSalons();
  }, [loadDetails]);

  const activeSeats = useMemo(() => details?.activeSeats || [], [details]);
  const revokedSeats = useMemo(() => details?.revokedSeats || [], [details]);
  const approvedMembers = useMemo(() => details?.approvedMembers || [], [details]);
  const subscription = details?.subscription || null;
  const plan = details?.defaultPlan || null;
  const subscriptionIsActive = subscription?.isActive === true;
  const subscriptionIsCancelled = subscription?.status === "cancelled";
  const currency = subscription?.currency || plan?.currency || "AMD";
  const pricePerSeat = Number(subscription?.pricePerSeat || plan?.pricePerSeat || 0);
  const showManualActivationPanel =
    import.meta.env.DEV || details?.manualActivationAvailable;
  const availableSeatCount = Number(details?.availableSeatCount || 0);
  const paidSeatCount = Number(subscription?.seatCount || 0);
  const daysRemaining = subscription?.daysRemaining ?? 0;
  const usedSeatCount = activeSeats.length;
  const { purchaseSeatCount, purchaseMonths, purchaseMonthlyTotal, purchaseTotal } =
    getBillingPurchaseTotals({ pricePerSeat, seatCount: seatCountInput, months: paymentMonths });
  const manualActivationSeatCount = normalizeBillingCount(manualSeatCount);
  const activeSeatMemberIds = useMemo(
    () => getActiveSeatMemberIds(activeSeats),
    [activeSeats]
  );
  const assignableMembers = useMemo(
    () => getAssignableMembers(approvedMembers, activeSeats),
    [approvedMembers, activeSeats]
  );
  const selectedSalon = getSelectedSalon(salons, selectedSalonId);
  const canAssignSeat =
    Boolean(selectedMemberId) &&
    subscriptionIsActive &&
    availableSeatCount > 0 &&
    Boolean(subscription) &&
    !saving;
  const attemptIsSeatUpdate = pendingAttempt?.action === "update_seats";
  const attemptId = getAttemptId(pendingAttempt);
  const expiryDate = subscription?.renewalRequiredAt || subscription?.currentPeriodEnd;
  const activeCapacity = subscriptionIsActive ? paidSeatCount : 0;
  const seatUsagePercent = getSeatUsagePercent(usedSeatCount, activeCapacity);
  const visibleAvailableSeatCount = subscriptionIsActive ? availableSeatCount : 0;

  const refreshSelectedSalon = useCallback(() => {
    if (selectedSalonIdRef.current) {
      loadDetails(selectedSalonIdRef.current);
    }
  }, [loadDetails]);

  const handleSalonChange = useCallback(
    (nextSalonId) => {
      setSelectedSalonId(nextSalonId);
      if (nextSalonId) {
        loadDetails(nextSalonId);
      } else {
        setDetails(null);
        setPendingAttempt(null);
        setPayments([]);
        setPaymentsError("");
      }
    },
    [loadDetails]
  );

  const getMutationContext = () => {
    const mutationId = ++mutationRequestRef.current;
    const targetSalonId = selectedSalonIdRef.current;
    return { mutationId, targetSalonId };
  };

  const isCurrentMutation = (mutationId, targetSalonId) =>
    mountedRef.current &&
    mutationRequestRef.current === mutationId &&
    selectedSalonIdRef.current === targetSalonId;

  const handleAssignSeat = useCallback(async () => {
    const targetSalonId = selectedSalonId || selectedSalonIdRef.current;
    if (!targetSalonId || !selectedMemberId || saving) return;

    const { mutationId } = getMutationContext();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await assignSalonSeat(targetSalonId, selectedMemberId);
      if (!isCurrentMutation(mutationId, targetSalonId)) return;
      setSuccess("Seat assigned.");
      await loadDetails(targetSalonId, { keepMessage: true });
    } catch (requestError) {
      if (!isCurrentMutation(mutationId, targetSalonId)) return;
      setError(normalizeError(requestError, "Could not assign seat."));
    } finally {
      if (isCurrentMutation(mutationId, targetSalonId)) {
        setSaving(false);
      }
    }
  }, [loadDetails, selectedMemberId, selectedSalonId, saving]);

  const handleRevokeSeat = useCallback(
    async (seatId) => {
      const targetSalonId = selectedSalonId || selectedSalonIdRef.current;
      if (!seatId || saving) return;

      const { mutationId } = getMutationContext();
      setSaving(true);
      setError("");
      setSuccess("");

      try {
        await revokeSalonSeat(seatId);
        if (!isCurrentMutation(mutationId, targetSalonId)) return;
        setSuccess("Seat revoked.");
        await loadDetails(targetSalonId, { keepMessage: true });
      } catch (requestError) {
        if (!isCurrentMutation(mutationId, targetSalonId)) return;
        setError(normalizeError(requestError, "Could not revoke seat."));
      } finally {
        if (isCurrentMutation(mutationId, targetSalonId)) {
          setSaving(false);
        }
      }
    },
    [loadDetails, selectedSalonId, saving]
  );

  const handlePreparePayment = useCallback(
    async (action = "renew") => {
      const targetSalonId = selectedSalonId || selectedSalonIdRef.current;
      const { seatCount: nextSeatCount, months, validationError } = getBillingInputs({
        salonId: targetSalonId,
        seatCount: seatCountInput,
        months: paymentMonths,
        requireMonths: action === "renew",
      });
      if (validationError) {
        setError(validationError);
        return;
      }

      const { mutationId } = getMutationContext();
      setPreparingPayment(true);
      setError("");
      setSuccess("");
      setAttemptActionError("");

      try {
        const data = await createSubscriptionPaymentIntent({
          ownerType: "salon",
          ownerId: targetSalonId,
          seatCount: nextSeatCount,
          months: action === "renew" ? months : 1,
          action,
        });
        if (!isCurrentMutation(mutationId, targetSalonId)) return;
        setPendingAttempt(data.paymentAttempt || null);
      } catch (requestError) {
        if (!isCurrentMutation(mutationId, targetSalonId)) return;
        setError(normalizeError(requestError, "Could not prepare payment."));
      } finally {
        if (isCurrentMutation(mutationId, targetSalonId)) {
          setPreparingPayment(false);
        }
      }
    },
    [paymentMonths, seatCountInput, selectedSalonId]
  );

  const handleConfirmAttempt = useCallback(async () => {
    const targetSalonId = selectedSalonId || selectedSalonIdRef.current;
    if (!attemptId || confirmingAttempt) return;

    const { mutationId } = getMutationContext();
    setConfirmingAttempt(true);
    setAttemptActionError("");

    try {
      const result = attemptIsSeatUpdate
        ? await devConfirmSubscriptionSeatUpdate(attemptId)
        : await devConfirmSubscriptionPaymentAttempt(attemptId);
      if (!isCurrentMutation(mutationId, targetSalonId)) return;
      setPendingAttempt(result.paymentAttempt || null);
      setSuccess(
        attemptIsSeatUpdate ? "Seats updated successfully." : "Payment confirmed."
      );
      await loadDetails(targetSalonId, { keepMessage: true });
    } catch (requestError) {
      if (!isCurrentMutation(mutationId, targetSalonId)) return;
      setAttemptActionError(
        normalizeError(requestError, "Could not confirm payment attempt.")
      );
    } finally {
      if (isCurrentMutation(mutationId, targetSalonId)) {
        setConfirmingAttempt(false);
      }
    }
  }, [attemptId, attemptIsSeatUpdate, confirmingAttempt, loadDetails, selectedSalonId]);

  const handleCancelAttempt = useCallback(async () => {
    const targetSalonId = selectedSalonId || selectedSalonIdRef.current;
    if (!attemptId || cancellingAttempt) return;

    const { mutationId } = getMutationContext();
    setCancellingAttempt(true);
    setAttemptActionError("");

    try {
      await cancelSubscriptionPaymentAttempt(attemptId);
      if (!isCurrentMutation(mutationId, targetSalonId)) return;
      setPendingAttempt(null);
      setSuccess("Prepared payment cancelled.");
      await loadDetails(targetSalonId, { keepMessage: true });
    } catch (requestError) {
      if (!isCurrentMutation(mutationId, targetSalonId)) return;
      setAttemptActionError(
        normalizeError(requestError, "Could not cancel payment attempt.")
      );
    } finally {
      if (isCurrentMutation(mutationId, targetSalonId)) {
        setCancellingAttempt(false);
      }
    }
  }, [attemptId, cancellingAttempt, loadDetails, selectedSalonId]);

  const handleManualActivation = useCallback(async () => {
    const targetSalonId = selectedSalonId || selectedSalonIdRef.current;
    if (!targetSalonId) return;

    const { seatCount: nextSeatCount, months, validationError } = getBillingInputs({
      salonId: targetSalonId,
      seatCount: manualSeatCount,
      months: manualMonths,
      requireMonths: true,
      defaultMonths: false,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    const { mutationId } = getMutationContext();
    setManualActivating(true);
    setError("");
    setSuccess("");

    try {
      await extendManualSubscription({
        ownerType: "salon",
        ownerId: targetSalonId,
        payerId: getIdString(currentUser),
        seatCount: nextSeatCount,
        months,
      });
      if (!isCurrentMutation(mutationId, targetSalonId)) return;
      setSuccess("Salon subscription activated manually.");
      await loadDetails(targetSalonId, { keepMessage: true });
    } catch (requestError) {
      if (!isCurrentMutation(mutationId, targetSalonId)) return;
      setError(normalizeError(requestError, "Manual activation is not available."));
    } finally {
      if (isCurrentMutation(mutationId, targetSalonId)) {
        setManualActivating(false);
      }
    }
  }, [currentUser, loadDetails, manualMonths, manualSeatCount, selectedSalonId]);

  return {
    activeCapacity,
    activeSeatMemberIds,
    activeSeats,
    approvedMembers,
    attemptActionError,
    attemptId,
    attemptIsSeatUpdate,
    assignableMembers,
    availableSeatCount,
    canAssignSeat,
    cancellingAttempt,
    currency,
    details,
    daysRemaining,
    expiryDate,
    handleAssignSeat,
    handleCancelAttempt,
    handleConfirmAttempt,
    handleManualActivation,
    handlePreparePayment,
    handleRevokeSeat,
    handleSalonChange,
    loadDetails,
    loadingDetails,
    loadingSalons,
    manualActivating,
    manualActivationSeatCount,
    manualMonths,
    manualSeatCount,
    error,
    paymentMonths,
    paidSeatCount,
    pricePerSeat,
    payments,
    paymentsError,
    pendingAttempt,
    plan,
    preparingPayment,
    purchaseMonths,
    purchaseMonthlyTotal,
    purchaseSeatCount,
    purchaseTotal,
    refreshSelectedSalon,
    revokedSeats,
    saving,
    seatCountInput,
    seatUsagePercent,
    selectedMemberId,
    selectedSalon,
    selectedSalonId,
    setManualMonths,
    setManualSeatCount,
    setPaymentMonths,
    setSeatCountInput,
    setSelectedMemberId,
    salons,
    setSuccess,
    showManualActivationPanel,
    success,
    subscription,
    subscriptionIsActive,
    subscriptionIsCancelled,
    usedSeatCount,
    visibleAvailableSeatCount,
  };
}
