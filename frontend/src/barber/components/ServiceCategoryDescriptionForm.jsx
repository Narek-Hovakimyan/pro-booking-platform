import { serviceCategories } from "@/shared/data/serviceCategories";
import ServiceCategoryManager from "./ServiceCategoryManager";

export default function ServiceCategoryDescriptionForm({
  form,
  handleFieldChange,
  isSaving,
  barberId,
  onCustomCategoriesChange,
}) {
  return (
    <section className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <p className="text-sm font-bold text-neutral-900">
          Category and description
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Help clients understand where this service belongs.
        </p>
      </div>

      {/* Category type toggle */}
      <label className="grid gap-1.5 text-sm font-semibold">
        Category type
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={() =>
            handleFieldChange("categoryType", "system")
          }
          className={`flex-1 rounded-2xl border-2 p-3 text-sm font-medium transition-colors ${
            form.categoryType === "system"
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
          }`}
        >
          System category
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() =>
            handleFieldChange("categoryType", "custom")
          }
          className={`flex-1 rounded-2xl border-2 p-3 text-sm font-medium transition-colors ${
            form.categoryType === "custom"
              ? "border-indigo-500 bg-indigo-50 text-indigo-700"
              : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
          }`}
        >
          Custom category
        </button>
      </div>

      {/* System category dropdown */}
      {form.categoryType === "system" && (
        <label className="grid gap-1.5 text-sm font-semibold">
          Category
          <select
            className="w-full rounded-2xl border border-neutral-300 bg-white p-3 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
            disabled={isSaving}
            value={form.category}
            onChange={(e) =>
              handleFieldChange("category", e.target.value)
            }
          >
            {serviceCategories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Custom category dropdown (managed by child) */}
      <ServiceCategoryManager
        barberId={barberId}
        form={form}
        isSaving={isSaving}
        onCustomCategoriesChange={onCustomCategoriesChange}
        onCustomCategoryIdChange={(id) =>
          handleFieldChange("customCategoryId", id)
        }
      />

      {/* Tags */}
      <label className="grid gap-1 text-sm font-semibold">
        Tags
        <span className="text-xs font-normal text-neutral-400">
          Optional comma-separated search terms
        </span>
        <input
          className="w-full rounded-2xl border border-neutral-300 p-2.5 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
          placeholder="e.g. manicure, gel, bridal"
          disabled={isSaving}
          value={form.tags}
          onChange={(e) =>
            handleFieldChange("tags", e.target.value)
          }
        />
      </label>

      {/* Description */}
      <label className="grid gap-1 text-sm font-semibold">
        Description
        <span className="text-xs font-normal text-neutral-400">
          Optional — briefly describe what this service includes
        </span>
        <textarea
          className="w-full rounded-2xl border border-neutral-300 p-2.5 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
          placeholder="e.g. Includes wash, cut, and styling"
          rows={2}
          disabled={isSaving}
          value={form.description}
          onChange={(e) =>
            handleFieldChange("description", e.target.value)
          }
        />
      </label>
    </section>
  );
}