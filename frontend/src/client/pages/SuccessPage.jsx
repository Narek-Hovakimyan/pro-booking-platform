import { CheckCircle2, Clock3, MapPin, MessageCircle, Scissors, Store, UserRound } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { parseDateKey } from "@/shared/utils/dates";

const amdFormatter = new Intl.NumberFormat("hy-AM");
const armenianDateFormatter = new Intl.DateTimeFormat("hy-AM", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const statusConfig = {
  accepted: {
    title: "Ամրագրումը հաստատված է",
    message: "Ձեր այցի տվյալները պատրաստ են։",
    label: "Հաստատված",
  },
  completed: {
    title: "Ամրագրումը գրանցված է",
    message: "Ամրագրումը պահպանվել է ձեր պատմության մեջ։",
    label: "Ավարտված",
  },
  pending: {
    title: "Ամրագրման հարցումը ուղարկված է",
    message: "Մասնագետը պետք է հաստատի ամրագրումը։",
    label: "Սպասման մեջ",
  },
  cancelled: {
    title: "Ամրագրումը չեղարկված է",
    message: "Այս ամրագրումը այլևս ակտիվ չէ։",
    label: "Չեղարկված",
  },
  declined: {
    title: "Ամրագրումը մերժված է",
    message: "Կարող եք ընտրել այլ ժամ կամ այլ մասնագետ։",
    label: "Մերժված",
  },
};

function getEntityId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.id || value._id || "";
}

function getDisplayText(value, fallback = "") {
  if (value && typeof value === "object") {
    return String(value.name || value.title || "").trim();
  }
  return fallback;
}

function getBarberName(booking) {
  return getDisplayText(booking?.barber);
}

function getSalonName(booking) {
  return getDisplayText(booking?.salon);
}

function getBarberId(booking) {
  return (
    getEntityId(booking?.barberId) ||
    getEntityId(booking?.barber) ||
    ""
  );
}

function formatAmd(value) {
  return `${amdFormatter.format(Number(value || 0))} դրամ`;
}

function formatBookingDate(dateValue) {
  const parsedDate = typeof dateValue === "string" ? parseDateKey(dateValue) : null;
  if (!parsedDate) return "";
  return armenianDateFormatter.format(parsedDate);
}

function getStatusCopy(status) {
  return statusConfig[status] || {
    title: "Ամրագրումը պահպանված է",
    message: "Տվյալները հասանելի են ձեր ամրագրումների բաժնում։",
    label: status ? String(status) : "Պահպանված",
  };
}

function DetailRow({ icon: Icon, label, value }) {
  if (!value) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-neutral-50 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          {label}
        </div>
        <div className="break-words font-semibold text-neutral-950">{value}</div>
      </div>
    </div>
  );
}

