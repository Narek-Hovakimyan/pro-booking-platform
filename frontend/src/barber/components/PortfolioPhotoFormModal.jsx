import { useRef, useState } from "react";
import { AlertCircle, Image, X } from "lucide-react";

import {
  createPortfolioPhoto,
  updatePortfolioPhoto,
} from "@/shared/api/portfolio";
import { Button } from "@/shared/components/ui/button";
import { getMediaUrl } from "@/shared/utils/media";

function deriveForm(editingItem) {
  if (editingItem) {
    return {
      caption: editingItem.caption || "",
      category: editingItem.category || "",
      tags: Array.isArray(editingItem.tags)
        ? editingItem.tags.join(", ")
        : "",
      isPublic: editingItem.isPublic !== false,
      consentConfirmed: editingItem.consentConfirmed === true,
    };
  }
  return {
    caption: "",
    category: "",
    tags: "",
    isPublic: true,
    consentConfirmed: false,
  };
}

export default function PortfolioPhotoFormModal({
  open,
  editingItem,
  isSaving: parentSaving,
  onSaveComplete,
  onClose,
}) {
  /* ── Form state (initialized from props, key remount resets it) ── */
  const [form, setForm] = useState(() => deriveForm(editingItem));
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  /* ── File upload state ── */
  const [beforeImage, setBeforeImage] = useState(null);
  const [afterImage, setAfterImage] = useState(null);
  const [beforePreview, setBeforePreview] = useState(null);
  const [afterPreview, setAfterPreview] = useState(null);
  const beforeFileInputRef = useRef(null);
  const afterFileInputRef = useRef(null);

  /* ── Internal close (guards isSaving) ── */
  const handleClose = () => {
    if (isSaving || parentSaving) return;
    revokePreviews();
    onClose();
  };

  const revokePreviews = () => {
    if (beforePreview) URL.revokeObjectURL(beforePreview);
    if (afterPreview) URL.revokeObjectURL(afterPreview);
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
    if (isSaving || parentSaving) return;
    if (!validateForm()) return;

    setIsSaving(true);
    setFormError("");

    try {
      if (editingItem) {
        const editId = editingItem._id || editingItem.id;
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
        revokePreviews();
        onSaveComplete(updated);
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
        revokePreviews();
        onSaveComplete(created);
      }
    } catch (err) {
      setFormError(
        err.response?.data?.message || "Could not save portfolio item"
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  return (
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
            disabled={isSaving || parentSaving}
            onClick={handleClose}
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
                  disabled={isSaving || parentSaving}
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
                      disabled={isSaving || parentSaving}
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
                  disabled={isSaving || parentSaving}
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
                  disabled={isSaving || parentSaving}
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
                      disabled={isSaving || parentSaving}
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
                  disabled={isSaving || parentSaving}
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
              disabled={isSaving || parentSaving}
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
              disabled={isSaving || parentSaving}
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
              disabled={isSaving || parentSaving}
              placeholder="e.g. fade, classic, short"
              value={form.tags}
              onChange={(e) => updateForm("tags", e.target.value)}
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-neutral-200 p-3">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
              disabled={isSaving || parentSaving}
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
              disabled={isSaving || parentSaving}
              checked={form.consentConfirmed}
              onChange={(e) => updateForm("consentConfirmed", e.target.checked)}
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
              disabled={isSaving || parentSaving}
              onClick={handleClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isSaving || parentSaving} type="submit">
              {isSaving || parentSaving
                ? "Saving..."
                : editingItem
                  ? "Save changes"
                  : "Add portfolio"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
