import { useCallback, useEffect, useRef, useState } from "react";

import {
  getPlatformBillingSalonDetail,
  getPlatformBillingSalonPayments,
} from "@/shared/api/platformBilling";

const getEntityId = (entity) => entity?.id ?? entity?._id ?? entity ?? null;

export const getSalonBillingDetailSalonId = (detail) => {
  const id = getEntityId(detail?.salon);
  return id ? String(id) : "";
};

export function usePlatformSalonBillingDetail(salonId) {
  const [detail, setDetail] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [routeRevision, setRouteRevision] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorSalonId, setErrorSalonId] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const detailRequestRef = useRef(0);
  const paymentsRequestRef = useRef(0);
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

  const fetchPayments = useCallback(
    async (targetSalonId = String(salonId || "")) => {
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
        // Payment history is secondary to the salon billing detail.
      }
    },
    [paymentsPage, salonId]
  );

  useEffect(() => {
    currentRouteSalonIdRef.current = String(salonId || "");
  }, [salonId]);

  useEffect(() => {
    async function loadCurrentSalon() {
      setRouteRevision((revision) => revision + 1);
      setDetail(null);
      setPayments([]);
      setPaymentsTotal(0);
      setPaymentsPage(1);
      setError("");
      setErrorSalonId("");
      setSuccessMessage("");
      setRefreshWarning("");
      setMutationError("");
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
      paymentsRequestRef.current += 1;
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

    async function loadCurrentPayments() {
      await fetchPayments(targetSalonId);
    }
    loadCurrentPayments();
    return () => {
      paymentsRequestRef.current += 1;
    };
  }, [detail, fetchPayments, paymentsPage, salonId]);

  const clearMutationError = useCallback(() => {
    setMutationError("");
  }, []);

  const executeMutation = useCallback(
    async ({ apiCall, note, targetSalonId, onSuccess }) => {
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
        await fetchPayments(targetSalonId);
      } catch (err) {
        if (mutationRequestRef.current !== mutationId) return;
        const status = err.response?.status;
        if (status === 403 || status === 401) {
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
    [detail, fetchDetail, fetchPayments, salonId]
  );

  return {
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
  };
}
