export default function ServiceSinglePriceForm({ form, handleFieldChange, isSaving }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1.5 text-sm font-semibold">
        Price (դր)
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
      <label className="grid gap-1.5 text-sm font-semibold">
        Duration
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
    </div>
  );
}
