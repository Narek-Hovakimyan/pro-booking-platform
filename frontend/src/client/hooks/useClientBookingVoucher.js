import { useCallback, useEffect, useRef, useState } from "react";

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
  const previousServiceIdRef = useRef(selectedServiceEntityId);
  const discoveryRequestIdRef = useRef(0);
  const voucherContextKey = [selectedBarberId, selectedSalonId, selectedServiceEntityId]
    .map((value) => String(value || ""))
    .join(":");

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

  const removeVoucher = useCallback(() => {
    setVoucherCode("");
    setVoucherPreview(null);
    setDiscountPreview(0);
    clearBookingQuote();
    setQuoteError("");
    setVoucherError("");
  }, [clearBookingQuote, setQuoteError, setVoucherCode]);

  const applyVoucher = useCallback(
    async (code) => {
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

        if (data.valid) {
          clearBookingQuote();
          setVoucherCode(code);
          setVoucherPreview(data.voucher);
          setDiscountPreview(data.discountPreview);
          setVoucherError("");
        }
      } catch (err) {
        setVoucherPreview(null);
        setDiscountPreview(0);
        setVoucherCode("");
        setVoucherError(
          err.response?.data?.message || "Invalid or expired voucher code"
        );
      } finally {
        setVoucherLoading(false);
      }
    },
    [
      clearBookingQuote,
      selectedBarberId,
      selectedSalonId,
      selectedServiceEntityId,
      setVoucherCode,
    ]
  );

  const voucherCodeChange = useCallback(() => {
    if (voucherCode) {
      removeVoucher();
    }
  }, [removeVoucher, voucherCode]);

  useEffect(() => {
    const resetId = window.setTimeout(() => {
      if (
        previousServiceIdRef.current &&
        previousServiceIdRef.current !== selectedServiceEntityId
      ) {
        removeVoucher();
      }

      clearBookingQuote();
      setQuoteError("");
      previousServiceIdRef.current = selectedServiceEntityId;
    }, 0);

    return () => window.clearTimeout(resetId);
  }, [clearBookingQuote, removeVoucher, selectedServiceEntityId, setQuoteError]);

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
