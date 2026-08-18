import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import api from "@/shared/api/axios";
import { withClientBookingSalonContext } from "@/client/utils/clientBookingPayload";

export function useClientBookingVoucher({
  selectedBarberId,
  selectedServiceEntityId,
  selectedSalonId,
  voucherCode,
  setVoucherCode,
  clearBookingQuote,
  setQuoteError,
}) {
  const [publicVouchers, setPublicVouchers] = useState([]);
  const [publicVoucherContextKey, setPublicVoucherContextKey] = useState("");
  const [voucherPreview, setVoucherPreview] = useState(null);
  const [discountPreview, setDiscountPreview] = useState(0);
  const [voucherError, setVoucherError] = useState("");
  const [voucherLoading, setVoucherLoading] = useState(false);
  const discoveryRequestIdRef = useRef(0);
  const validationRequestIdRef = useRef(0);
  const voucherContextKey = [selectedBarberId, selectedSalonId, selectedServiceEntityId]
    .map((value) => String(value || ""))
    .join(":");
  const currentVoucherContextKeyRef = useRef(voucherContextKey);
  const previousVoucherContextKeyRef = useRef(voucherContextKey);

  useLayoutEffect(() => {
    currentVoucherContextKeyRef.current = voucherContextKey;
  }, [voucherContextKey]);

  useEffect(() => {
    const requestId = ++discoveryRequestIdRef.current;
    if (!selectedBarberId || !selectedServiceEntityId) {
      return undefined;
    }

    const params = new URLSearchParams({
      barberId: String(selectedBarberId),
      serviceId: String(selectedServiceEntityId),
    });
    if (selectedSalonId) params.set("salonId", String(selectedSalonId));

    api
      .get(`/vouchers/public/barber/${selectedBarberId}?${params}`)
      .then(({ data }) => {
        if (requestId !== discoveryRequestIdRef.current) return;
        setPublicVouchers(Array.isArray(data) ? data : []);
        setPublicVoucherContextKey(voucherContextKey);
      })
      .catch(() => {
        if (requestId !== discoveryRequestIdRef.current) return;
        setPublicVouchers([]);
        setPublicVoucherContextKey(voucherContextKey);
      });
    return undefined;
  }, [selectedBarberId, selectedSalonId, selectedServiceEntityId, voucherContextKey]);

  const clearVoucherState = useCallback(() => {
    validationRequestIdRef.current += 1;
    setVoucherCode("");
    setVoucherPreview(null);
    setDiscountPreview(0);
    setVoucherLoading(false);
    clearBookingQuote();
    setQuoteError("");
    setVoucherError("");
  }, [clearBookingQuote, setQuoteError, setVoucherCode]);

  const removeVoucher = useCallback(() => {
    clearVoucherState();
  }, [clearVoucherState]);

  const applyVoucher = useCallback(
    async (code) => {
      const requestId = ++validationRequestIdRef.current;
      const validationContextKey = voucherContextKey;
      setVoucherLoading(true);
      setVoucherError("");

      try {
        const { data } = await api.post(
          "/vouchers/validate",
          withClientBookingSalonContext(
            {
              code,
              barberId: selectedBarberId,
              serviceId: selectedServiceEntityId,
            },
            selectedSalonId
          )
        );

        if (
          requestId !== validationRequestIdRef.current ||
          validationContextKey !== currentVoucherContextKeyRef.current
        ) {
          return;
        }

        if (data.valid) {
          clearBookingQuote();
          setVoucherCode(code);
          setVoucherPreview(data.voucher);
          setDiscountPreview(data.discountPreview);
          setVoucherError("");
        }
      } catch (err) {
        if (
          requestId !== validationRequestIdRef.current ||
          validationContextKey !== currentVoucherContextKeyRef.current
        ) {
          return;
        }

        setVoucherPreview(null);
        setDiscountPreview(0);
        setVoucherCode("");
        setVoucherError(
          err.response?.data?.message || "Invalid or expired voucher code"
        );
      } finally {
        if (
          requestId === validationRequestIdRef.current &&
          validationContextKey === currentVoucherContextKeyRef.current
        ) {
          setVoucherLoading(false);
        }
      }
    },
    [
      clearBookingQuote,
      selectedBarberId,
      selectedSalonId,
      selectedServiceEntityId,
      setVoucherCode,
      voucherContextKey,
    ]
  );

  const voucherCodeChange = useCallback(() => {
    if (voucherCode) {
      removeVoucher();
    }
  }, [removeVoucher, voucherCode]);

  useEffect(() => {
    if (previousVoucherContextKeyRef.current !== voucherContextKey) {
      clearVoucherState();
    } else {
      clearBookingQuote();
      setQuoteError("");
    }

    previousVoucherContextKeyRef.current = voucherContextKey;
  }, [clearBookingQuote, clearVoucherState, setQuoteError, voucherContextKey]);

  return {
    applyVoucher,
    discountPreview,
    publicVouchers: publicVoucherContextKey === voucherContextKey ? publicVouchers : [],
    removeVoucher,
    setDiscountPreview,
    setPublicVouchers,
    setVoucherError,
    setVoucherLoading,
    setVoucherPreview,
    voucherCodeChange,
    voucherError,
    voucherLoading,
    voucherPreview,
  };
}
