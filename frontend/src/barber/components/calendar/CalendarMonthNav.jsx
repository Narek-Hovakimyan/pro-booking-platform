import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export default function CalendarMonthNav({
  monthLabel,
  onPrevMonth,
  onNextMonth,
  onGoToToday,
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={onPrevMonth}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="min-w-[180px] text-center text-lg font-bold sm:text-xl">
          {monthLabel}
        </h2>
        <Button variant="outline" size="icon" onClick={onNextMonth}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      <Button variant="outline" onClick={onGoToToday}>
        Today
      </Button>
    </div>
  );
}
