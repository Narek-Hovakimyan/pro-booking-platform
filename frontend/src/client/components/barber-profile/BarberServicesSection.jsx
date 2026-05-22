import { Clock, Scissors } from "lucide-react";

import { Link } from "react-router-dom";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

export default function BarberServicesSection({
  barber,
  barberServices,
  profileBarberId,
}) {
  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-5 sm:p-7">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Scissors className="h-5 w-5" />
            Services
          </h2>
          {barberServices.length > 0 && (
            <span className="text-xs text-neutral-400">
              {barberServices.length} {barberServices.length === 1 ? "service" : "services"}
            </span>
          )}
        </div>

        {barberServices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
            <Scissors className="h-8 w-8 text-neutral-300" />
            <p className="text-sm font-medium text-neutral-500">No active services yet.</p>
            <p className="text-xs text-neutral-400">Check back later for available services.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {barberServices.map((service) => (
              <div
                className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all hover:border-neutral-300 hover:shadow-md"
                key={service.id || service._id}
              >
                <div className="absolute left-0 top-0 h-full w-1 bg-emerald-500" />
                <div className="flex items-start justify-between gap-4 pl-4">
                  <div className="min-w-0 flex-1 py-4">
                    <div className="font-semibold text-neutral-950">
                      {service?.name || "Service"}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {service?.duration || 20} min
                      </span>
                    </div>
                    {service?.description && (
                      <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">
                        {service.description}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 py-4 pr-4 text-right">
                    <div className="text-xl font-bold text-neutral-950">
                      {Number(service?.price || 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-neutral-400">դրամ</div>
                    <Button
                      as={Link}
                      className="mt-2"
                      size="sm"
                      state={{ barber }}
                      to={`/booking/${profileBarberId}`}
                    >
                      Book
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
