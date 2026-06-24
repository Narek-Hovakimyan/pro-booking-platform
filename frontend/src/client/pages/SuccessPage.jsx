import { CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

export default function SuccessPage({ client, resetBooking }) {
  const location = useLocation();
  const payment = location.state?.payment;
  const booking = location.state?.booking;
  const servicePrice = Number(
    booking?.serviceOriginalPrice ?? booking?.originalPrice ?? booking?.price ?? 0
  );
  const serviceDiscountAmount = Number(booking?.serviceDiscountAmount || 0);
  const subtotalAfterServiceDiscount = Math.max(0, servicePrice - serviceDiscountAmount);
  const voucherDiscount = Number(booking?.voucherDiscount || 0);
  const loyaltyDiscount = Number(booking?.loyaltyDiscountAmount || 0);
  const finalPrice = Number(
    booking?.finalPrice ?? booking?.price ?? subtotalAfterServiceDiscount
  );
  const hasPriceBreakdown = Boolean(booking);
  const hasLoyaltyDiscount =
    Boolean(booking?.loyaltyDiscountApplied) && loyaltyDiscount > 0 && !voucherDiscount;

  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-5 p-6 text-center sm:p-8">
        <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />

        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Ամրագրումը հաստատված է
        </h1>

        <p className="text-neutral-500">
          {client.name ? `Շնորհակալություն, ${client.name}։` : "Շնորհակալություն։"}
        </p>

        {hasPriceBreakdown && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-left text-sm">
            <div className="font-semibold text-neutral-950">Price summary</div>
            <div className="mt-3 space-y-2">
              <div className="flex justify-between gap-4">
                <span className="text-neutral-500">Service price</span>
                <span className="font-semibold">{servicePrice.toLocaleString()} դր</span>
              </div>
              {serviceDiscountAmount > 0 && (
                <div className="flex justify-between gap-4 text-rose-700">
                  <span>Service discount</span>
                  <span className="font-semibold">-{serviceDiscountAmount.toLocaleString()} դր</span>
                </div>
              )}
              {voucherDiscount > 0 && (
                <div className="flex justify-between gap-4 text-amber-700">
                  <span>Promo code discount</span>
                  <span className="font-semibold">-{voucherDiscount.toLocaleString()} դր</span>
                </div>
              )}
              {hasLoyaltyDiscount && (
                <div className="flex justify-between gap-4 text-emerald-700">
                  <span>Loyalty discount ({Number(booking.loyaltyDiscountPercent || 0)}%)</span>
                  <span className="font-semibold">-{loyaltyDiscount.toLocaleString()} դր</span>
                </div>
              )}
              <div className="flex justify-between gap-4 border-t border-neutral-100 pt-2 text-neutral-950">
                <span className="font-semibold">Final price</span>
                <span className="font-bold">{finalPrice.toLocaleString()} դր</span>
              </div>
            </div>
          </div>
        )}

        {payment && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
            <div className="font-semibold">Deposit required</div>
            <p className="mt-2">
              Status: <span className="font-semibold">{payment.paymentStatus || "pending"}</span>
            </p>
            {payment.checkoutUrl ? (
              <a
                href={payment.checkoutUrl}
                className="mt-3 inline-flex rounded-lg bg-amber-900 px-3 py-2 font-semibold text-white transition hover:bg-amber-800"
              >
                Pay deposit
              </a>
            ) : (
              <p className="mt-2">
                {payment.message ||
                  "Deposit is required, but online payment is not enabled yet."}
              </p>
            )}
          </div>
        )}

        <Button className="w-full sm:w-auto" as={Link} to="/booking" onClick={resetBooking}>
          Նոր ամրագրում
        </Button>
      </CardContent>
    </Card>
  );
}
