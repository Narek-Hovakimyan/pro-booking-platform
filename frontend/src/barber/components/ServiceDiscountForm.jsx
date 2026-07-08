export default function ServiceDiscountForm({ form, handleFieldChange, isSaving, formOriginalPrice }) {
  return (
    <div className="space-y-3 rounded-2xl border border-rose-100 bg-rose-50/40 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Service discount</p>
        <p className="mt-1 text-xs text-neutral-500">Optional service-level discount shown before promo codes.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold">
          Discount type
          <select
            className="w-full rounded-2xl border border-rose-200 bg-white p-3 font-normal transition-colors focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
            disabled={isSaving}
            value={form.discountType}
            onChange={(e) => handleFieldChange("discountType", e.target.value)}
          >
            <option value="none">No discount</option>
            <option value="percent">Percent discount</option>
            <option value="fixed">Fixed discount</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Discount value
          <input
            className="w-full rounded-2xl border border-rose-200 bg-white p-3 font-normal transition-colors focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:bg-neutral-100"
            disabled={isSaving || form.discountType === "none"}
            min={form.discountType === "percent" ? "1" : "0"}
            max={
              form.discountType === "percent"
                ? "100"
                : Number.isFinite(formOriginalPrice)
                  ? String(formOriginalPrice)
                  : undefined
            }
            placeholder={
              form.discountType === "percent"
                ? "1-100"
                : form.discountType === "fixed"
                  ? "Amount in դր"
                  : "0"
            }
            type="number"
            value={form.discountValue}
            onChange={(e) => handleFieldChange("discountValue", e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
