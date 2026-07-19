import {
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Pencil,
  Tag,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  getServicePriceInfo,
  getServiceCategoryLabel,
} from "@/shared/data/serviceCategories";

function formatPrice(price) {
  return Number(price).toLocaleString();
}

function getCustomCategoryName(customCategories, customCategoryId) {
  if (!customCategoryId) return null;
  if (typeof customCategoryId === "object" && customCategoryId.name) {
    return customCategoryId.name;
  }
  if (!Array.isArray(customCategories)) return null;
  const id =
    typeof customCategoryId === "object"
      ? String(customCategoryId._id || customCategoryId.id)
      : String(customCategoryId);
  const cat = customCategories.find(
    (c) => String(c._id || c.id) === id
  );
  return cat?.name || null;
}

function renderCategoryLabel(service, customCategories) {
  if (service.customCategoryId) {
    if (typeof service.customCategoryId === "object" && service.customCategoryId.name) {
      return (
        <span className="mt-1 inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-600">
          {service.customCategoryId.name}
        </span>
      );
    }
    const customName = getCustomCategoryName(
      customCategories,
      service.customCategoryId
    );
    if (customName) {
      return (
        <span className="mt-1 inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-600">
          {customName}
        </span>
      );
    }
    return (
      <span className="mt-1 inline-flex rounded-full bg-indigo-100/50 px-2 py-0.5 text-xs font-medium text-indigo-400">
        Custom
      </span>
    );
  }
  return (
    <span className="mt-1 inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
      {getServiceCategoryLabel(service.category || "other")}
    </span>
  );
}

export default function ServiceCard({
  service,
  customCategories,
  isSaving,
  deleteConfirmId,
  onEdit,
  onToggleActive,
  onDeleteConfirm,
  onDeleteCancel,
  onDeleteConfirmExecute,
}) {
  const priceInfo = getServicePriceInfo(service);

  return (
    <div
      className={`group relative overflow-hidden rounded-3xl border bg-white shadow-sm shadow-purple-100/40 transition-all hover:-translate-y-0.5 hover:shadow-md ${
        service.active
          ? "border-purple-100"
          : "border-dashed border-neutral-200 bg-neutral-50/80"
      }`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-1 ${
          service.active
            ? "bg-gradient-to-r from-purple-500 to-pink-500"
            : "bg-neutral-200"
        }`}
      />

      <div className="flex flex-col gap-4 p-4 pt-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  className={`break-words text-base font-bold ${
                    service.active ? "text-neutral-950" : "text-neutral-500"
                  }`}
                >
                  {service.name}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    service.active
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                      : "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200"
                  }`}
                >
                  {service.active ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                  {service.active ? "Active" : "Inactive"}
                </span>
                {priceInfo.hasDiscount && (
                  <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-100">
                    {priceInfo.discountLabel}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {renderCategoryLabel(service, customCategories)}
                {service.type === "package" && (
                  <span className="mt-1 inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-100">
                    Package
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center gap-2 rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-neutral-600">
              <Clock className="h-4 w-4 text-purple-500" />
              <span className="font-semibold text-neutral-900">
                {service.duration} min
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-neutral-600 sm:col-span-1 lg:col-span-2">
              <Wallet className="h-4 w-4 text-pink-500" />
              {priceInfo.hasDiscount ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-neutral-400 line-through">
                    {formatPrice(priceInfo.originalPrice)} դր
                  </span>
                  <span className="font-bold text-neutral-950">
                    {formatPrice(priceInfo.discountedPrice)} դր
                  </span>
                </span>
              ) : (
                <span className="font-bold text-neutral-950">
                  {formatPrice(priceInfo.originalPrice)} դր
                </span>
              )}
            </div>
          </div>

          {service.description && (
            <p className="line-clamp-2 text-sm leading-relaxed text-neutral-500">
              {service.description}
            </p>
          )}
          {Array.isArray(service.tags) && service.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
              <Tag className="h-3.5 w-3.5 text-neutral-400" />
              {service.tags.slice(0, 4).map((tag, index) => (
                <span
                  key={`${tag}-${index}`}
                  className="rounded-full bg-neutral-100 px-2 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1 border-t border-neutral-100 pt-3 sm:border-t-0 sm:pt-0">
          <Button
            disabled={isSaving}
            size="icon"
            variant="ghost"
            className="h-10 w-10 rounded-2xl text-neutral-500 hover:bg-amber-50 hover:text-amber-700"
            title={service.active ? "Deactivate" : "Activate"}
            onClick={onToggleActive}
          >
            {service.active ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
          <Button
            disabled={isSaving}
            size="icon"
            variant="ghost"
            className="h-10 w-10 rounded-2xl text-neutral-500 hover:bg-purple-50 hover:text-purple-700"
            title="Edit"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>

          {deleteConfirmId === service.id ? (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button
                size="sm"
                variant="destructive"
                className="h-10 rounded-2xl px-3 text-xs"
                onClick={onDeleteConfirmExecute}
              >
                Delete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-10 rounded-2xl px-3 text-xs"
                onClick={onDeleteCancel}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              disabled={isSaving}
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-2xl text-red-500 hover:bg-red-50 hover:text-red-700"
              title="Delete"
              onClick={onDeleteConfirm}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}