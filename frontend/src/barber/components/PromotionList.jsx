import {
  AlertCircle,
  Clock,
  Copy,
  Gift,
  Globe,
  Hash,
  Pencil,
  Percent,
  Plus,
} from "lucide-react";

import { formatPromotionDate, formatPromotionPrice } from "./promotionFormHelpers";

export default function PromotionList({
  copiedId,
  createButtonRef,
  error,
  loading,
  onCopyCode,
  onCreatePromotion,
  onEditPromotion,
  onToggleActive,
  promotions,
  successMsg,
  editButtonRefs,
}) {
  return (
    <>
      {successMsg && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {successMsg}
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {promotions.length} promotion{promotions.length !== 1 ? "s" : ""}
        </p>
        <button
          ref={createButtonRef}
          onClick={onCreatePromotion}
          className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          <Plus className="h-4 w-4" />
          Create Promotion
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!loading && promotions.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <Gift className="h-10 w-10 text-neutral-300" />
          <div>
            <p className="text-lg font-semibold text-neutral-700">No promotions yet</p>
            <p className="mt-1 text-sm text-neutral-500">
              Create promotional offers for clients booking at your salon.
            </p>
          </div>
        </div>
      )}

      {!loading && promotions.length > 0 && (
        <div className="space-y-3">
          {promotions.map((promotion) => (
            <div
              key={promotion._id}
              className={`rounded-2xl border p-4 transition ${
                promotion.active
                  ? "border-neutral-200 bg-white"
                  : "border-neutral-100 bg-neutral-50 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate font-semibold text-neutral-900">
                      {promotion.title}
                    </h4>
                    {promotion.visibility === "public" && (
                      <Globe className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    )}
                  </div>
                  {promotion.description && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-neutral-500">
                      {promotion.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      {promotion.discountType === "percentage" ? (
                        <Percent className="h-3 w-3" />
                      ) : (
                        <Hash className="h-3 w-3" />
                      )}
                      {promotion.discountType === "percentage"
                        ? `${promotion.amount}%`
                        : formatPromotionPrice(promotion.amount)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                      <Hash className="h-3 w-3" />
                      {promotion.currentUses}/{promotion.maxUses} used
                    </span>
                    {promotion.expiresAt && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        <Clock className="h-3 w-3" />
                        {formatPromotionDate(promotion.expiresAt)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <button
                      onClick={() => onCopyCode(promotion)}
                      className="inline-flex items-center gap-1 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-2.5 py-1 text-xs font-mono font-bold text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-100"
                    >
                      <Copy className="h-3 w-3" />
                      {promotion.code}
                      {copiedId === promotion._id && (
                        <span className="font-bold text-emerald-600">Copied!</span>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    ref={(node) => {
                      const key = String(promotion._id);
                      if (node) {
                        editButtonRefs.current.set(key, node);
                      } else {
                        editButtonRefs.current.delete(key);
                      }
                    }}
                    onClick={() => onEditPromotion(promotion)}
                    className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
                    title="Edit"
                    aria-label={`Edit promotion ${promotion.title}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onToggleActive(promotion)}
                    className={`rounded-lg p-2 transition ${
                      promotion.active
                        ? "text-neutral-400 hover:bg-red-50 hover:text-red-600"
                        : "text-neutral-400 hover:bg-emerald-50 hover:text-emerald-600"
                    }`}
                    title={promotion.active ? "Deactivate" : "Activate"}
                  >
                    <span
                      className={`h-3 w-3 rounded-full ${
                        promotion.active ? "bg-emerald-500" : "bg-neutral-300"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600" />
        </div>
      )}
    </>
  );
}
