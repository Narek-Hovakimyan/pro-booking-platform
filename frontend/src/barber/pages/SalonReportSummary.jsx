import { CalendarCheck, DollarSign, Users } from "lucide-react";

import { formatCurrency } from "./salonReportFormatters";

function StatWidget({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase text-neutral-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-neutral-950">
        {value ?? "—"}
      </div>
      {sub !== undefined && sub !== null && (
        <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>
      )}
    </div>
  );
}

export default function SalonReportSummary({ summary }) {
  if (!summary) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatWidget
        icon={CalendarCheck}
        label="Total bookings"
        value={summary.totalBookings}
      />
      <StatWidget icon={CalendarCheck} label="Completed" value={summary.completedBookings} />
      <StatWidget
        icon={DollarSign}
        label="Total revenue"
        value={formatCurrency(summary.totalRevenue)}
        sub="From completed bookings"
      />
      <StatWidget
        icon={DollarSign}
        label="Gross revenue"
        value={formatCurrency(summary.grossRevenue)}
        sub="Completed booking gross"
      />
      <StatWidget
        icon={DollarSign}
        label="Staff earnings"
        value={formatCurrency(summary.staffEarningsTotal)}
      />
      <StatWidget
        icon={DollarSign}
        label="Salon earnings"
        value={formatCurrency(summary.salonEarningsTotal)}
      />
      {Number(summary.fixedPayProratedCount || 0) > 0 && (
        <StatWidget
          icon={DollarSign}
          label="Fixed prorated"
          value={summary.fixedPayProratedCount}
          sub="Report activity estimate"
        />
      )}
      <StatWidget
        icon={DollarSign}
        label="Avg booking value"
        value={formatCurrency(summary.averageBookingValue)}
      />
      <StatWidget
        icon={Users}
        label="Unique clients"
        value={summary.uniqueClients}
      />
    </div>
  );
}
