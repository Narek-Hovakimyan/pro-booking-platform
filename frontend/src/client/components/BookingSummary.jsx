import { CalendarDays, Clock, Scissors, User } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";

export default function BookingSummary({
  selectedService,
  selectedDateLabel,
  selectedTime,
  client,
}) {
  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <h3 className="text-lg font-bold">Ամրագրման ամփոփում</h3>

        <div className="space-y-3 text-sm text-neutral-600">
          <p className="flex items-center gap-3 rounded-xl bg-neutral-50 p-3">
            <Scissors className="h-4 w-4 shrink-0 text-neutral-500" />
            <span className="font-medium text-neutral-900">
              {selectedService?.name || "Ծառայություն ընտրված չէ"}
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
        </div>
      </CardContent>
    </Card>
  );
}
