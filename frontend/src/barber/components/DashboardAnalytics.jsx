import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import {
  ArrowRight,
  Bell,
  CalendarCheck,
  CalendarDays,
  Clock3,
  Info,
  Scissors,
  UserCircle,
} from "lucide-react";
import { useSelector } from "react-redux";

import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { formatDateKey } from "@/shared/utils/dates";
import AnalyticsActivityLists from "@/barber/components/analytics/AnalyticsActivityLists";
import AnalyticsHeader from "@/barber/components/analytics/AnalyticsHeader";
import AnalyticsNextBooking from "@/barber/components/analytics/AnalyticsNextBooking";
import AnalyticsPendingActions from "@/barber/components/analytics/AnalyticsPendingActions";
import AnalyticsSummaryCards from "@/barber/components/analytics/AnalyticsSummaryCards";
import { StatCardSkeleton } from "@/barber/components/analytics/AnalyticsStatCard";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const formatCurrency = (amount) => `${Number(amount || 0).toLocaleString()} AMD`;

const getSalonList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.salons)) return data.salons;
  return [];
};

const getWeekBounds = () => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
};

function getBookingId(booking) {
  return booking?.id || booking?._id || "";
}

function getClientName(booking) {
  return booking?.client?.name || booking?.clientName || "Client";
}

function getServiceName(booking) {
  return booking?.service?.name || booking?.serviceName || "Service";
}

function getBookingTime(booking) {
  return booking?.time || "";
}

function getBookingPrice(booking) {
  return booking?.price !== undefined && booking?.price !== null
    ? Number(booking.price).toLocaleString()
    : "";
}

