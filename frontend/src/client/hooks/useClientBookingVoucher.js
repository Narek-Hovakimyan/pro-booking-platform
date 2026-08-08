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
  const [voucherPreview, setVoucherPreview] = useState(null);
  const [discountPreview, setDiscountPreview] = useState(0);
  const [voucherError, setVoucherError] = useState("");
  const [voucherLoading, setVoucherLoading] = useState(false);
  const previousServiceIdRef = useRef(selectedServiceEntityId);

  useEffect(() => {
    if (!selectedBarberId) return;

    api
      .get(`/vouchers/public/barber/${selectedBarberId}`)
      .then(({ data }) => {
        setPublicVouchers(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setPublicVouchers([]);
      });
  }, [selectedBarberId]);

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
    publicVouchers,
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
