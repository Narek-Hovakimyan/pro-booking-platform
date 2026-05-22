import { UserRound } from "lucide-react";

export function BarberProfileError({ error }) {
  if (!error) return null;

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {error}
    </div>
  );
}

export function BarberProfileLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-950" />
        <p className="text-sm text-neutral-500">Loading profile...</p>
      </div>
    </div>
  );
}

export function BarberProfileNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <UserRound className="mx-auto h-12 w-12 text-neutral-300" />
        <p className="mt-4 text-lg font-semibold text-neutral-900">Profile not found</p>
        <p className="mt-1 text-sm text-neutral-500">This specialist does not exist or has been removed.</p>
      </div>
    </div>
  );
}
