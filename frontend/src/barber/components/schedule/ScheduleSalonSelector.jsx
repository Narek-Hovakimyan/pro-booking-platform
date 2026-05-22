import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";

export default function ScheduleSalonSelector({
  selectedSalonEntry,
  approvedSalons,
  getSalonNameFromEntry,
  getSalonAddressFromEntry,
  onOpenDrawer,
}) {
  const activeSalon = selectedSalonEntry || approvedSalons[0];
  const salonAddress = getSalonAddressFromEntry(activeSalon);

  return (
    <Card className="overflow-hidden rounded-2xl border-neutral-200 bg-gradient-to-br from-white to-neutral-50 sm:rounded-3xl">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">
            Selected salon
          </p>
          <p className="mt-0.5 truncate text-lg font-bold text-neutral-900">
            {getSalonNameFromEntry(activeSalon)}
          </p>
          {salonAddress && (
            <p className="mt-1 truncate text-sm text-neutral-500">
              {salonAddress}
            </p>
          )}
        </div>
        <Button
          onClick={onOpenDrawer}
          variant="outline"
          size="sm"
          className="w-full shrink-0 sm:w-auto"
          aria-label="Change salon"
        >
          {approvedSalons.length > 1 ? "Change Salon" : "Select Salon"}
        </Button>
      </CardContent>
    </Card>
  );
}
