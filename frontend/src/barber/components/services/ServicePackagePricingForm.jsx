export default function ServicePackagePricingForm({
  form,
  handleFieldChange,
  isSaving,
  availablePackageServices,
  formatPrice,
  isPackageSumPrice,
  isPackageSumDuration,
  computedPackagePrice,
  computedPackageDuration,
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
        Package pricing & duration
      </p>
      <p className="text-xs text-neutral-500">
        Configure how the package total price and duration are determined.
        When "Sum" is selected, values are auto-calculated from included services.
      </p>

      {/* Included services multi-select */}
      <label className="grid gap-1.5 text-sm font-semibold">
        Included services
        <span className="text-xs font-normal text-neutral-400">
          Select at least 2 active single services
        </span>
        <div className="max-h-40 overflow-y-auto rounded-2xl border border-violet-200 bg-white p-1">
          {availablePackageServices.map((s) => {
            const isSelected = form.includedServiceIds.some(
              (id) => String(id) === String(s.id)
            );
            return (
              <label
                key={s.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                  isSelected
                    ? "bg-violet-100 text-violet-800"
                    : "hover:bg-neutral-50"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500"
                  checked={isSelected}
                  disabled={isSaving}
                  onChange={() => {
                    const current = [
                      ...form.includedServiceIds,
                    ];
                    if (isSelected) {
                      handleFieldChange(
                        "includedServiceIds",
                        current.filter(
                          (id) => String(id) !== String(s.id)
                        )
                      );
                    } else {
                      handleFieldChange("includedServiceIds", [
                        ...current,
                        s.id,
                      ]);
                    }
                  }}
                />
                <span className="flex-1">{s.name}</span>
                <span className="text-xs text-neutral-400">
                  {s.duration}min · {formatPrice(s.price)}դր
                </span>
              </label>
            );
          })}
          {availablePackageServices.length === 0 && (
            <p className="p-3 text-center text-xs text-neutral-400">
              No active single services available
            </p>
          )}
        </div>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold">
          Price mode
          <select
            className="w-full rounded-2xl border border-violet-200 bg-white p-3 font-normal transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            disabled={isSaving}
            value={form.packagePriceMode}
            onChange={(e) =>
              handleFieldChange("packagePriceMode", e.target.value)
            }
          >
            <option value="manual">Manual — set price yourself</option>
            <option value="sum">Sum — auto-calculate from included services</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Duration mode
          <select
            className="w-full rounded-2xl border border-violet-200 bg-white p-3 font-normal transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            disabled={isSaving}
            value={form.packageDurationMode}
            onChange={(e) =>
              handleFieldChange("packageDurationMode", e.target.value)
            }
          >
            <option value="manual">Manual — set duration yourself</option>
            <option value="sum">Sum — auto-calculate from included services</option>
          </select>
        </label>
      </div>

      {/* Manual price/duration for package */}
      {form.packagePriceMode === "manual" && (
        <label className="grid gap-1.5 text-sm font-semibold">
          Package price (դր)
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">դր</span>
            <input
              className="w-full rounded-2xl border border-neutral-300 p-3 pl-10 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
              placeholder="0"
              type="number"
              min="0"
              disabled={isSaving}
              value={form.price}
              onChange={(e) => handleFieldChange("price", e.target.value)}
            />
          </div>
        </label>
      )}
      {form.packageDurationMode === "manual" && (
        <label className="grid gap-1.5 text-sm font-semibold">
          Package duration (min)
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">min</span>
            <input
              className="w-full rounded-2xl border border-neutral-300 p-3 pl-12 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
              placeholder="30"
              type="number"
              min="1"
              disabled={isSaving}
              value={form.duration}
              onChange={(e) => handleFieldChange("duration", e.target.value)}
            />
          </div>
        </label>
      )}

      {/* Computed totals hint */}
      {isPackageSumPrice && form.includedServiceIds.length > 0 && (
        <div className="rounded-xl bg-violet-100 p-3 text-sm text-violet-800">
          <span className="font-medium">Computed price:</span>{" "}
          {formatPrice(computedPackagePrice)} դր
        </div>
      )}
      {isPackageSumDuration && form.includedServiceIds.length > 0 && (
        <div className="rounded-xl bg-violet-100 p-3 text-sm text-violet-800">
          <span className="font-medium">Computed duration:</span>{" "}
          {computedPackageDuration} min
        </div>
      )}
    </div>
  );
}