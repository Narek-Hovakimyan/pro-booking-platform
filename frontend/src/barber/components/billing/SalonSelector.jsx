import { Card, CardContent } from "@/shared/components/ui/card";
import { getSalonId, getSalonName } from "../../utils/salonBillingFormatters";

export function SalonSelector({
  salons,
  selectedSalonId,
  disabled,
  onChange,
}) {
  return (
    <Card className="rounded-3xl border-white/80 shadow-sm">
      <CardContent className="p-5">
        <label className="block">
          <span className="text-sm font-semibold text-neutral-800">Salon</span>
          <select
            className="mt-2 h-12 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            value={selectedSalonId}
          >
            {salons.map((salon) => (
              <option key={getSalonId(salon)} value={getSalonId(salon)}>
                {getSalonName(salon)}
              </option>
            ))}
          </select>
        </label>
      </CardContent>
    </Card>
  );
}
