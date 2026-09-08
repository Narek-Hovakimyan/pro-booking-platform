import { useCallback, useEffect, useRef, useState } from "react";

import {
  getPlatformBillingSalonDetail,
  getPlatformBillingSalonTransactions,
  getPlatformBillingSalonPaymentAttempts,
} from "@/shared/api/platformBilling";

const getEntityId = (entity) => entity?.id ?? entity?._id ?? entity ?? null;

export const getSalonBillingDetailSalonId = (detail) => {
  const id = getEntityId(detail?.salon);
  return id ? String(id) : "";
};

export function usePlatformSalonBillingDetail(salonId) {
  const [detail, setDetail] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [transactionsTotal, setTransactionsTotal] = useState(0);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [paymentAttempts, setPaymentAttempts] = useState([]);
  const [paymentAttemptsTotal, setPaymentAttemptsTotal] = useState(0);
  const [paymentAttemptsPage, setPaymentAttemptsPage] = useState(1);
  const [routeRevision, setRouteRevision] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorSalonId, setErrorSalonId] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [recentAuthChallenge, setRecentAuthChallenge] = useState(null);
  const detailRequestRef = useRef(0);
  const transactionsRequestRef = useRef(0);
  const paymentAttemptsRequestRef = useRef(0);
  const mutationRequestRef = useRef(0);
  const isMutationInFlightRef = useRef(false);
  const currentRouteSalonIdRef = useRef("");
  const successTimerRef = useRef(null);

  const fetchDetail = useCallback(
    async ({ isReconciliation = false } = {}) => {
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
        setRefreshWarning("");
        return result;
      } catch (err) {
        if (detailRequestRef.current !== requestId) return null;
        if (isReconciliation) {
          setRefreshWarning(
            "Action succeeded, but the latest billing data could not be refreshed."
          );
          return null;
        }

        setErrorSalonId(targetSalonId);
        if (err.response?.status === 403) {
          setError("Access denied. Platform superuser privileges required.");
        } else if (err.response?.status === 404) {
          setError("Salon not found.");
        } else {
          setError(
            err.response?.data?.message || "Failed to load salon billing detail."
          );
        }
        return null;
      } finally {
        if (detailRequestRef.current === requestId) setIsLoading(false);
      }
    },
    [salonId]
  );

  const fetchTransactions = useCallback(
    async (targetSalonId = String(salonId || "")) => {
      const requestId = ++transactionsRequestRef.current;
      if (!targetSalonId) return;

      try {
        const result = await getPlatformBillingSalonTransactions(targetSalonId, {
          page: transactionsPage,
          limit: 10,
        });
        if (transactionsRequestRef.current !== requestId) return;
        setTransactions(result.transactions || []);
        setTransactionsTotal(result.total || 0);
      } catch {
        // Payment history is secondary to the salon billing detail.
      }
    },
    [transactionsPage, salonId]
  );

  const fetchPaymentAttempts = useCallback(
    async (targetSalonId = String(salonId || "")) => {
      const requestId = ++paymentAttemptsRequestRef.current;
      if (!targetSalonId) return;
      try {
        const result = await getPlatformBillingSalonPaymentAttempts(targetSalonId, {
          page: paymentAttemptsPage,
          limit: 10,
        });
        if (paymentAttemptsRequestRef.current !== requestId) return;
        setPaymentAttempts(result.paymentAttempts || []);
        setPaymentAttemptsTotal(result.total || 0);
      } catch {
        // Attempts are secondary to the billing detail.
      }
    },
    [paymentAttemptsPage, salonId]
  );

  useEffect(() => {
    currentRouteSalonIdRef.current = String(salonId || "");
  }, [salonId]);

  useEffect(() => {
    async function loadCurrentSalon() {
      setRouteRevision((revision) => revision + 1);
      setDetail(null);
      setTransactions([]);
      setTransactionsTotal(0);
      setTransactionsPage(1);
      setPaymentAttempts([]);
      setPaymentAttemptsTotal(0);
      setPaymentAttemptsPage(1);
      setError("");
      setErrorSalonId("");
      setSuccessMessage("");
      setRefreshWarning("");
      setMutationError("");
      setRecentAuthChallenge(null);
      setSubmitting(false);
      isMutationInFlightRef.current = false;
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
      transactionsRequestRef.current += 1;
      paymentAttemptsRequestRef.current += 1;
      mutationRequestRef.current += 1;
    };
  }, [fetchDetail]);

  useEffect(() => {
    const targetSalonId = String(salonId || "");
    if (
      !targetSalonId ||
      !detail ||
      getSalonBillingDetailSalonId(detail) !== targetSalonId
    ) {
      return undefined;
    }

    async function loadCurrentReadModels() {
      await Promise.all([fetchTransactions(targetSalonId), fetchPaymentAttempts(targetSalonId)]);
    }
    loadCurrentReadModels();
    return () => {
      transactionsRequestRef.current += 1;
      paymentAttemptsRequestRef.current += 1;
    };
  }, [detail, fetchPaymentAttempts, fetchTransactions, salonId]);

  const clearMutationError = useCallback(() => {
    setMutationError("");
  }, []);

  const executeMutation = useCallback(
    async ({ apiCall, note, targetSalonId, onSuccess, allowRecentAuthRetry = true }) => {
      const currentSalonId = String(salonId || "");
      const loadedSalonId = getSalonBillingDetailSalonId(detail);
      if (
        currentRouteSalonIdRef.current !== currentSalonId ||
        !targetSalonId ||
        targetSalonId !== currentSalonId ||
        loadedSalonId !== currentSalonId ||
        isMutationInFlightRef.current
      ) {
        return;
      }

      const mutationId = ++mutationRequestRef.current;
      isMutationInFlightRef.current = true;
      setSubmitting(true);
      setMutationError("");
      try {
        const mutationResult = await apiCall(note);
        if (mutationRequestRef.current !== mutationId) return;

        if (getSalonBillingDetailSalonId(mutationResult) === targetSalonId) {
          setDetail(mutationResult);
          setError("");
          setErrorSalonId("");
          setRefreshWarning("");
        }

        setSuccessMessage("Action completed successfully.");
        isMutationInFlightRef.current = false;
        setSubmitting(false);
        onSuccess?.();
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => {
          if (mutationRequestRef.current === mutationId) setSuccessMessage("");
        }, 5000);

        const refreshedDetail = await fetchDetail({ isReconciliation: true });
        if (
          mutationRequestRef.current !== mutationId ||
          (refreshedDetail &&
            getSalonBillingDetailSalonId(refreshedDetail) !== targetSalonId)
        ) {
          return;
        }
        await Promise.all([fetchTransactions(targetSalonId), fetchPaymentAttempts(targetSalonId)]);
      } catch (err) {
        if (mutationRequestRef.current !== mutationId) return;
        const status = err.response?.status;
        if (err.response?.data?.code === "RECENT_AUTH_REQUIRED") {
          if (allowRecentAuthRetry) {
            setRecentAuthChallenge({ apiCall, note, targetSalonId, onSuccess });
          } else {
            setMutationError("Recent authentication is still required. Please try again.");
          }
        } else if (status === 403 || status === 401) {
          setMutationError("Forbidden. Platform superuser privileges required.");
        } else if (status === 400) {
          setMutationError(err.response?.data?.message || "Validation error.");
        } else {
          setMutationError(
            err.response?.data?.message || "An unexpected error occurred."
          );
        }
      } finally {
        if (mutationRequestRef.current === mutationId) {
          isMutationInFlightRef.current = false;
          setSubmitting(false);
        }
      }
    },
    [detail, fetchDetail, fetchPaymentAttempts, fetchTransactions, salonId]
  );

  const retryRecentAuthMutation = useCallback(async () => {
    const pendingMutation = recentAuthChallenge;
    setRecentAuthChallenge(null);
    if (!pendingMutation) return;
    await executeMutation({ ...pendingMutation, allowRecentAuthRetry: false });
  }, [executeMutation, recentAuthChallenge]);

  return {
    detail,
    transactions,
    transactionsTotal,
    transactionsPage,
    setTransactionsPage,
    paymentAttempts,
    paymentAttemptsTotal,
    paymentAttemptsPage,
    setPaymentAttemptsPage,
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
    recentAuthChallenge,
    retryRecentAuthMutation,
    dismissRecentAuthChallenge: () => setRecentAuthChallenge(null),
  };
}
