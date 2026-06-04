import { Button } from "@/shared/components/ui/button";
import {
  getServicePriceInfo,
  groupServicesByDisplayCategory,
} from "@/shared/data/serviceCategories";

export default function ServiceStep({
  services = [],
  selectedServiceId,
  onSelectService,
  onContinue,
}) {
  const activeServices = services.filter((service) => service?.active);
  const hasActiveServices = activeServices.length > 0;
  const groupedServices = groupServicesByDisplayCategory(activeServices);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold sm:text-2xl">Ընտրիր ծառայությունը</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Pick one service before choosing a time.
        </p>
      </div>

      {hasActiveServices ? (
        <div className="space-y-6">
          {groupedServices.map((group) => (
            <div key={group.key}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                {group.label}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.services.map((service) => {
                  const isSelected = String(selectedServiceId) === String(service?.id || service?._id);
                  const priceInfo = getServicePriceInfo(service);
                  return (
                    <button
                      key={service?.id || service?._id}
                      onClick={() => onSelectService(service?.id || service?._id)}
                      className={`relative w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                        isSelected
                          ? "border-neutral-900 bg-neutral-900 text-white ring-2 ring-neutral-900/20"
                          : "border-neutral-200 bg-white hover:bg-neutral-50"
                      }`}
                    >
                      {isSelected && (
                        <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold text-neutral-900">
                          ✓
                        </span>
                      )}
                      <div className={`font-semibold ${isSelected ? "text-white" : "text-neutral-950"}`}>
                        {service?.name || "Service"}
                      </div>
                      {(service?.type === "package" || priceInfo.hasDiscount) && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {priceInfo.hasDiscount && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                              isSelected ? "bg-rose-500 text-white" : "bg-rose-100 text-rose-700"
                            }`}>
                              {priceInfo.discountLabel}
                            </span>
                          )}
                          {service?.type === "package" && (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            isSelected ? "bg-violet-500 text-white" : "bg-violet-100 text-violet-700"
                          }`}>
                            Package
                          </span>
                          )}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {service?.includedServiceIds?.length > 0 && Array.isArray(service.includedServiceIds) && typeof service.includedServiceIds[0] === "object" && (
                          <span className={`text-xs ${isSelected ? "text-violet-200" : "text-violet-500"}`}>
                            {service.includedServiceIds.map((s) => s.name || s.serviceName).filter(Boolean).join(" + ")}
                          </span>
                        )}
                        <span className={`text-sm ${isSelected ? "text-neutral-300" : "text-neutral-500"}`}>
                          {service?.duration || 20} րոպե ·{" "}
                          <span className="inline-flex items-center gap-1.5">
                            {priceInfo.hasDiscount && (
                              <span className={`line-through ${isSelected ? "text-neutral-400" : "text-neutral-400"}`}>
                                {Number(priceInfo.originalPrice).toLocaleString()} դրամ
                              </span>
                            )}
                            <span className={`font-semibold ${isSelected ? "text-white" : "text-neutral-800"}`}>
                              {Number(priceInfo.discountedPrice).toLocaleString()} դրամ
                            </span>
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-sm text-neutral-500 sm:col-span-2">
          No services added.
        </div>
      )}

      <Button className="w-full sm:w-auto" disabled={!hasActiveServices || !selectedServiceId} onClick={onContinue}>
        Շարունակել
      </Button>
    </div>
  );
}
