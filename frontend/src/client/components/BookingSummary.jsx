import { CalendarDays, Clock, Scissors, User } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import DepositNotice from "@/shared/components/booking/DepositNotice";
import { getServicePriceInfo } from "@/shared/data/serviceCategories";
import { calculateDepositEstimate } from "@/shared/utils/deposit";

export default function BookingSummary({
  selectedService,
  selectedServiceId = "",
  selectedDateLabel,
  selectedTime,
  client,
  depositSettings = null,
  discountPreview = 0,
  pricingQuote = null,
  isServiceLoading = false,
}) {
  const priceInfo = getServicePriceInfo(selectedService);
  const servicePrice = Number(pricingQuote?.originalPrice ?? priceInfo.originalPrice);
  const serviceDiscountAmount = Number(
    pricingQuote?.serviceDiscountAmount ?? priceInfo.serviceDiscountAmount
  );
  const serviceDiscountedPrice = Number(
    pricingQuote?.serviceDiscountedPrice ?? priceInfo.discountedPrice
  );
  const promoDiscount = Math.max(
    0,
    Number(pricingQuote?.voucherDiscountAmount ?? discountPreview ?? 0)
  );
  const loyaltyDiscount = Math.max(0, Number(pricingQuote?.loyaltyDiscountAmount || 0));
  const hasLoyaltyDiscount =
    Boolean(pricingQuote?.loyaltyDiscountApplied) && loyaltyDiscount > 0 && !promoDiscount;
  const finalTotal = Math.max(
    0,
    Number(pricingQuote?.finalPrice ?? serviceDiscountedPrice - promoDiscount)
  );
  const totalDiscount = Math.max(0, servicePrice - finalTotal);
  const depositEstimate = calculateDepositEstimate(
    depositSettings,
    finalTotal
  );

  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <h3 className="text-lg font-bold">Ամրագրման ամփոփում</h3>

        <div className="space-y-3 text-sm text-neutral-600">
          <p className="flex items-center gap-3 rounded-xl bg-neutral-50 p-3">
            <Scissors className="h-4 w-4 shrink-0 text-neutral-500" />
            <span className="font-medium text-neutral-900">
              {isServiceLoading && selectedServiceId
                ? "Refreshing service price..."
                : selectedService?.name ||
                  (selectedServiceId
                    ? "Selected service is no longer available"
                    : "Ծառայություն ընտրված չէ")}
            </span>
          </p>

          <p className="flex items-center gap-3 rounded-xl bg-neutral-50 p-3">
            <CalendarDays className="h-4 w-4 shrink-0 text-neutral-500" />
            {selectedDateLabel || "Օր ընտրված չէ"}
          </p>

          <p className="flex items-center gap-3 rounded-xl bg-neutral-50 p-3">
            <Clock className="h-4 w-4 shrink-0 text-neutral-500" />
            <span className="font-semibold text-neutral-900">
              {selectedTime || "Ժամ ընտրված չէ"}
            </span>
          </p>

          <p className="flex items-center gap-3 rounded-xl bg-neutral-50 p-3">
            <User className="h-4 w-4 shrink-0 text-neutral-500" />
            {client.name || "Հաճախորդ"}
          </p>

          {selectedService && pricingQuote && (
            <div className="space-y-2 rounded-xl bg-neutral-50 p-3">
              <div className="flex justify-between gap-3">
                <span>Service price</span>
                <span className="font-semibold text-neutral-900">
                  {servicePrice.toLocaleString()} դր
                </span>
              </div>
              {serviceDiscountAmount > 0 && (
                <div className="flex justify-between gap-3 text-rose-700">
                  <span>Service discount</span>
                  <span className="font-semibold">
                    -{serviceDiscountAmount.toLocaleString()} դր
                  </span>
                </div>
              )}
              {promoDiscount > 0 && (
                <div className="flex justify-between gap-3 text-amber-700">
                  <span>Promo discount</span>
                  <span className="font-semibold">
                    -{promoDiscount.toLocaleString()} դր
                  </span>
                </div>
              )}
              {hasLoyaltyDiscount && (
                <div className="flex justify-between gap-3 text-emerald-700">
                  <span>Loyalty discount</span>
                  <span className="font-semibold">
                    -{loyaltyDiscount.toLocaleString()} դր
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t border-neutral-200 pt-2 text-neutral-950">
                <span className="font-semibold">Final price</span>
                <span className="font-bold">
                  {finalTotal.toLocaleString()} դր
                </span>
              </div>
            </div>
          )}

          {selectedService && depositEstimate.depositRequired && (
            <DepositNotice
              className="rounded-xl p-3"
              originalPrice={servicePrice}
              discountAmount={totalDiscount}
              finalPrice={finalTotal}
              depositAmount={depositEstimate.depositAmount}
              remainingDue={depositEstimate.remainingDue}
              policyText={depositSettings?.noShowPolicyText}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
