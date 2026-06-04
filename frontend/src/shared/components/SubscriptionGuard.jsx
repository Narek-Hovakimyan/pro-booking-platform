import { LoaderCircle, LockKeyhole, WalletCards } from "lucide-react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";

import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";

export function SubscriptionRequired() {
  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-neutral-950">
              Subscription required
            </h1>
            <p className="mt-1 text-sm leading-6 text-neutral-600">
              An active subscription or salon seat assignment is required to use
              this barber feature.
            </p>
          </div>
        </div>

        <Button as={Link} className="gap-2" to="/admin/billing">
          <WalletCards className="h-4 w-4" />
          Open Billing
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SubscriptionGuard({ children }) {
  const { currentUser } = useSelector((state) => state.auth);
  const subscription = useSelector((state) => state.subscription);

  if (currentUser?.role !== "barber") {
    return children;
  }

  if (subscription.loading || !subscription.loaded) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-neutral-600">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Checking subscription status...
        </CardContent>
      </Card>
    );
  }

  if (subscription.hasAccess) {
    return children;
  }

  return <SubscriptionRequired />;
}
