import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Image,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import {
  getMyPortfolio,
  createPortfolioPhoto,
  updatePortfolioPhoto,
  deletePortfolioPhoto,
} from "@/shared/api/portfolio";
import ConfirmModal from "@/shared/components/common/ConfirmModal";
import { Button } from "@/shared/components/ui/button";
import { getMediaUrl } from "@/shared/utils/media";

const EMPTY_FORM = {
  caption: "",
  category: "",
  tags: "",
  isPublic: true,
  consentConfirmed: false,
};

const getPortfolioId = (item) => item?._id || item?.id;

export default function PortfolioManager() {
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?.id || currentUser?._id;
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  /* ── Modal state ── */
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  /* ── File upload state ── */
  const [beforeImage, setBeforeImage] = useState(null);
  const [afterImage, setAfterImage] = useState(null);
  const [beforePreview, setBeforePreview] = useState(null);
  const [afterPreview, setAfterPreview] = useState(null);
  const beforeFileInputRef = useRef(null);
  const afterFileInputRef = useRef(null);

  /* ── Delete confirmation ── */
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /* ── Fetch portfolio items ── */
  useEffect(() => {
    if (!currentUserId) return;

    let mounted = true;

    async function fetchItems() {
      try {
        const data = await getMyPortfolio();
        if (mounted) {
          setItems(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err.response?.data?.message || "Could not load portfolio items"
          );
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    fetchItems();

    return () => {
      mounted = false;
    };
  }, [currentUserId]);

  useEffect(() => (
    () => {
      if (beforePreview) URL.revokeObjectURL(beforePreview);
      if (afterPreview) URL.revokeObjectURL(afterPreview);
    }
  ), [beforePreview, afterPreview]);

  /* ── Open add modal ── */
  const openAddModal = () => {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setBeforeImage(null);
    setAfterImage(null);
    setBeforePreview(null);
    setAfterPreview(null);
    setIsModalOpen(true);
  };

  /* ── Open edit modal ── */
  const openEditModal = (item) => {
    setEditingItem(item);
    setForm({
      caption: item.caption || "",
      category: item.category || "",
      tags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
      isPublic: item.isPublic !== false,
      consentConfirmed: item.consentConfirmed === true,
    });
    setFormError("");
    setBeforeImage(null);
    setAfterImage(null);
    setBeforePreview(null);
    setAfterPreview(null);
    setIsModalOpen(true);
  };

  /* ── Close modal ── */
  const closeModal = ({ force = false } = {}) => {
    if (isSaving && !force) return;
    if (beforePreview) URL.revokeObjectURL(beforePreview);
    if (afterPreview) URL.revokeObjectURL(afterPreview);
    setIsModalOpen(false);
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setBeforeImage(null);
    setAfterImage(null);
    setBeforePreview(null);
    setAfterPreview(null);
  };

  /* ── Form field update ── */
  const updateForm = (field, value) => {
    setFormError("");
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  /* ── Image selection ── */
  const handleBeforeImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setFormError("Only JPEG, PNG, and WEBP images are allowed");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFormError("Image must be 10MB or smaller");
      return;
    }

    setBeforeImage(file);
    if (beforePreview) URL.revokeObjectURL(beforePreview);
    setBeforePreview(URL.createObjectURL(file));
    setFormError("");
  };

  const handleAfterImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setFormError("Only JPEG, PNG, and WEBP images are allowed");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFormError("Image must be 10MB or smaller");
      return;
    }

    setAfterImage(file);
    if (afterPreview) URL.revokeObjectURL(afterPreview);
    setAfterPreview(URL.createObjectURL(file));
    setFormError("");
  };

  const removeBeforeImage = () => {
    setBeforeImage(null);
    if (beforePreview) URL.revokeObjectURL(beforePreview);
    setBeforePreview(null);
    if (beforeFileInputRef.current) {
      beforeFileInputRef.current.value = "";
    }
  };

  const removeAfterImage = () => {
    setAfterImage(null);
    if (afterPreview) URL.revokeObjectURL(afterPreview);
    setAfterPreview(null);
    if (afterFileInputRef.current) {
      afterFileInputRef.current.value = "";
    }
  };

  /* ── Validation ── */
  const validateForm = () => {
    if (!editingItem) {
      if (!beforeImage) {
        setFormError("Before image is required");
        return false;
      }
      if (!afterImage) {
        setFormError("After image is required");
        return false;
      }
    }

    if (form.isPublic && !form.consentConfirmed) {
      setFormError(
        "Consent confirmation is required when making a photo public"
      );
      return false;
    }

    return true;
  };

  /* ── Save ── */
  const handleSave = async (e) => {
    e.preventDefault();

    if (!currentUserId || isSaving) return;
    if (!validateForm()) return;

    setIsSaving(true);
    setFormError("");

    try {
      if (editingItem) {
        const editId = getPortfolioId(editingItem);
        if (!editId) {
          setFormError("Could not edit this item. Please refresh and try again.");
          setIsSaving(false);
          return;
        }

        const payload = {
          caption: form.caption.trim(),
          category: form.category.trim(),
          tags: form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          isPublic: form.isPublic,
          consentConfirmed: form.consentConfirmed,
        };

        const updated = await updatePortfolioPhoto(editId, payload);
        setItems((prev) =>
          prev.map((item) =>
            String(getPortfolioId(item)) === String(editId) ? updated : item
          )
        );
      } else {
        const formData = new FormData();
        formData.append("beforeImage", beforeImage);
        formData.append("afterImage", afterImage);
        formData.append("caption", form.caption.trim());
        formData.append("category", form.category.trim());
        formData.append(
          "tags",
          form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .join(",")
        );
        formData.append("isPublic", String(form.isPublic));
        formData.append("consentConfirmed", String(form.consentConfirmed));

        const created = await createPortfolioPhoto(formData);
        setItems((prev) => [created, ...prev]);
      }

      closeModal({ force: true });
    } catch (err) {
      setFormError(
        err.response?.data?.message || "Could not save portfolio item"
      );
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Delete ── */
  const openDeleteConfirmation = (item) => {
    setDeleteTarget(item);
  };

  const closeDeleteConfirmation = () => {
    if (isDeleting) return;
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;

    const deleteId = getPortfolioId(deleteTarget);
    if (!deleteId) {
      setError("Could not delete this item. Please refresh and try again.");
      setDeleteTarget(null);
      return;
    }

    setIsDeleting(true);

    try {
      await deletePortfolioPhoto(deleteId);
      setItems((prev) =>
        prev.filter((item) => String(getPortfolioId(item)) !== String(deleteId))
      );
      setDeleteTarget(null);
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not delete portfolio item"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  /* ── Loading state ── */
  if (isLoading) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-bold text-neutral-950">
          Before / After Portfolio
        </h3>
        <p className="mt-3 text-sm text-neutral-500">
          Loading portfolio...
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold text-neutral-950">
          Before / After Portfolio
        </h3>
        <p className="text-sm text-neutral-500">
          Showcase your work with before and after photos.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button onClick={openAddModal}>
        <Plus className="mr-2 h-4 w-4" />
        Add Before / After
      </Button>

      {items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200">
            <Image className="h-7 w-7 text-neutral-500" />
          </div>
          <div>
            <p className="text-lg font-semibold text-neutral-700">
              No portfolio items yet
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Add your first before/after photo pair to showcase your work.
            </p>
          </div>
          <Button
            onClick={openAddModal}
            className="bg-blue-600 text-white hover:bg-blue-700 rounded-lg px-5 py-2.5 font-medium"
          >
            <Plus className="mr-2 h-5 w-5" />
            Add your first portfolio
          </Button>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
          {items.map((item) => {
            const itemId = getPortfolioId(item);
            const isActive = item.active !== false;

            return (
              <div
                key={itemId}
                className={`group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md ${
                  !isActive
                    ? "border-dashed border-neutral-300 bg-neutral-50/50"
                    : "border-neutral-200"
                }`}
              >
                <div
                  className={`absolute left-0 top-0 h-full w-1 ${
                    isActive ? "bg-emerald-500" : "bg-neutral-300"
                  }`}
                />

                <div className="p-3 pl-4">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    {!isActive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600">
                        <EyeOff className="h-3 w-3" />
                        Inactive
                      </span>
                    )}
                    {item.isPublic ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <Eye className="h-3 w-3" />
                        Public
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
                        <EyeOff className="h-3 w-3" />
                        Private
                      </span>
                    )}
                    {item.consentConfirmed && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Consent ✓
                      </span>
                    )}
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div>
                      <p className="mb-1 text-xs font-semibold text-neutral-500">
                        Before
                      </p>
                      <div className="aspect-square overflow-hidden rounded-xl bg-neutral-100">
                        {item.beforeUrl ? (
                          <img
                            src={getMediaUrl(item.beforeUrl)}
                            alt="Before"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-neutral-400">
                            <Image className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold text-neutral-500">
                        After
                      </p>
                      <div className="aspect-square overflow-hidden rounded-xl bg-neutral-100">
                        {item.afterUrl ? (
                          <img
                            src={getMediaUrl(item.afterUrl)}
                            alt="After"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-neutral-400">
                            <Image className="h-6 w-6" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {item.caption && (
                    <p className="mb-1 text-sm font-medium text-neutral-800 line-clamp-2">
                      {item.caption}
                    </p>
                  )}

                  {item.category && (
                    <p className="text-xs text-neutral-500">{item.category}</p>
                  )}

                  {Array.isArray(item.tags) && item.tags.length > 0 && (
                    <p className="mt-1 text-xs text-neutral-400">
                      {item.tags.slice(0, 4).join(", ")}
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-end gap-1 border-t border-neutral-100 pt-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 text-neutral-400 hover:text-blue-600"
                      title="Edit"
                      onClick={() => openEditModal(item)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 text-neutral-400 hover:text-red-600"
                      title="Delete"
                      onClick={() => openDeleteConfirmation(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[calc(100vh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:max-h-[calc(100vh-2rem)] sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold">
                  {editingItem ? "Edit Portfolio Item" : "Add Before / After"}
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                  {editingItem
                    ? "Update caption, tags, and visibility settings."
                    : "Upload a before and after photo pair."}
                </p>
              </div>
              <Button
                aria-label="Close"
                disabled={isSaving}
                onClick={closeModal}
                size="icon"
                variant="outline"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleSave}>
              {!editingItem && (
                <>
                  <label className="grid gap-2 text-sm font-semibold">
                    Before image
                    <span className="text-xs font-normal text-neutral-400">
                      Required. JPEG, PNG, or WEBP. Max 10MB.
                    </span>
                    <input
                      accept=".jpg,.jpeg,.png,.webp"
                      className="hidden"
                      disabled={isSaving}
                      ref={beforeFileInputRef}
                      type="file"
                      onChange={handleBeforeImageSelect}
                    />
                  </label>

                  <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-3">
                    {beforePreview ? (
                      <div className="relative">
                        <img
                          alt="Before preview"
                          className="max-h-40 w-full rounded-xl object-contain"
                          src={beforePreview}
                        />
                        <Button
                          aria-label="Remove before image"
                          className="absolute right-2 top-2"
                          disabled={isSaving}
                          onClick={removeBeforeImage}
                          size="icon"
                          variant="outline"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-3">
                        <Image className="h-8 w-8 text-neutral-400" />
                        <p className="text-sm text-neutral-500">
                          No before image selected
                        </p>
                      </div>
                    )}

                    <Button
                      className="mt-2 w-full"
                      disabled={isSaving}
                      onClick={() => beforeFileInputRef.current?.click()}
                      type="button"
                      variant="outline"
                    >
                      {beforePreview ? "Change image" : "Select before image"}
                    </Button>
                  </div>

                  <label className="grid gap-2 text-sm font-semibold">
                    After image
                    <span className="text-xs font-normal text-neutral-400">
                      Required. JPEG, PNG, or WEBP. Max 10MB.
                    </span>
                    <input
                      accept=".jpg,.jpeg,.png,.webp"
                      className="hidden"
                      disabled={isSaving}
                      ref={afterFileInputRef}
                      type="file"
                      onChange={handleAfterImageSelect}
                    />
                  </label>

                  <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-3">
                    {afterPreview ? (
                      <div className="relative">
                        <img
                          alt="After preview"
                          className="max-h-40 w-full rounded-xl object-contain"
                          src={afterPreview}
                        />
                        <Button
                          aria-label="Remove after image"
                          className="absolute right-2 top-2"
                          disabled={isSaving}
                          onClick={removeAfterImage}
                          size="icon"
                          variant="outline"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-3">
                        <Image className="h-8 w-8 text-neutral-400" />
                        <p className="text-sm text-neutral-500">
                          No after image selected
                        </p>
                      </div>
                    )}

                    <Button
                      className="mt-2 w-full"
                      disabled={isSaving}
                      onClick={() => afterFileInputRef.current?.click()}
                      type="button"
                      variant="outline"
                    >
                      {afterPreview ? "Change image" : "Select after image"}
                    </Button>
                  </div>
                </>
              )}

              {editingItem && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-xs font-semibold text-neutral-500">
                      Current Before
                    </p>
                    <div className="aspect-square overflow-hidden rounded-xl bg-neutral-100">
                      {editingItem.beforeUrl ? (
                        <img
                          src={getMediaUrl(editingItem.beforeUrl)}
                          alt="Current before"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-neutral-400">
                          <Image className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold text-neutral-500">
                      Current After
                    </p>
                    <div className="aspect-square overflow-hidden rounded-xl bg-neutral-100">
                      {editingItem.afterUrl ? (
                        <img
                          src={getMediaUrl(editingItem.afterUrl)}
                          alt="Current after"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-neutral-400">
                          <Image className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <label className="grid gap-2 text-sm font-semibold">
                Caption
                <span className="text-xs font-normal text-neutral-400">
                  Optional — describe this work.
                </span>
                <input
                  className="rounded-2xl border p-3 font-normal"
                  disabled={isSaving}
                  placeholder="e.g. Classic fade haircut"
                  value={form.caption}
                  onChange={(e) => updateForm("caption", e.target.value)}
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                Category
                <span className="text-xs font-normal text-neutral-400">
                  Optional — e.g. Haircut, Beard, Color.
                </span>
                <input
                  className="rounded-2xl border p-3 font-normal"
                  disabled={isSaving}
                  placeholder="e.g. Haircut"
                  value={form.category}
                  onChange={(e) => updateForm("category", e.target.value)}
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold">
                Tags
                <span className="text-xs font-normal text-neutral-400">
                  Optional — comma-separated keywords.
                </span>
                <input
                  className="rounded-2xl border p-3 font-normal"
                  disabled={isSaving}
                  placeholder="e.g. fade, classic, short"
                  value={form.tags}
                  onChange={(e) => updateForm("tags", e.target.value)}
                />
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-neutral-200 p-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                  disabled={isSaving}
                  checked={form.isPublic}
                  onChange={(e) => updateForm("isPublic", e.target.checked)}
                />
                <div>
                  <span className="text-sm font-semibold text-neutral-900">
                    Public
                  </span>
                  <p className="text-xs text-neutral-500">
                    Show this photo on your public profile.
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-neutral-200 p-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                  disabled={isSaving}
                  checked={form.consentConfirmed}
                  onChange={(e) =>
                    updateForm("consentConfirmed", e.target.checked)
                  }
                />
                <div>
                  <span className="text-sm font-semibold text-neutral-900">
                    Client consent confirmed
                  </span>
                  <p className="text-xs text-neutral-500">
                    I have written consent from the client to share these photos
                    publicly.
                  </p>
                </div>
              </label>

              {form.isPublic && !form.consentConfirmed && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Consent confirmation is required when making a photo public.
                  </span>
                </div>
              )}

              {formError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-neutral-100 pt-4">
                <Button
                  disabled={isSaving}
                  onClick={closeModal}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button disabled={isSaving} type="submit">
                  {isSaving
                    ? "Saving..."
                    : editingItem
                      ? "Save changes"
                      : "Add portfolio"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && !isModalOpen && (
        <ConfirmModal
          confirmLabel={isDeleting ? "Deleting..." : "Delete"}
          isSubmitting={isDeleting}
          message="Delete this portfolio item? This action soft-deletes it."
          onClose={closeDeleteConfirmation}
          onConfirm={confirmDelete}
          title="Delete portfolio item"
        />
      )}
    </section>
  );
}
