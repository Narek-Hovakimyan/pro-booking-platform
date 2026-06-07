import { CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

export default function SuccessPage({ client, resetBooking }) {
  const location = useLocation();
  const payment = location.state?.payment;

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