export default function SuccessPage({ resetBooking }) {
  const location = useLocation();
  const booking = location.state?.booking || null;
  const payment = location.state?.payment || null;
  const status = String(booking?.status || "").toLowerCase();
  const statusCopy = getStatusCopy(status);
  const barberId = getBarberId(booking);
  const barberName = getBarberName(booking);
  const salonName = getSalonName(booking);
  const serviceName =
    getDisplayText(booking?.service) ||
    (typeof booking?.serviceName === "string" ? booking.serviceName.trim() : "");
  const bookingDate = formatBookingDate(booking?.bookingDate);
  const bookingTime =
    typeof booking?.time === "string" ? booking.time.trim() : "";
  const duration =
    booking?.duration !== undefined && booking?.duration !== null
      ? `${Number(booking.duration)} րոպե`
      : "";
  const servicePrice = Number(
    booking?.serviceOriginalPrice ?? booking?.originalPrice ?? booking?.price ?? 0
  );
  const serviceDiscountAmount = Number(booking?.serviceDiscountAmount || 0);
  const subtotalAfterServiceDiscount = Math.max(0, servicePrice - serviceDiscountAmount);
  const voucherDiscount = Number(booking?.voucherDiscount || 0);
  const loyaltyDiscount = Number(booking?.loyaltyDiscountAmount || 0);
  const finalPrice = Number(
    booking?.finalPrice ?? booking?.price ?? subtotalAfterServiceDiscount
  );
  const hasPriceBreakdown = Boolean(booking);
  const hasLoyaltyDiscount =
    Boolean(booking?.loyaltyDiscountApplied) && loyaltyDiscount > 0 && !voucherDiscount;
  const hasBookingSummary = Boolean(booking);

  if (!hasBookingSummary) {
    return (
      <Card className="rounded-2xl sm:rounded-3xl">
        <CardContent className="space-y-6 p-6 text-center sm:p-8">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Ամրագրման տվյալները հասանելի չեն
            </h1>
            <p className="text-neutral-500">
              Կարող եք բացել ձեր ամրագրումները կամ սկսել նոր ամրագրում։
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button as={Link} className="w-full" to="/my-bookings">
              Իմ ամրագրումները
            </Button>
            <Button as={Link} className="w-full" to="/specialists" variant="outline">
              Նոր ամրագրում
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-6 p-6 sm:p-8">
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {statusCopy.title}
            </h1>
            <p className="text-neutral-500">{statusCopy.message}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-neutral-950">Ամրագրման ամփոփում</h2>
              <p className="text-sm text-neutral-500">Տվյալները հասանելի են նաև ձեր ամրագրումներում։</p>
            </div>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-neutral-900">
              {statusCopy.label}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailRow icon={Scissors} label="Ծառայություն" value={serviceName} />
            <DetailRow icon={Clock3} label="Ժամ" value={bookingTime} />
            <DetailRow icon={Store} label="Տևողություն" value={duration} />
            <DetailRow icon={UserRound} label="Մասնագետ" value={barberName} />
            <DetailRow icon={Store} label="Սրահ" value={salonName} />
            <DetailRow icon={MapPin} label="Օր" value={bookingDate} />
          </div>
        </div>

        {hasPriceBreakdown && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-left text-sm">
            <div className="font-semibold text-neutral-950">Price summary</div>
            <div className="mt-3 space-y-2">
              <div className="flex justify-between gap-4">
                <span className="text-neutral-500">Service price</span>
                <span className="font-semibold">{formatAmd(servicePrice)}</span>
              </div>
              {serviceDiscountAmount > 0 && (
                <div className="flex justify-between gap-4 text-rose-700">
                  <span>Service discount</span>
                  <span className="font-semibold">-{formatAmd(serviceDiscountAmount)}</span>
                </div>
              )}
              {voucherDiscount > 0 && (
                <div className="flex justify-between gap-4 text-amber-700">
                  <span>Promo code discount</span>
                  <span className="font-semibold">-{formatAmd(voucherDiscount)}</span>
                </div>
              )}
              {hasLoyaltyDiscount && (
                <div className="flex justify-between gap-4 text-emerald-700">
                  <span>Loyalty discount ({Number(booking.loyaltyDiscountPercent || 0)}%)</span>
                  <span className="font-semibold">-{formatAmd(loyaltyDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between gap-4 border-t border-neutral-100 pt-2 text-neutral-950">
                <span className="font-semibold">Final price</span>
                <span className="font-bold">{formatAmd(finalPrice)}</span>
              </div>
            </div>
          </div>
        )}

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

        <div className="grid gap-3 sm:grid-cols-3">
          <Button as={Link} className="w-full" to="/my-bookings">
            Իմ ամրագրումները
          </Button>
          {barberId ? (
            <Button
              as={Link}
              className="w-full"
              to={`/messages/${barberId}`}
              variant="outline"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Գրել մասնագետին
            </Button>
          ) : null}
          <Button
            as={Link}
            className="w-full"
            onClick={resetBooking}
            to="/specialists"
            variant="outline"
          >
            Նոր ամրագրում
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
