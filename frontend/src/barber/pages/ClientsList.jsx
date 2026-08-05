import { MessageCircle, Star } from "lucide-react";

import EmptyState from "@/shared/components/common/EmptyState";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { formatCurrency } from "@/platform/utils/billingFormatters";

import { formatBookingLabel } from "./clientFormatters";

export default function ClientsList({
  clients,
  filteredClients,
  isLoading,
  error,
  onOpenClientDetails,
  onOpenMessage,
}) {
  return (
    <>
      <p className="text-sm font-medium text-neutral-600">
        Showing {filteredClients.length} of {clients.length} clients
      </p>

      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="rounded-2xl">
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="h-5 w-2/3 animate-pulse rounded bg-neutral-200" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-100" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-12 animate-pulse rounded-xl bg-neutral-100" />
                  <div className="h-12 animate-pulse rounded-xl bg-neutral-100" />
                </div>
                <div className="h-10 animate-pulse rounded-xl bg-neutral-100" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredClients.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="p-4 sm:p-6">
            <EmptyState
              title={clients.length === 0 ? "No clients yet" : "No matching clients"}
              description={
                clients.length === 0
                  ? "Clients will appear here after they book with you."
                  : "No clients match these filters."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredClients.map((client) => (
            <Card key={client.clientId} className="rounded-2xl">
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-lg font-semibold text-neutral-950">
                        {client.clientName || "Client"}
                      </h2>
                      {client.loyalty?.isVip && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          <Star className="h-3 w-3 fill-current" />
                          VIP
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-neutral-500">
                      {client.phone || "No phone on booking"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">
                    {client.bookingCount || 0} total
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-neutral-50 p-3">
                    <div className="text-xs font-medium text-neutral-500">
                      Completed
                    </div>
                    <div className="mt-1 text-lg font-semibold text-neutral-950">
                      {client.completedBookingsCount || 0}
                    </div>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-3">
                    <div className="text-xs font-medium text-neutral-500">
                      Total spent
                    </div>
                    <div className="mt-1 text-lg font-semibold text-neutral-950">
                      {formatCurrency(client.totalSpent)}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <div className="text-xs font-medium text-neutral-500">
                      Last visit
                    </div>
                    <div className="mt-0.5 text-neutral-800">
                      {formatBookingLabel(client.lastBooking)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-neutral-500">
                      Next booking
                    </div>
                    <div className="mt-0.5 text-neutral-800">
                      {formatBookingLabel(client.nextBooking)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-neutral-500">
                      Most booked
                    </div>
                    <div className="mt-0.5 text-neutral-800">
                      {client.mostBookedService
                        ? `${client.mostBookedService.serviceName} (${client.mostBookedService.count})`
                        : "None"}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    className="w-full"
                    onClick={() => onOpenClientDetails(client)}
                    variant="outline"
                  >
                    Client details
                  </Button>
                  <Button
                    className="w-full gap-2"
                    onClick={() => onOpenMessage(client)}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Message
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
