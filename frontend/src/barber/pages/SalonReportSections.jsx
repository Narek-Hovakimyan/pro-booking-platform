import { Building2, CalendarCheck, DollarSign, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

import {
  formatCurrency,
  formatFixedPaymentSub,
  formatPaymentLabel,
} from "./salonReportFormatters";
import SalonReportSummary from "./SalonReportSummary";

export default function SalonReportSections({
  reports,
  loadingReports,
  errorCode,
}) {
  const summary = reports?.summary || null;
  const byStatus = reports?.byStatus || [];
  const byDay = reports?.byDay || [];
  const byStaff = reports?.byStaff || [];
  const topServices = reports?.topServices || [];
  const isSubscriptionRequiredError = errorCode === "SALON_SUBSCRIPTION_REQUIRED";

  if (loadingReports) {
    return (
      <Card>
        <CardContent className="text-sm text-neutral-500">Loading reports...</CardContent>
      </Card>
    );
  }

  if (isSubscriptionRequiredError) {
    return (
      <Card>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">
                Salon subscription required
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Activate a salon subscription to view reports.
              </p>
            </div>
            <Button as={Link} to="/admin/salon/billing">
              Go to Salon Billing
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!reports) {
    return (
      <Card>
        <CardContent className="text-sm text-neutral-500">
          No report data available. Adjust the date range and try again.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {reports.salon && (
        <Card>
          <CardContent>
            <div className="flex items-start gap-4">
              {reports.salon.imageUrl ? (
                <img
                  alt={reports.salon.name}
                  className="h-14 w-14 rounded-xl object-cover"
                  src={reports.salon.imageUrl}
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-neutral-100">
                  <Building2 className="h-6 w-6 text-neutral-400" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-neutral-950">
                  {reports.salon.name}
                </h2>
                {reports.salon.city && (
                  <p className="text-sm text-neutral-500">
                    {reports.salon.city}
                    {reports.salon.address ? `, ${reports.salon.address}` : ""}
                  </p>
                )}
                {reports.range && (
                  <p className="mt-1 text-xs text-neutral-400">
                    Report period: {reports.range.from} &ndash; {reports.range.to}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <SalonReportSummary summary={summary} />

      {byStatus.length > 0 && (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-neutral-500" />
              <h3 className="font-semibold text-neutral-950">
                Booking Status Breakdown
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs font-medium uppercase text-neutral-500">
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {byStatus.map((item) => (
                    <tr
                      className="border-b border-neutral-100 last:border-0"
                      key={item.status}
                    >
                      <td className="py-2 pr-3 font-medium capitalize text-neutral-950">
                        {item.status.replace(/_/g, " ")}
                      </td>
                      <td className="py-2 text-neutral-700">{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {summary && (
              <div className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-500">
                Total: {summary.totalBookings} booking(s) &middot;{" "}
                {summary.completedBookings} completed &middot;{" "}
                {summary.cancelledBookings} cancelled &middot;{" "}
                {summary.noShowBookings} no-show &middot;{" "}
                {summary.pendingBookings} pending &middot;{" "}
                {summary.acceptedBookings} accepted &middot;{" "}
                {summary.lateCancelledBookings} late cancelled
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {byDay.length > 0 && (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-neutral-500" />
              <h3 className="font-semibold text-neutral-950">Daily Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs font-medium uppercase text-neutral-500">
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">Total</th>
                    <th className="pb-2 pr-3">Completed</th>
                    <th className="pb-2 pr-3">Cancelled</th>
                    <th className="pb-2 pr-3">No-show</th>
                    <th className="pb-2 pr-3">Pending</th>
                    <th className="pb-2">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.map((day) => (
                    <tr
                      className="border-b border-neutral-100 last:border-0"
                      key={day._id}
                    >
                      <td className="py-2 pr-3 font-medium text-neutral-950">
                        {day._id}
                      </td>
                      <td className="py-2 pr-3 text-neutral-700">{day.total}</td>
                      <td className="py-2 pr-3 text-neutral-700">
                        {day.completed}
                      </td>
                      <td className="py-2 pr-3 text-neutral-700">
                        {day.cancelled}
                      </td>
                      <td className="py-2 pr-3 text-neutral-700">{day.noShow}</td>
                      <td className="py-2 pr-3 text-neutral-700">{day.pending}</td>
                      <td className="py-2 text-neutral-700">
                        {formatCurrency(day.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {byStaff.length > 0 && (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-neutral-500" />
              <h3 className="font-semibold text-neutral-950">
                Staff Performance
              </h3>
            </div>
            <p className="text-xs text-neutral-500">
              Showing accepted staff only. Chair renters are excluded.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs font-medium uppercase text-neutral-500">
                    <th className="pb-2 pr-3">Barber</th>
                    <th className="pb-2 pr-3">Total</th>
                    <th className="pb-2 pr-3">Completed</th>
                    <th className="pb-2 pr-3">Cancelled</th>
                    <th className="pb-2 pr-3">No-show</th>
                    <th className="pb-2 pr-3">Gross revenue</th>
                    <th className="pb-2 pr-3">Staff earnings</th>
                    <th className="pb-2 pr-3">Salon earnings</th>
                    <th className="pb-2 pr-3">Payment</th>
                    <th className="pb-2">Clients</th>
                  </tr>
                </thead>
                <tbody>
                  {byStaff.map((staff) => (
                    <tr
                      className="border-b border-neutral-100 last:border-0"
                      key={staff.barberId}
                    >
                      <td className="py-2 pr-3 font-medium text-neutral-950">
                        <div className="flex items-center gap-2">
                          {staff.avatarUrl ? (
                            <img
                              alt={staff.barberName}
                              className="h-6 w-6 rounded-full object-cover"
                              src={staff.avatarUrl}
                            />
                          ) : (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-xs text-neutral-500">
                              {staff.barberName?.charAt(0) || "?"}
                            </div>
                          )}
                          <span>{staff.barberName}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-neutral-700">
                        {staff.totalBookings}
                      </td>
                      <td className="py-2 pr-3 text-neutral-700">
                        {staff.completed}
                      </td>
                      <td className="py-2 pr-3 text-neutral-700">
                        {staff.cancelled}
                      </td>
                      <td className="py-2 pr-3 text-neutral-700">
                        {staff.noShow}
                      </td>
                      <td className="py-2 pr-3 text-neutral-700">
                        {formatCurrency(staff.grossRevenue ?? staff.revenue)}
                      </td>
                      <td className="py-2 pr-3 text-neutral-700">
                        {formatCurrency(staff.staffEarnings)}
                      </td>
                      <td className="py-2 pr-3 text-neutral-700">
                        {formatCurrency(staff.salonEarnings)}
                      </td>
                      <td className="py-2 pr-3 text-neutral-700">
                        <div className="min-w-36">
                          <div className="font-medium text-neutral-800">
                            {formatPaymentLabel(staff)}
                          </div>
                          {formatFixedPaymentSub(staff) && (
                            <div className="mt-0.5 text-xs text-neutral-500">
                              {formatFixedPaymentSub(staff)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-neutral-700">{staff.uniqueClients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {topServices.length > 0 && (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-neutral-500" />
              <h3 className="font-semibold text-neutral-950">Top Services</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs font-medium uppercase text-neutral-500">
                    <th className="pb-2 pr-3">Service</th>
                    <th className="pb-2 pr-3">Bookings</th>
                    <th className="pb-2">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topServices.map((service, index) => (
                    <tr
                      className="border-b border-neutral-100 last:border-0"
                      key={service._id || index}
                    >
                      <td className="py-2 pr-3 font-medium text-neutral-950">
                        {service._id}
                      </td>
                      <td className="py-2 pr-3 text-neutral-700">
                        {service.count}
                      </td>
                      <td className="py-2 text-neutral-700">
                        {formatCurrency(service.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {byStatus.length === 0 &&
        byDay.length === 0 &&
        byStaff.length === 0 &&
        topServices.length === 0 && (
          <Card>
            <CardContent>
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CalendarCheck className="h-10 w-10 text-neutral-300" />
                <h3 className="text-lg font-semibold text-neutral-950">
                  No data in this period
                </h3>
                <p className="max-w-sm text-sm text-neutral-500">
                  No bookings were found for the selected date range and staff.
                  Try adjusting the filters.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
