import { LogIn, X } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import DepositNotice from "@/shared/components/booking/DepositNotice";
import { getServicePriceInfo } from "@/shared/data/serviceCategories";
import { calculateDepositEstimate } from "@/shared/utils/deposit";

export default function SalonBookingSummary({
  salon,
  selectedBarber,
  selectedService,
  selectedDateLabel,
  validSelectedTime,
  selectedServicePriceInfo: providedPriceInfo,
  validatedPromo,
  publicPromoDiscount,
  publicTotalDiscount,
  publicFinalPrice,
  currentUser,
  promoCode,
  setPromoCode,
  promoStatus,
  validatingPromo,
  onApplyPromo,
  onRemovePromo,
  client,
  setClient,
  submitError,
  canConfirmBooking,
  confirmDisabledReason,
  isSaving,
  onBack,
  onConfirm,
  authRedirect,
}) {
  const selectedServicePriceInfo = providedPriceInfo || getServicePriceInfo(selectedService);
  const depositEstimate = calculateDepositEstimate(
    selectedBarber?.depositSettings,
    publicFinalPrice
  );

  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="text-xl font-bold sm:text-2xl">Confirm booking</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {currentUser
              ? "Fill in your details to confirm."
              : "Please log in to confirm your booking."}
          </p>
        </div>

        <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 text-sm">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-neutral-500">Salon</span>
            <span className="font-semibold text-neutral-950">{salon.name}</span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-neutral-500">Specialist</span>
            <span className="font-semibold text-neutral-950">{selectedBarber.name}</span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-neutral-500">Service</span>
            <span className="font-semibold text-neutral-950">{selectedService.name}</span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-neutral-500">Duration</span>
            <span className="font-semibold text-neutral-950">{selectedService.duration || 20} min</span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-neutral-500">Date</span>
            <span className="font-semibold text-neutral-950">{selectedDateLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-neutral-500">Time</span>
            <span className="font-semibold text-neutral-950">{validSelectedTime}</span>
          </div>
          {(selectedServicePriceInfo.hasDiscount || publicPromoDiscount > 0) && (
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-neutral-500">Original price</span>
              <span className="font-semibold text-neutral-950">
                {Number(selectedServicePriceInfo.originalPrice || 0).toLocaleString()} դրամ
              </span>
            </div>
          )}
          {selectedServicePriceInfo.hasDiscount && (
            <div className="flex items-center justify-between gap-4 bg-rose-50 px-4 py-2 text-rose-800">
              <span className="font-medium">Service discount</span>
              <span className="font-semibold">
                -{Number(selectedServicePriceInfo.serviceDiscountAmount || 0).toLocaleString()} դր
              </span>
            </div>
          )}
          {publicPromoDiscount > 0 && (
            <div className="flex items-center justify-between gap-4 bg-amber-50 px-4 py-2 text-amber-800">
              <span className="font-medium">
                Promo code discount ({validatedPromo?.promotion?.code})
              </span>
              <span className="font-semibold">
                -{publicPromoDiscount.toLocaleString()} դր
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 rounded-b-2xl bg-neutral-900 px-4 py-3 text-white">
            <span className="font-medium">
              {depositEstimate.depositRequired ? "Final price" : "Price"}
            </span>
            <span className="text-lg font-bold">
              {publicFinalPrice.toLocaleString()} դրամ
            </span>
          </div>
        </div>

        {depositEstimate.depositRequired && (
          <DepositNotice
            originalPrice={selectedServicePriceInfo.originalPrice}
            discountAmount={publicTotalDiscount}
            finalPrice={publicFinalPrice}
            depositAmount={depositEstimate.depositAmount}
            remainingDue={depositEstimate.remainingDue}
            policyText={selectedBarber?.depositSettings?.noShowPolicyText}
          />
        )}

        <div className="rounded-2xl border border-neutral-200 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-600">
            Promo code
          </div>
          {validatedPromo ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <div>
                <span className="font-semibold text-emerald-800">
                  {validatedPromo.promotion?.code}
                </span>
                <span className="ml-2 text-emerald-600">
                  — {validatedPromo.promotion?.title}
                </span>
              </div>
              <button
                onClick={onRemovePromo}
                className="rounded-lg p-1 text-emerald-500 hover:bg-emerald-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                className="flex-1 rounded-xl border border-neutral-200 p-3 text-sm transition focus:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-100"
                placeholder="Enter promo code"
                maxLength={20}
              />
              <button
                onClick={onApplyPromo}
                disabled={validatingPromo || !promoCode.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
              >
                {validatingPromo ? "..." : "Apply"}
              </button>
            </div>
          )}
          {promoStatus.message && (
            <p className={`mt-2 text-sm ${promoStatus.type === "success" ? "text-emerald-600" : "text-red-600"}`}>
              {promoStatus.message}
            </p>
          )}
        </div>

        {currentUser ? (
          <>
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>
                Name <span className="text-red-500">*</span>
              </span>
              <input
                className="w-full rounded-2xl border p-3 font-normal placeholder:text-neutral-400"
                placeholder="Your name"
                value={client.name}
                onChange={(e) => setClient({ ...client, name: e.target.value })}
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold">
              <span>
                Phone <span className="text-red-500">*</span>
              </span>
              <input
                className="w-full rounded-2xl border p-3 font-normal placeholder:text-neutral-400"
                placeholder="+374 XX XXX XXX"
                value={client.phone}
                onChange={(e) => setClient({ ...client, phone: e.target.value })}
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold">
              <span className="text-neutral-600">Note (optional)</span>
              <textarea
                className="w-full rounded-2xl border p-3 font-normal placeholder:text-neutral-400"
                placeholder="Any special requests..."
                rows={3}
                value={client.note}
                onChange={(e) => setClient({ ...client, note: e.target.value })}
              />
            </label>

            {submitError && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {submitError}
              </p>
            )}

            {!canConfirmBooking && confirmDisabledReason && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {confirmDisabledReason}
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={onBack}>
                Back
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={!canConfirmBooking}
                onClick={onConfirm}
              >
                {isSaving ? "Booking..." : "Confirm booking"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <LogIn className="mr-2 inline-block h-4 w-4" />
              You need to log in or register before confirming this booking.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button as={Link} to={`/login?redirect=${authRedirect}`} className="w-full sm:w-auto">
                Log in
              </Button>
              <Button
                as={Link}
                to={`/register?redirect=${authRedirect}`}
                variant="outline"
                className="w-full sm:w-auto"
              >
                Register
              </Button>
              <Button variant="outline" onClick={onBack} className="w-full sm:w-auto">
                Back
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
