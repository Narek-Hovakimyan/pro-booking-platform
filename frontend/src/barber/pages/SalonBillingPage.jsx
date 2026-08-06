import { Card, CardContent } from "@/shared/components/ui/card";

import { BillingAlerts } from "../components/billing/BillingAlerts";
import { SalonBillingHeader } from "../components/billing/SalonBillingHeader";
import { SalonSelector } from "../components/billing/SalonSelector";
import { SubscriptionOverview } from "../components/billing/SubscriptionOverview";
import { SeatUsagePanel } from "../components/billing/SeatUsagePanel";
import { SeatLists } from "../components/billing/SeatLists";
import { RenewSubscriptionCard } from "../components/billing/RenewSubscriptionCard";
import { SeatUpdateCard } from "../components/billing/SeatUpdateCard";
import { PendingPaymentCard } from "../components/billing/PendingPaymentCard";
import { ManualActivationCard } from "../components/billing/ManualActivationCard";
import { AssignSeatCard } from "../components/billing/AssignSeatCard";
import { PaymentHistoryCard } from "../components/billing/PaymentHistoryCard";
import { useSalonBilling } from "../hooks/useSalonBilling";
import { getSalonName } from "../utils/salonBillingFormatters";

export default function SalonBillingPage() {
  const billing = useSalonBilling();

  return (
    <div className="min-h-screen rounded-[2rem] bg-gradient-to-br from-violet-50 via-white to-pink-50/70 p-4 sm:p-6">
      <div className="space-y-5 sm:space-y-6">
        <SalonBillingHeader
          onRefresh={billing.refreshSelectedSalon}
          refreshDisabled={!billing.selectedSalonId || billing.loadingDetails}
          selectedSalon={billing.selectedSalon}
        />

        <BillingAlerts
          error={billing.error}
          loadingDetails={billing.loadingDetails}
          onRetry={billing.refreshSelectedSalon}
          selectedSalonId={billing.selectedSalonId}
          success={billing.success}
        />

        {billing.loadingSalons ? (
          <Card className="rounded-3xl border-white/80 shadow-sm">
            <CardContent className="space-y-3">
              <div className="h-4 w-32 rounded-full bg-neutral-100" />
              <div className="h-11 rounded-2xl bg-neutral-100" />
            </CardContent>
          </Card>
        ) : billing.salons.length === 0 ? (
          <Card className="rounded-3xl border-white/80 shadow-sm">
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-neutral-950">
                No manageable salons
              </h2>
              <p className="mt-2 text-sm text-neutral-500">
                Salon billing appears after you own or administer a salon.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <SalonSelector
              disabled={billing.loadingDetails}
              onChange={billing.handleSalonChange}
              salons={billing.salons}
              selectedSalonId={billing.selectedSalonId}
            />

            {billing.loadingDetails ? (
              <Card className="rounded-3xl border-white/80 shadow-sm">
                <CardContent className="grid gap-4 p-5 sm:grid-cols-3">
                  <div className="h-24 rounded-2xl bg-neutral-100" />
                  <div className="h-24 rounded-2xl bg-neutral-100" />
                  <div className="h-24 rounded-2xl bg-neutral-100" />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="space-y-5">
                  <SubscriptionOverview
                    approvedMembersCount={billing.approvedMembers.length}
                    currency={billing.currency}
                    daysRemaining={billing.daysRemaining}
                    expiryDate={billing.expiryDate}
                    paidSeatCount={billing.paidSeatCount}
                    pricePerSeat={billing.pricePerSeat}
                    selectedSalonName={getSalonName(billing.selectedSalon)}
                    subscription={billing.subscription}
                    subscriptionIsActive={billing.subscriptionIsActive}
                    subscriptionIsCancelled={billing.subscriptionIsCancelled}
                    usedSeatCount={billing.usedSeatCount}
                    visibleAvailableSeatCount={billing.visibleAvailableSeatCount}
                  />

                  <SeatUsagePanel
                    activeCapacity={billing.activeCapacity}
                    activeSeatsCount={billing.activeSeats.length}
                    revokedSeatsCount={billing.revokedSeats.length}
                    seatUsagePercent={billing.seatUsagePercent}
                    visibleAvailableSeatCount={billing.visibleAvailableSeatCount}
                  />

                  <SeatLists
                    activeSeats={billing.activeSeats}
                    onRevokeSeat={billing.handleRevokeSeat}
                    revokedSeats={billing.revokedSeats}
                    saving={billing.saving}
                    subscriptionIsActive={billing.subscriptionIsActive}
                  />
                </div>

                <div className="space-y-5">
                  <RenewSubscriptionCard
                    currency={billing.currency}
                    paymentMonths={billing.paymentMonths}
                    onPreparePayment={billing.handlePreparePayment}
                    paidSeatCount={billing.paidSeatCount}
                    preparingPayment={billing.preparingPayment}
                    pricePerSeat={billing.pricePerSeat}
                    purchaseMonthlyTotal={billing.purchaseMonthlyTotal}
                    purchaseMonths={billing.purchaseMonths}
                    purchaseSeatCount={billing.purchaseSeatCount}
                    purchaseTotal={billing.purchaseTotal}
                    seatCountInput={billing.seatCountInput}
                    selectedSalonId={billing.selectedSalonId}
                    setPaymentMonths={billing.setPaymentMonths}
                    setSeatCountInput={billing.setSeatCountInput}
                  />

                  {billing.subscription && billing.subscriptionIsActive && (
                    <SeatUpdateCard
                      currency={billing.currency}
                      onPreparePayment={billing.handlePreparePayment}
                      paidSeatCount={billing.paidSeatCount}
                      preparingPayment={billing.preparingPayment}
                      pricePerSeat={billing.pricePerSeat}
                      purchaseSeatCount={billing.purchaseSeatCount}
                      seatCountInput={billing.seatCountInput}
                      selectedSalonId={billing.selectedSalonId}
                      setSeatCountInput={billing.setSeatCountInput}
                      subscription={billing.subscription}
                    />
                  )}

                  <PendingPaymentCard
                    attemptIsSeatUpdate={billing.attemptIsSeatUpdate}
                    cancellingAttempt={billing.cancellingAttempt}
                    confirmingAttempt={billing.confirmingAttempt}
                    onCancelAttempt={billing.handleCancelAttempt}
                    onConfirmAttempt={billing.handleConfirmAttempt}
                    pendingAttempt={billing.pendingAttempt}
                    showManualActivationPanel={billing.showManualActivationPanel}
                  />

                  {billing.attemptActionError && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                      {billing.attemptActionError}
                    </div>
                  )}

                  <ManualActivationCard
                    currency={billing.currency}
                    manualActivating={billing.manualActivating}
                    manualActivationSeatCount={billing.manualActivationSeatCount}
                    manualMonths={billing.manualMonths}
                    manualSeatCount={billing.manualSeatCount}
                    onManualActivation={billing.handleManualActivation}
                    pricePerSeat={billing.pricePerSeat}
                    selectedSalonId={billing.selectedSalonId}
                    setManualMonths={billing.setManualMonths}
                    setManualSeatCount={billing.setManualSeatCount}
                    showManualActivationPanel={billing.showManualActivationPanel}
                  />

                  <AssignSeatCard
                    assignableMembers={billing.assignableMembers}
                    availableSeatCount={billing.availableSeatCount}
                    canAssignSeat={billing.canAssignSeat}
                    onAssignSeat={billing.handleAssignSeat}
                    selectedMemberId={billing.selectedMemberId}
                    setSelectedMemberId={billing.setSelectedMemberId}
                    subscriptionIsActive={billing.subscriptionIsActive}
                  />

                  <PaymentHistoryCard
                    payments={billing.payments}
                    paymentsError={billing.paymentsError}
                    subscriptionIsCancelled={billing.subscriptionIsCancelled}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
