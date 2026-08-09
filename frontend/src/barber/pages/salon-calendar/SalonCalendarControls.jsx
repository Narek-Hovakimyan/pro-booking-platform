import { CalendarRange } from "lucide-react";
import { Link } from "react-router-dom";

import { Card, CardContent } from "@/shared/components/ui/card";

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const getSalonId = (salon) => getIdString(salon?.salon || salon);

const getSalonName = (salon) =>
  salon?.salon?.name || salon?.name || "Salon";

export default function SalonCalendarControls({
  calendar,
  onBarberChange,
  onDateChange,
  onSalonChange,
  onViewChange,
  periodLabel,
  salons,
  selectedBarberId,
  selectedDate,
  selectedSalonId,
  staff,
  view,
}) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">
                Salon
              </span>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
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

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Date</span>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                onChange={(event) => onDateChange(event.target.value)}
                type="date"
                value={selectedDate}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">View</span>
              <div className="mt-1 flex rounded-xl border border-neutral-200 bg-neutral-50 p-1">
                <button
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    view === "day"
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-600 hover:bg-white"
                  }`}
                  onClick={() => onViewChange("day")}
                  type="button"
                >
                  Day
                </button>
                <button
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    view === "week"
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-600 hover:bg-white"
                  }`}
                  onClick={() => onViewChange("week")}
                  type="button"
                >
                  Week
                </button>
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Staff</span>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-900/10"
                onChange={(event) => onBarberChange(event.target.value)}
                value={selectedBarberId}
              >
                <option value="">All staff</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Link
            className="text-sm font-semibold text-neutral-700 underline underline-offset-2 transition hover:text-neutral-950"
            to="/admin/salon/dashboard"
          >
            Back to Salon Dashboard
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          <CalendarRange className="h-4 w-4" />
          <span>{periodLabel}</span>
          {calendar?.salon?.name && (
            <>
              <span className="text-neutral-300">•</span>
              <span>{calendar.salon.name}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
