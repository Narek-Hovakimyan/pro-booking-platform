import { ArrowLeft, CheckCircle2, RefreshCw, Users, XCircle, Building2 } from "lucide-react";

import { BillingActionButton } from "./BillingActionButton";
import { Card, CardContent } from "../../../shared/components/ui/card";
import { getStatusBadgeClass, getSubscriptionStatusLabel } from "../../utils/billingFormatters";

export function SalonBillingHeader({
  salon,
  subscription,
  isPlatformAdmin,
  onBack,
  successMessage,
  onActivate,
  onUpdateSeatCount,
  onCancel,
}) {
  return (
    <>
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-neutral-600 transition hover:text-neutral-900"
        type="button"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Platform Billing
      </button>

      {/* Success message */}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Salon header card */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100">
              {salon?.imageUrl ? (
                <img
                  src={salon.imageUrl}
                  alt={salon.name || ""}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Building2 className="h-7 w-7 text-neutral-400" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-neutral-900">
                {salon?.name || "Unnamed Salon"}
              </h1>
              <p className="text-sm text-neutral-500">
                {salon?.city || "No city"}
                {salon?.address ? `, ${salon.address}` : ""}
              </p>

              {subscription && (
                <span
                  className={`mt-2 inline-block rounded-full px-3 py-0.5 text-xs font-medium ${getStatusBadgeClass(
                    subscription.isExpired,
                    subscription.status
                  )}`}
                >
                  {getSubscriptionStatusLabel(subscription)}
                </span>
              )}

              {/* Action buttons */}
              {isPlatformAdmin && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <BillingActionButton
                    icon={RefreshCw}
                    label={
                      subscription
                        ? "Renew subscription"
                        : "Activate subscription"
                    }
                    onClick={onActivate}
                    variant={subscription ? "outline" : "default"}
                  />
                  {subscription && (
                    <BillingActionButton
                      icon={Users}
                      label="Update seat count"
                      onClick={onUpdateSeatCount}
                      variant="outline"
                    />
                  )}
                  {subscription &&
                    ["trialing", "active", "past_due"].includes(subscription.status) && (
                      <BillingActionButton
                        icon={XCircle}
                        label="Cancel subscription"
                        onClick={onCancel}
                        variant="danger"
                      />
                    )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}