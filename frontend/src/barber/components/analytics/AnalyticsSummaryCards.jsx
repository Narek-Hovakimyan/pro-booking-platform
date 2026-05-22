import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Star,
  ThumbsDown,
  Wallet,
  XCircle,
} from "lucide-react";

import AnalyticsStatCard from "@/barber/components/analytics/AnalyticsStatCard";

export default function AnalyticsSummaryCards({
  todayBookings,
  pendingCount,
  thisMonthCompleted,
  income,
  thisWeekBookings,
  averageRating,
  ratingCount,
  cancelledCount,
  rejectedCount,
  mostBookedService,
  formatCurrency,
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AnalyticsStatCard
          accent="blue"
          icon={CalendarDays}
          label="Today's Bookings"
          value={todayBookings.length}
          subtitle={
            todayBookings.length > 0
              ? `${todayBookings.filter((b) => b.status === "completed").length} completed`
              : ""
          }
        />
        <AnalyticsStatCard
          accent="amber"
          icon={Clock3}
          label="Pending Requests"
          value={pendingCount}
          subtitle={pendingCount > 0 ? "Awaiting your decision" : ""}
        />
        <AnalyticsStatCard
          accent="emerald"
          icon={CheckCircle2}
          label="Completed This Month"
          value={thisMonthCompleted.length}
          subtitle={
            income.completedCount > 0 ? formatCurrency(income.completedIncome) : ""
          }
        />
        <AnalyticsStatCard
          accent="purple"
          icon={Wallet}
          label="Expected Revenue"
          value={formatCurrency(income.totalExpectedIncome)}
          subtitle={
            income.completedCount + income.pendingCount > 0
              ? `${income.completedCount + income.pendingCount} bookings`
              : ""
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AnalyticsStatCard
          accent="sky"
          icon={CalendarDays}
          label="This Week"
          value={thisWeekBookings.length}
          subtitle="Bookings this week"
        />
        <AnalyticsStatCard
          accent="rose"
          icon={Star}
          label="Average Rating"
          value={averageRating !== null ? `${averageRating} / 5` : "N/A"}
          subtitle={ratingCount > 0 ? `${ratingCount} reviews` : ""}
        />
        <AnalyticsStatCard
          accent="neutral"
          icon={XCircle}
          label="Cancelled"
          value={cancelledCount}
        />
        <AnalyticsStatCard
          accent="neutral"
          icon={ThumbsDown}
          label="Rejected"
          value={rejectedCount}
          subtitle={
            mostBookedService
              ? `Most: ${mostBookedService.name} (${mostBookedService.count})`
              : ""
          }
        />
      </div>
    </>
  );
}
