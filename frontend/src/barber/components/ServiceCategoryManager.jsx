import { useState, useEffect } from "react";
import { FolderPlus, Loader2, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  fetchServiceCategories,
  createServiceCategory,
} from "@/shared/api/serviceCategories";

export default function ServiceCategoryManager({

  barberId,
  form,
  isSaving,
  onCustomCategoriesChange,
  onCustomCategoryIdChange,
}) {
  const categoryType = form?.categoryType;
  const customCategoryId = form?.customCategoryId ?? "";

  const [allCategories, setAllCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState("");
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [createCategoryError, setCreateCategoryError] = useState("");

  const customCategories = allCategories.filter((c) => c.source === "custom");

  /* ── Load categories on mount ── */
  useEffect(() => {
    if (!barberId) return;

    let cancelled = false;

    async function loadCategories() {
      setCategoriesLoading(true);
      setCategoriesError("");

      try {
        const cats = await fetchServiceCategories(barberId);
        if (!cancelled) {
          setAllCategories(cats);
        }
      } catch (err) {
        if (!cancelled) {
          setCategoriesError(
            err.response?.data?.message || "Could not load categories"
          );
        }
      } finally {
        if (!cancelled) {
          setCategoriesLoading(false);
        }
      }
    }

    loadCategories();
    return () => {
      cancelled = true;
    };
  }, [barberId]);

  /* ── Expose custom categories to parent ── */
  useEffect(() => {
    onCustomCategoriesChange?.(customCategories);
  }, [customCategories, onCustomCategoriesChange]);

  /* ── Create custom category inline ── */
  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setCreateCategoryError("Category name is required");
      return;
    }

    setCreatingCategory(true);
    setCreateCategoryError("");

    try {
      const created = await createServiceCategory(trimmed, barberId);

      // Append new category to the list
      setAllCategories((prev) => [...prev, created]);

      // Auto-select newly created category
      onCustomCategoryIdChange?.(String(created._id || created.id));

      // Close the inline form
      setShowCreateCategory(false);
      setNewCategoryName("");
    } catch (err) {
      setCreateCategoryError(
        err.response?.data?.message || "Could not create category"
      );
    } finally {
      setCreatingCategory(false);
    }
  };

  const openCreateForm = () => {
    setShowCreateCategory(true);
    setCreateCategoryError("");
    setNewCategoryName("");
  };

  const dismissCreateForm = () => {
    setShowCreateCategory(false);
    setCreateCategoryError("");
    setNewCategoryName("");
  };

  if (categoryType !== "custom") return null;

  return (
    <>
      {/* ── Custom category dropdown ── */}
      <label className="grid gap-1.5 text-sm font-semibold">
        Custom category
        {categoriesLoading ? (
          <div className="flex items-center gap-2 rounded-2xl border border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading categories...
          </div>
        ) : categoriesError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            {categoriesError}
          </div>
        ) : (
          <select
            className="w-full rounded-2xl border border-neutral-300 bg-white p-3 font-normal transition-colors focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200"
            disabled={isSaving}
            value={customCategoryId}
            onChange={(e) =>
              onCustomCategoryIdChange?.(e.target.value)
            }
          >
            <option value="">Select a custom category</option>
            {customCategories.map((cat) => (
              <option
                key={cat._id || cat.id}
                value={String(cat._id || cat.id)}
              >
                {cat.name}
              </option>
            ))}
          </select>
        )}
        {!categoriesLoading && !categoriesError && (
          <button
            type="button"
            disabled={isSaving || categoriesLoading}
            onClick={openCreateForm}
            className="mt-1.5 flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <FolderPlus className="h-4 w-4" />
            + Add custom category
          </button>
        )}
      </label>

      {/* ── Inline create category form ── */}
      {showCreateCategory && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 space-y-2">
          {createCategoryError && (
            <p className="text-xs text-red-600">{createCategoryError}</p>
          )}
          <div className="flex items-center gap-2">
            <input
              className="flex-1 rounded-xl border border-indigo-300 bg-white p-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Category name"
              disabled={creatingCategory}
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateCategory();
                }
              }}
              autoFocus
            />
            <Button
              size="sm"
              disabled={creatingCategory || !newCategoryName.trim()}
              onClick={handleCreateCategory}
              className="bg-indigo-600 text-white hover:bg-indigo-700 whitespace-nowrap"
            >
              {creatingCategory ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Create"
              )}
            </Button>
            <button
              type="button"
              disabled={creatingCategory}
              onClick={dismissCreateForm}
              className="rounded-full p-1.5 text-neutral-400 hover:text-neutral-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
