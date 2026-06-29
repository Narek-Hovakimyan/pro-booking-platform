import { Card, CardContent } from "@/shared/components/ui/card";

function SkeletonBlock({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-purple-100/70 ${className}`}
    />
  );
}

export default function ScheduleSkeleton() {
  return (
    <Card className="rounded-3xl border-purple-100 shadow-lg shadow-purple-100/40 lg:col-span-3">
      <CardContent className="space-y-5 p-4 sm:p-6">
        <SkeletonBlock className="h-8 w-40" />
        <SkeletonBlock className="h-4 w-72" />
        <SkeletonBlock className="h-12 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonBlock className="h-48 w-full rounded-2xl" />
          <SkeletonBlock className="h-48 w-full rounded-2xl" />
        </div>
        <SkeletonBlock className="h-32 w-full rounded-2xl" />
      </CardContent>
    </Card>
  );
}
