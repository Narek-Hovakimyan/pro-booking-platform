export default function ServiceBasicDetailsForm({ form, handleFieldChange, isSaving }) {
  return (
    <section className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <p className="text-sm font-bold text-neutral-900">Basic details</p>
        <p className="mt-1 text-xs text-neutral-500">
          Name the service and choose whether it is a single service or package.
        </p>
      </div>

      {/* Service name */}
      <label className="grid gap-1.5 text-sm font-semibold">
        Service name
        <input
          className="w-full rounded-2xl border border-neutral-300 p-3 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
          placeholder="e.g. Haircut, Beard Trim"
          disabled={isSaving}
          value={form.name}
          onChange={(e) => handleFieldChange("name", e.target.value)}
          autoFocus
        />
      </label>

      {/* Service type toggle */}
      <label className="grid gap-1.5 text-sm font-semibold">Service type</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={() => {
            handleFieldChange("type", "single");
            handleFieldChange("includedServiceIds", []);
            handleFieldChange("packagePriceMode", "manual");
            handleFieldChange("packageDurationMode", "manual");
          }}
          className={`flex-1 rounded-2xl border-2 p-3 text-sm font-medium transition-colors ${
            form.type === "single"
              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
              : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
          }`}
        >
          Single service
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => handleFieldChange("type", "package")}
          className={`flex-1 rounded-2xl border-2 p-3 text-sm font-medium transition-colors ${
            form.type === "package"
              ? "border-violet-500 bg-violet-50 text-violet-700"
              : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
          }`}
        >
          Package
        </button>
      </div>
    </section>
  );
}