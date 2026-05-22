import { Button } from "@/shared/components/ui/button";

export default function BookingReviewActions({
  booking,
  hasReviewedBarber = false,
  hasReviewedSalon = false,
  canReviewSalon = false,
  onReviewBarber,
  onReviewSalon,
}) {
  return (
    <>
      <Button
        className="w-full"
        disabled={hasReviewedBarber}
        onClick={() => onReviewBarber?.(booking)}
      >
        {hasReviewedBarber ? "Barber reviewed ✓" : "Review barber"}
      </Button>

      {canReviewSalon && (
        <Button
          className="w-full"
          disabled={hasReviewedSalon}
          onClick={() => onReviewSalon?.(booking)}
          variant="outline"
        >
          {hasReviewedSalon ? "Salon reviewed ✓" : "Review salon"}
        </Button>
      )}
    </>
  );
}
