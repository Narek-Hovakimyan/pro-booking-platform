import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

export default function SuccessPage({ client, resetBooking }) {
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

        <Button className="w-full sm:w-auto" as={Link} to="/booking" onClick={resetBooking}>
          Նոր ամրագրում
        </Button>
      </CardContent>
    </Card>
  );
}
