import { X } from "lucide-react";

export default function SalonListModal({
  salons = [],
  barberName = "",
  isOpen = false,
  onClose = () => {},
  onSelectSalon = () => {},
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          className="absolute right-4 top-4 rounded-full p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          onClick={onClose}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Title */}
        <h3 className="text-lg font-bold text-neutral-950">
          {barberName ? `${barberName}'s salons` : "Select salon"}
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          Choose a salon to view details
        </p>

        {/* Salon list */}
        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {(salons || []).length === 0 ? (
            <p className="py-4 text-center text-sm text-neutral-400">
              No salons available
            </p>
          ) : (
            (salons || []).map((entry) => {
              const salonData = entry?.salon || entry;
              const salonId = salonData?.id || salonData?._id;
              const salonName = salonData?.name || "Salon";
              const isPrimary = entry?.isPrimary;
              const rating = Number(salonData?.averageRating || 0);
              const reviewCount = Number(salonData?.totalReviews ?? salonData?.reviewsCount ?? 0);

              return (
                <button
                  key={salonId}
                  onClick={() => onSelectSalon(salonId)}
                  className="flex w-full items-center gap-3 rounded-xl border border-neutral-100 p-3 text-left transition hover:bg-neutral-50"
                  type="button"
                >
                  {/* Salon image or initial */}
                  {salonData?.image || salonData?.imageUrl ? (
                    <img
                      alt={salonName}
                      className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                      src={salonData.image || salonData.imageUrl}
                    />
                  ) : (
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-500 font-semibold text-white">
                      {salonName.charAt(0)}
                    </div>
                  )}

                  {/* Salon info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-neutral-900">
                        {salonName}
                      </p>
                      {isPrimary && (
                        <span className="inline-flex flex-shrink-0 items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          Primary
                        </span>
                      )}
                    </div>
                    {salonData?.city && (
                      <p className="truncate text-xs text-neutral-500">
                        {salonData.city}
                        {salonData?.address ? `, ${salonData.address}` : ""}
                      </p>
                    )}
                    <p className="text-xs text-yellow-600">
                      ⭐ {rating > 0 ? rating.toFixed(1) : "New"}
                      {reviewCount > 0 && ` (${reviewCount})`}
                    </p>
                  </div>

                  {/* Arrow */}
                  <span className="flex-shrink-0 text-neutral-400">→</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