function formatTimeAgo(dateValue) {
  if (!dateValue) return "";
  const diffMs = Date.now() - new Date(dateValue).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateValue).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DashboardAnalytics({ bookings = [] }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?._id || currentUser?.id;
  const currentMonth = getCurrentMonth();
  const notifications = useSelector((state) => state.notifications);

  // ---- Existing API-driven state ----

  const [income, setIncome] = useState({
    month: currentMonth,
    completedIncome: 0,
    completedCount: 0,
    pendingIncome: 0,
    pendingCount: 0,
    totalExpectedIncome: 0,
  });
  const [averageRating, setAverageRating] = useState(null);
  const [ratingCount, setRatingCount] = useState(0);
  const [incomeLoading, setIncomeLoading] = useState(true);
  const [ratingLoading, setRatingLoading] = useState(true);
  const [manageableSalonCount, setManageableSalonCount] = useState(0);

  const todayKey = formatDateKey(new Date());
  const { monday, sunday } = getWeekBounds();

  // ---- Derived (unchanged) ----

  const todayBookings = useMemo(
    () => bookings.filter((b) => b.bookingDate === todayKey),
    [bookings, todayKey],
  );
  const thisWeekBookings = useMemo(
    () =>
      bookings.filter((b) => {
        if (!b.bookingDate) return false;
        const d = new Date(b.bookingDate + "T00:00:00");
        return d >= monday && d <= sunday;
      }),
    [bookings, monday, sunday],
  );
  const thisMonthCompleted = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.status === "completed" &&
          b.bookingDate &&
          b.bookingDate.startsWith(currentMonth + "-"),
      ),
    [bookings, currentMonth],
  );
  const pendingCount = useMemo(
    () => bookings.filter((b) => b.status === "pending").length,
    [bookings],
  );
  const cancelledCount = useMemo(
    () => bookings.filter((b) => b.status === "cancelled").length,
    [bookings],
  );
  const rejectedCount = useMemo(
    () => bookings.filter((b) => b.status === "rejected").length,
    [bookings],
  );
  const mostBookedService = useMemo(() => {
    const counts = {};
    for (const b of bookings) {
      const name = b.serviceName || b.serviceId?.name;
      if (name) {
        counts[name] = (counts[name] || 0) + 1;
      }
    }
    let maxName = null;
    let maxCount = 0;
    for (const [name, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxName = name;
        maxCount = count;
      }
    }
    return maxName ? { name: maxName, count: maxCount } : null;
  }, [bookings]);

  const bookingSignature = useMemo(
    () =>
      bookings
        .map((b) =>
          [getBookingId(b), b?.status, b?.bookingDate || b?.dayKey, b?.price, b?.updatedAt || b?.completedAt || ""].join(":"),
        )
        .join("|"),
    [bookings],
  );

  // ---- NEW: derived for dashboard sections ----

  const nextBooking = useMemo(() => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const upcoming = todayBookings
      .filter(
        (b) =>
          getBookingTime(b) >= currentTime &&
          b.status !== "cancelled" &&
          b.status !== "rejected" &&
          b.status !== "expired" &&
          b.status !== "no_show" &&
          b.status !== "late_cancelled",
      )
      .sort((a, b) => getBookingTime(a).localeCompare(getBookingTime(b)));
    return upcoming[0] || null;
  }, [todayBookings]);

  const pendingBookings = useMemo(
    () => bookings.filter((b) => b.status === "pending").slice(0, 5),
    [bookings],
  );

  const upcomingBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "accepted" && b.bookingDate >= todayKey)
        .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate) || getBookingTime(a).localeCompare(getBookingTime(b)))
        .slice(0, 5),
    [bookings, todayKey],
  );

  const recentCompleted = useMemo(
    () =>
      thisMonthCompleted
        .slice()
        .sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
          const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
          return dateB - dateA;
        })
        .slice(0, 5),
    [thisMonthCompleted],
  );

  const primarySalon = useMemo(() => {
    const approvedSalons = currentUser?.salons?.filter((s) => s.status === "approved") || [];
    const primary = approvedSalons.find((s) => s.isPrimary) || approvedSalons[0];
    return primary || null;
  }, [currentUser]);

  const unreadNotifications = useMemo(
    () => (notifications || []).filter((n) => !n.isRead).length,
    [notifications],
  );

  // Data loading indicator
  const isDataLoading = bookings.length === 0 && incomeLoading && ratingLoading;
  const hasMultipleManageableSalons = currentUser?.role === "barber" && manageableSalonCount > 1;

  // ---- Existing effects (unchanged) ----

  useEffect(() => {
    if (!currentUserId) return;

    let isMounted = true;

    async function fetchIncome() {
      setIncomeLoading(true);
      try {
        const { data } = await api.get(`/bookings/barber/${currentUserId}/income?month=${currentMonth}`);
        if (isMounted) {
          setIncome({
            month: data.month || currentMonth,
            completedIncome: data.completedIncome || 0,
            completedCount: data.completedCount || 0,
            pendingIncome: data.pendingIncome || 0,
            pendingCount: data.pendingCount || 0,
            totalExpectedIncome: data.totalExpectedIncome || 0,
          });
        }
      } catch {
        if (isMounted) {
          setIncome({
            month: currentMonth,
            completedIncome: 0,
            completedCount: 0,
            pendingIncome: 0,
            pendingCount: 0,
            totalExpectedIncome: 0,
          });
        }
      } finally {
        if (isMounted) setIncomeLoading(false);
      }
    }

    async function fetchRating() {
      setRatingLoading(true);
      try {
        const { data } = await api.get(`/reviews/${currentUserId}`);
        const reviews = Array.isArray(data) ? data : data?.reviews || [];
        if (isMounted) {
          if (reviews.length > 0) {
            const sum = reviews.reduce((acc, r) => acc + Number(r.rating || 0), 0);
            setAverageRating((sum / reviews.length).toFixed(1));
            setRatingCount(reviews.length);
          } else {
            setAverageRating(null);
            setRatingCount(0);
          }
        }
      } catch {
        if (isMounted) {
          setAverageRating(null);
          setRatingCount(0);
        }
      } finally {
        if (isMounted) setRatingLoading(false);
      }
    }

    fetchIncome();
    fetchRating();

    return () => {
      isMounted = false;
    };
  }, [currentUserId, currentMonth, bookingSignature]);

  useEffect(() => {
    if (currentUser?.role !== "barber" || !currentUserId) {
      return undefined;
    }

    let isMounted = true;

    api
      .get("/salons/mine/manageable")
      .then(({ data }) => {
        if (isMounted) {
          setManageableSalonCount(getSalonList(data).length);
        }
      })
      .catch(() => {
        if (isMounted) setManageableSalonCount(0);
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser?.role, currentUserId]);

  // ---- Today's date display ----

  const todayDate = new Date();
  const todayDateLabel = todayDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // ---- Quick actions ----

  const quickActions = [
    { icon: CalendarDays, label: "Manage Schedule", path: "/admin/schedule" },
    { icon: Scissors, label: "Add Service", path: "/admin/services" },
    { icon: Clock3, label: "View Bookings", path: "/admin/bookings" },
    { icon: CalendarCheck, label: "Open Calendar", path: "/admin/calendar" },
    { icon: UserCircle, label: "Edit Profile", path: "/admin/profile" },
    { icon: Bell, label: "Create Event", path: "/my-events" },
  ];

  // ---- Top-level loading ----

  if (isDataLoading) {
    return (
      <Card className="rounded-2xl sm:rounded-3xl lg:col-span-3">
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="animate-pulse space-y-2">
            <div className="h-8 w-40 rounded-xl bg-neutral-100" />
            <div className="h-4 w-72 rounded-full bg-neutral-100" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Render ----

  return (
    <Card className="rounded-2xl sm:rounded-3xl lg:col-span-3">
      <CardContent className="space-y-6 p-4 sm:p-6">
        <AnalyticsHeader
          primarySalon={primarySalon}
          todayDateLabel={todayDateLabel}
          unreadNotifications={unreadNotifications}
        />

        {hasMultipleManageableSalons && (
          <div className="flex flex-col gap-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-sky-700 shadow-sm">
                <Info className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">
                  {t("dashboard.personal.title")}
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-sky-800">
                  {t("dashboard.personal.description")}
                </p>
                <p className="mt-1 text-sm font-medium leading-6 text-sky-900">
                  {t("dashboard.personal.multipleSalons")}
                </p>
              </div>
            </div>
            <Button
              as={Link}
              className="w-full gap-2 bg-sky-950 hover:bg-sky-900 sm:w-auto"
              to="/admin/salon/dashboard"
            >
              {t("dashboard.personal.openSalonDashboard")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <AnalyticsSummaryCards
          averageRating={averageRating}
          cancelledCount={cancelledCount}
          formatCurrency={formatCurrency}
          income={income}
          mostBookedService={mostBookedService}
          pendingCount={pendingCount}
          ratingCount={ratingCount}
          rejectedCount={rejectedCount}
          thisMonthCompleted={thisMonthCompleted}
          thisWeekBookings={thisWeekBookings}
          todayBookings={todayBookings}
        />

        <AnalyticsNextBooking
          getBookingPrice={getBookingPrice}
          getBookingTime={getBookingTime}
          getClientName={getClientName}
          getServiceName={getServiceName}
          nextBooking={nextBooking}
          onViewBookings={() => navigate("/admin/bookings")}
        />

        <AnalyticsPendingActions
          bookingsPath="/admin/bookings"
          getBookingId={getBookingId}
          getBookingPrice={getBookingPrice}
          getBookingTime={getBookingTime}
          getClientName={getClientName}
          getServiceName={getServiceName}
          pendingBookings={pendingBookings}
          pendingCount={pendingCount}
          quickActions={quickActions}
          onNavigate={navigate}
        />

        <AnalyticsActivityLists
          formatTimeAgo={formatTimeAgo}
          getBookingId={getBookingId}
          getBookingTime={getBookingTime}
          getClientName={getClientName}
          getServiceName={getServiceName}
          recentCompleted={recentCompleted}
          upcomingBookings={upcomingBookings}
        />
      </CardContent>
    </Card>
  );
}
