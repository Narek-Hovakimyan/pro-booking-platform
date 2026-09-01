import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderPlus, Loader2, Pencil, Power, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  createServiceCategory,
  deleteServiceCategory,
  fetchServiceCategories,
  renameServiceCategory,
  setServiceCategoryActive,
} from "@/shared/api/serviceCategories";

const categoryId = (category) => String(category?._id || category?.id || "");
const errorMessage = (error, fallback) => error.response?.data?.message || fallback;

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
  const [inactiveCategories, setInactiveCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesLoadedForBarberId, setCategoriesLoadedForBarberId] = useState(null);
  const [categoriesError, setCategoriesError] = useState("");
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [createCategoryError, setCreateCategoryError] = useState("");
  const [editingCategory, setEditingCategory] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [lifecyclePendingId, setLifecyclePendingId] = useState("");
  const [lifecycleError, setLifecycleError] = useState("");
  const [lifecycleStatus, setLifecycleStatus] = useState("");
  const createInFlightRef = useRef(false);
  const mutationInFlightRef = useRef(false);
  const cancelConfirmationRef = useRef(null);

  const customCategories = useMemo(
    () => allCategories.filter((category) => category.source === "custom"),
    [allCategories]
  );
  const currentInactiveCategory = (() => {
    const localCategory = inactiveCategories.find(
      (category) => categoryId(category) === String(customCategoryId)
    );
    if (localCategory) return localCategory;
    return form?.currentCustomCategory?.active === false &&
      String(form.currentCustomCategory.id) === String(customCategoryId)
      ? form.currentCustomCategory
      : null;
  })();
  const selectedCategory =
    customCategories.find((category) => categoryId(category) === String(customCategoryId)) ||
    currentInactiveCategory;
  const retainsStoredReference =
    Boolean(form?.currentCustomCategory) &&
    String(form.currentCustomCategory.id) === String(customCategoryId);

  const refreshCategories = useCallback(async () => {
    if (!barberId) return [];
    setCategoriesLoading(true);
    setCategoriesError("");
    try {
      const categories = await fetchServiceCategories(barberId);
      const nextCategories = Array.isArray(categories) ? categories : [];
      setAllCategories(nextCategories);
      setCategoriesLoadedForBarberId(barberId);
      return nextCategories;
    } catch (error) {
      setCategoriesError(errorMessage(error, "Could not load categories"));
      return [];
    } finally {
      setCategoriesLoading(false);
    }
  }, [barberId]);

  useEffect(() => {
    let cancelled = false;
    if (!barberId) {
      return undefined;
    }
    Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setCategoriesLoading(true);
        setCategoriesError("");
        return fetchServiceCategories(barberId);
      })
      .then((categories) => {
        if (categories === null) return;
        if (!cancelled) {
          setAllCategories(Array.isArray(categories) ? categories : []);
          setCategoriesLoadedForBarberId(barberId);
        }
      })
      .catch((error) => {
        if (!cancelled) setCategoriesError(errorMessage(error, "Could not load categories"));
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [barberId]);

  useEffect(() => {
    onCustomCategoriesChange?.(customCategories);
  }, [customCategories, onCustomCategoriesChange]);

  useEffect(() => {
    if (categoriesLoadedForBarberId !== barberId || !customCategoryId || currentInactiveCategory) return;
    if (!customCategories.some((category) => categoryId(category) === String(customCategoryId))) {
      onCustomCategoryIdChange?.("");
    }
  }, [barberId, categoriesLoadedForBarberId, customCategories, currentInactiveCategory, customCategoryId, onCustomCategoryIdChange]);

  useEffect(() => {
    if (confirmation) cancelConfirmationRef.current?.focus();
  }, [confirmation]);

  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setCreateCategoryError("Category name is required");
      return;
    }
    if (createInFlightRef.current || creatingCategory) return;

    createInFlightRef.current = true;
    setCreatingCategory(true);
    setCreateCategoryError("");
    try {
      const created = await createServiceCategory(trimmed, barberId);
      setAllCategories((categories) => [...categories, created]);
      onCustomCategoryIdChange?.(categoryId(created));
      setShowCreateCategory(false);
      setNewCategoryName("");
      setLifecycleStatus("Category created.");
    } catch (error) {
      setCreateCategoryError(errorMessage(error, "Could not create category"));
    } finally {
      createInFlightRef.current = false;
      setCreatingCategory(false);
    }
  };

  const runMutation = async (action, category, updates) => {
    if (!category || mutationInFlightRef.current) return;
    const id = categoryId(category);
    mutationInFlightRef.current = true;
    setLifecyclePendingId(id);
    setLifecycleError("");
    setLifecycleStatus("");
    try {
      const result = action === "delete"
        ? await deleteServiceCategory(id)
        : action === "rename"
          ? await renameServiceCategory(id, updates.name)
          : await setServiceCategoryActive(id, updates.active);
      const updatedCategory = result?.category || result;

      if (action === "delete") {
        if (result?.softDeleted && updatedCategory) {
          setInactiveCategories((categories) => [
            ...categories.filter((item) => categoryId(item) !== id),
            updatedCategory,
          ]);
          setLifecycleStatus(result.message || "Category deactivated.");
        } else {
          setInactiveCategories((categories) => categories.filter((item) => categoryId(item) !== id));
          setLifecycleStatus(result?.message || "Category deleted.");
        }
        setAllCategories((categories) => categories.filter((item) => categoryId(item) !== id));
      } else if (updates.active === false) {
        setAllCategories((categories) => categories.filter((item) => categoryId(item) !== id));
        setInactiveCategories((categories) => [
          ...categories.filter((item) => categoryId(item) !== id),
          updatedCategory,
        ]);
        setLifecycleStatus("Category deactivated.");
      } else if (updates.active === true) {
        setInactiveCategories((categories) => categories.filter((item) => categoryId(item) !== id));
        setAllCategories((categories) => [
          ...categories.filter((item) => categoryId(item) !== id),
          updatedCategory,
        ]);
        setLifecycleStatus("Category reactivated.");
      } else {
        setAllCategories((categories) => categories.map((item) =>
          categoryId(item) === id ? updatedCategory : item
        ));
        setLifecycleStatus("Category renamed.");
      }

      const becameInactive = updates?.active === false || (action === "delete" && result?.softDeleted);
      if (becameInactive && String(customCategoryId) === id && !retainsStoredReference) {
        onCustomCategoryIdChange?.("");
      }
      if (action === "delete" && !result?.softDeleted && String(customCategoryId) === id) {
        onCustomCategoryIdChange?.("");
      }
      if (updates?.active === true && String(customCategoryId) === id) {
        onCustomCategoryIdChange?.(id);
      }
      setEditingCategory(null);
      setConfirmation(null);
      await refreshCategories();
    } catch (error) {
      setLifecycleError(errorMessage(error, `Could not ${action} category`));
    } finally {
      mutationInFlightRef.current = false;
      setLifecyclePendingId("");
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
  const startRename = () => {
    setEditingCategory(selectedCategory);
    setRenameValue(selectedCategory?.name || "");
    setLifecycleError("");
  };
  const submitRename = (event) => {
    event.preventDefault();
    const name = renameValue.trim();
    if (!name) {
      setLifecycleError("Category name is required");
      return;
    }
    runMutation("rename", editingCategory, { name });
  };

  if (categoryType !== "custom") return null;
  const isPending = categoryId(selectedCategory) === lifecyclePendingId;

  return (
    <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3">
      <div aria-live="polite" className="sr-only">{lifecycleStatus}</div>
      {lifecycleError && <p role="alert" className="text-xs text-red-600">{lifecycleError}</p>}
      <label className="grid gap-1.5 text-sm font-semibold">
        Custom category
        {categoriesLoading ? (
          <div role="status" className="flex items-center gap-2 rounded-2xl border border-indigo-100 bg-white p-3 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading categories...
          </div>
        ) : categoriesError ? (
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{categoriesError}</div>
        ) : (
          <select
            className="w-full rounded-2xl border border-indigo-200 bg-white p-3 font-normal transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            disabled={isSaving || Boolean(lifecyclePendingId)}
            value={customCategoryId}
            onChange={(event) => onCustomCategoryIdChange?.(event.target.value)}
          >
            <option value="">Select a custom category</option>
            {customCategories.map((category) => <option key={categoryId(category)} value={categoryId(category)}>{category.name}</option>)}
            {currentInactiveCategory && !customCategories.some((category) => categoryId(category) === categoryId(currentInactiveCategory)) && (
              <option value={categoryId(currentInactiveCategory)} disabled>{currentInactiveCategory.name} (Inactive)</option>
            )}
          </select>
        )}
      </label>
      {currentInactiveCategory && (
        <p className="text-xs text-amber-700">
          {currentInactiveCategory.missing
            ? "This category is unavailable. Select an active category to replace it before saving."
            : "This category is inactive and retained for this service. Select an active category to replace it."}
        </p>
      )}
      {!categoriesLoading && !categoriesError && (
        <button type="button" disabled={isSaving || Boolean(lifecyclePendingId)} onClick={openCreateForm}
          className="flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-100 hover:bg-indigo-100 hover:text-indigo-900">
          <FolderPlus className="h-4 w-4" /> Add custom category
        </button>
      )}

      {selectedCategory && !categoriesLoading && !categoriesError && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2" aria-label="Selected category actions">
          {selectedCategory.active !== false ? (
            <>
              <button type="button" aria-label="Rename selected category" disabled={isSaving || isPending} onClick={startRename} className="rounded-lg p-2 text-indigo-700 hover:bg-indigo-50"><Pencil className="h-4 w-4" /></button>
              <button type="button" aria-label="Deactivate selected category" disabled={isSaving || isPending} onClick={() => setConfirmation({ action: "deactivate", category: selectedCategory })} className="rounded-lg p-2 text-amber-700 hover:bg-amber-50"><Power className="h-4 w-4" /></button>
              <button type="button" aria-label="Delete selected category" disabled={isSaving || isPending} onClick={() => setConfirmation({ action: "delete", category: selectedCategory })} className="rounded-lg p-2 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </>
          ) : (
            <button type="button" aria-label="Reactivate selected category" disabled={isSaving || isPending} onClick={() => runMutation("reactivate", selectedCategory, { active: true })} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-emerald-700 hover:bg-emerald-50"><RotateCcw className="h-4 w-4" /> Reactivate</button>
          )}
        </div>
      )}

      {editingCategory && (
        <form onSubmit={submitRename} className="space-y-2 rounded-2xl border border-indigo-200 bg-white p-3">
          <label htmlFor="service-category-rename" className="text-sm font-semibold">Rename custom category</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="service-category-rename" value={renameValue} disabled={isPending} onChange={(event) => setRenameValue(event.target.value)} className="flex-1 rounded-xl border border-indigo-200 p-2.5 text-sm" autoFocus />
            <Button type="submit" size="sm" disabled={isPending || !renameValue.trim()}>Save</Button>
            <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setEditingCategory(null)}>Cancel</Button>
          </div>
        </form>
      )}

      {showCreateCategory && (
        <div className="space-y-2 rounded-2xl border border-indigo-200 bg-white p-3">
          {createCategoryError && <p role="alert" className="text-xs text-red-600">{createCategoryError}</p>}
          <label htmlFor="new-service-category" className="sr-only">New custom category name</label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input id="new-service-category" className="w-full flex-1 rounded-xl border border-indigo-200 bg-white p-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100" placeholder="Category name" disabled={creatingCategory} value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); handleCreateCategory(); } }} autoFocus />
            <Button size="sm" disabled={creatingCategory || !newCategoryName.trim()} onClick={handleCreateCategory} className="whitespace-nowrap rounded-xl bg-indigo-600 text-white hover:bg-indigo-700">{creatingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}</Button>
            <button type="button" aria-label="Cancel category creation" disabled={creatingCategory} onClick={dismissCreateForm} className="self-center rounded-xl p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {confirmation && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="category-confirmation-title" onKeyDown={(event) => { if (event.key === "Escape") setConfirmation(null); }} className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p id="category-confirmation-title" className="text-sm font-semibold">{confirmation.action === "delete" ? `Delete ${confirmation.category.name}?` : `Deactivate ${confirmation.category.name}?`}</p>
          <p className="text-xs text-neutral-600">{confirmation.action === "delete" ? "This cannot be undone unless services still reference the category." : "Existing references remain available, but new services cannot use this category."}</p>
          <div className="flex gap-2">
            <Button ref={cancelConfirmationRef} type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setConfirmation(null)}>Cancel</Button>
            <Button type="button" size="sm" disabled={isPending} onClick={() => runMutation(confirmation.action, confirmation.category, confirmation.action === "deactivate" ? { active: false } : undefined)}>{confirmation.action === "delete" ? "Delete" : "Deactivate"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
