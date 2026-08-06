export function SeatUsagePanel({
  activeSeatsCount,
  activeCapacity,
  seatUsagePercent,
  visibleAvailableSeatCount,
  revokedSeatsCount,
}) {
  return (
    <div className="rounded-3xl border border-neutral-100 bg-neutral-50/80 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-neutral-950">Seat usage</h3>
          <p className="mt-1 text-sm text-neutral-500">
            {activeSeatsCount} of {activeCapacity} active paid seats assigned.
          </p>
        </div>
        <div className="text-sm font-semibold text-neutral-700">
          {seatUsagePercent}%
        </div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500"
          style={{ width: `${seatUsagePercent}%` }}
        />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-3 text-sm">
          <div className="text-neutral-500">Active</div>
          <div className="font-semibold text-neutral-950">{activeSeatsCount}</div>
        </div>
        <div className="rounded-2xl bg-white p-3 text-sm">
          <div className="text-neutral-500">Available</div>
          <div className="font-semibold text-neutral-950">
            {visibleAvailableSeatCount}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-3 text-sm">
          <div className="text-neutral-500">Revoked</div>
          <div className="font-semibold text-neutral-950">{revokedSeatsCount}</div>
        </div>
      </div>
    </div>
  );
}
