import { Card, CardContent } from "@/shared/components/ui/card";

function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-xl bg-neutral-100 ${className}`} />;
}

export function BarberCardSkeleton() {
  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <SkeletonBlock className="aspect-[4/3] w-full rounded-2xl" />
        <div className="space-y-2">
          <SkeletonBlock className="h-6 w-2/3" />
          <SkeletonBlock className="h-4 w-1/2" />
        </div>
        <SkeletonBlock className="h-10 w-full" />
        <SkeletonBlock className="h-4 w-3/4" />
        <SkeletonBlock className="h-10 w-full" />
        <SkeletonBlock className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

export function SalonCardSkeleton() {
  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <SkeletonBlock className="aspect-[4/3] w-full rounded-2xl" />
        <div className="space-y-2">
          <SkeletonBlock className="h-6 w-2/3" />
          <SkeletonBlock className="h-4 w-1/2" />
          <SkeletonBlock className="h-4 w-3/4" />
        </div>
        <SkeletonBlock className="h-10 w-full" />
        <SkeletonBlock className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

export function BookingCardSkeleton() {
  return (
    <Card className="rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="w-full space-y-2">
            <SkeletonBlock className="h-6 w-2/3" />
            <SkeletonBlock className="h-4 w-1/3" />
          </div>
          <SkeletonBlock className="h-7 w-20 rounded-full" />
        </div>
        <div className="space-y-2">
          <SkeletonBlock className="h-4 w-3/4" />
          <SkeletonBlock className="h-4 w-2/3" />
          <SkeletonBlock className="h-4 w-1/2" />
          <SkeletonBlock className="h-4 w-1/3" />
        </div>
        <SkeletonBlock className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

export function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 p-3">
      <SkeletonBlock className="h-10 w-10 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonBlock className="h-4 w-2/3" />
        <SkeletonBlock className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export function MessageBubbleSkeleton({ align = "left" }) {
  return (
    <div className={`flex ${align === "right" ? "justify-end" : "justify-start"}`}>
      <SkeletonBlock className="h-9 w-2/3 max-w-[80%]" />
    </div>
  );
}

export function NotificationSkeleton() {
  return (
    <Card className="rounded-2xl shadow-sm sm:rounded-3xl">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="w-full space-y-2">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-5 w-2/3" />
          <SkeletonBlock className="h-3 w-40" />
        </div>
        <div className="flex gap-2">
          <SkeletonBlock className="h-10 w-24" />
          <SkeletonBlock className="h-10 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

export function ProfileFormSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2, 3].map((item) => (
        <div className="space-y-2" key={item}>
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="h-12 w-full rounded-2xl" />
        </div>
      ))}
      <SkeletonBlock className="h-10 w-32" />
    </div>
  );
}
