import { Card, CardContent } from "@/shared/components/ui/card";

import { getSalonId, getSalonName } from "./salonReportFormatters";

export default function SalonReportsFilters({
  salons,
  selectedSalonId,
  fromDate,
  toDate,
  selectedBarberId,
  staffOptions,
  onSalonChange,
  onFromDateChange,
  onToDateChange,
  onBarberChange,
}) {
  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-end gap-4">
          {salons.length > 1 && (
            <div>
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">
                  Salon
                </span>
                <select
                  className="mt-1 h-11 w-full max-w-xs rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                  onChange={(event) => onSalonChange(event.target.value)}
                  value={selectedSalonId}
                >
                  {salons.map((salon) => (
                    <option key={getSalonId(salon)} value={getSalonId(salon)}>
                      {getSalonName(salon)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">From</span>
              <input
                className="mt-1 h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                type="date"
                value={fromDate}
                onChange={(event) => onFromDateChange(event.target.value)}
              />
            </label>
          </div>

          <div>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">To</span>
              <input
                className="mt-1 h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                type="date"
                value={toDate}
                onChange={(event) => onToDateChange(event.target.value)}
              />
            </label>
          </div>

          <div>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">
                Staff member
              </span>
              <select
                className="mt-1 h-11 w-full max-w-xs rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                onChange={(event) => onBarberChange(event.target.value)}
                value={selectedBarberId}
              >
                <option value="">All staff</option>
                {staffOptions.map((staff) => (
                  <option key={staff._id} value={staff._id}>
                    {staff.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
